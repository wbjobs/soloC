package com.trading.orderbook.producer;

import com.trading.orderbook.event.OrderEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventProducer {

    private final KafkaTemplate<String, OrderEvent> kafkaTemplate;

    @Value("${spring.kafka.topic.orders}")
    private String topic;

    public void publish(OrderEvent event) {
        log.debug("Publishing event: {} for order: {}", event.getEventType(), event.getOrderId());
        kafkaTemplate.send(topic, event.getSymbol(), event);
    }
}
