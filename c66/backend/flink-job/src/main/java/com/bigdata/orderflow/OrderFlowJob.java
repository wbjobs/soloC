package com.bigdata.orderflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.api.common.eventtime.*;
import org.apache.flink.api.common.functions.AggregateFunction;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;
import redis.clients.jedis.Jedis;

import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;

public class OrderFlowJob {

    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final Duration OUT_OF_ORDERNESS = Duration.ofSeconds(3);

    public static void main(String[] args) throws Exception {
        final StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers("localhost:9092")
                .setTopics("level2_data")
                .setGroupId("flink-orderflow-group")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        WatermarkStrategy<String> watermarkStrategy = WatermarkStrategy
                .<String>forBoundedOutOfOrderness(OUT_OF_ORDERNESS)
                .withIdleness(Duration.ofSeconds(5))
                .withTimestampAssigner((event, timestamp) -> {
                    try {
                        Order order = objectMapper.readValue(event, Order.class);
                        if (order != null && order.getTimestamp() != null) {
                            return Instant.parse(order.getTimestamp()).toEpochMilli();
                        }
                    } catch (Exception e) {
                    }
                    return System.currentTimeMillis();
                });

        DataStream<String> kafkaStream = env.fromSource(
                source,
                watermarkStrategy,
                "Kafka Source"
        );

        DataStream<Order> orderStream = kafkaStream.map(json -> {
            try {
                return objectMapper.readValue(json, Order.class);
            } catch (Exception e) {
                return null;
            }
        }).filter(order -> order != null);

        DataStream<FactorResult> factorStream = orderStream
                .keyBy(Order::getSymbol)
                .window(TumblingEventTimeWindows.of(Time.seconds(1)))
                .allowedLateness(Time.seconds(2))
                .sideOutputLateData(new org.apache.flink.util.OutputTag<Order>("late-orders") {})
                .aggregate(new FactorAggregator(), new FactorWindowFunction());

        factorStream.addSink(result -> {
            try (Jedis jedis = new Jedis("localhost", 6379)) {
                String key = "factors:" + result.getSymbol();
                String value = objectMapper.writeValueAsString(result);
                jedis.lpush(key, value);
                jedis.ltrim(key, 0, 300);
            } catch (Exception e) {
                e.printStackTrace();
            }
        });

        factorStream.print();

        env.execute("Order Flow Factor Calculation");
    }

    public static class FactorAggregator implements AggregateFunction<Order, FactorAccumulator, FactorResult> {

        @Override
        public FactorAccumulator createAccumulator() {
            return new FactorAccumulator();
        }

        @Override
        public FactorAccumulator add(Order order, FactorAccumulator acc) {
            double amount = order.getPrice() * order.getQuantity();
            if ("buy".equals(order.getSide())) {
                acc.buyPressure += amount;
                if (order.getQuantity() >= 10) {
                    acc.largeOrderBuy += amount;
                }
            } else {
                acc.sellPressure += amount;
                if (order.getQuantity() >= 10) {
                    acc.largeOrderSell += amount;
                }
            }
            acc.count++;
            acc.symbol = order.getSymbol();
            return acc;
        }

        @Override
        public FactorResult getResult(FactorAccumulator acc) {
            FactorResult result = new FactorResult();
            result.setSymbol(acc.symbol);
            result.setBuyPressure(acc.buyPressure);
            result.setSellPressure(acc.sellPressure);
            double total = acc.buyPressure + acc.sellPressure;
            result.setNetFlow(total > 0 ? (acc.buyPressure - acc.sellPressure) / total : 0);
            double largeTotal = acc.largeOrderBuy + acc.largeOrderSell;
            result.setLargeOrderNetFlow(largeTotal > 0 ? (acc.largeOrderBuy - acc.largeOrderSell) / largeTotal : 0);
            return result;
        }

        @Override
        public FactorAccumulator merge(FactorAccumulator a, FactorAccumulator b) {
            FactorAccumulator merged = new FactorAccumulator();
            merged.buyPressure = a.buyPressure + b.buyPressure;
            merged.sellPressure = a.sellPressure + b.sellPressure;
            merged.largeOrderBuy = a.largeOrderBuy + b.largeOrderBuy;
            merged.largeOrderSell = a.largeOrderSell + b.largeOrderSell;
            merged.count = a.count + b.count;
            merged.symbol = a.symbol;
            return merged;
        }
    }

    public static class FactorAccumulator {
        public String symbol;
        public double buyPressure = 0;
        public double sellPressure = 0;
        public double largeOrderBuy = 0;
        public double largeOrderSell = 0;
        public long count = 0;
    }

    public static class FactorWindowFunction extends ProcessWindowFunction<FactorResult, FactorResult, String, TimeWindow> {
        @Override
        public void process(String key, Context context, Iterable<FactorResult> elements, Collector<FactorResult> out) {
            for (FactorResult result : elements) {
                result.setWindowStart(context.window().getStart());
                result.setWindowEnd(context.window().getEnd());
                result.setTimestamp(Instant.ofEpochMilli(context.window().getEnd()).toString());
                out.collect(result);
            }
        }
    }
}
