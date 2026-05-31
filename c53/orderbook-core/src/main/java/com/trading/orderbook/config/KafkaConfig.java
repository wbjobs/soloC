package com.trading.orderbook.config;

import com.trading.orderbook.event.OrderEvent;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.support.converter.RecordMessageConverter;
import org.springframework.kafka.support.converter.StringJsonMessageConverter;

@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.topic.orders}")
    private String topic;

    @Bean
    public NewTopic orderEventsTopic() {
        return TopicBuilder.name(topic)
                .partitions(3)
                .replicas(1)
                .build();
    }

    @Bean
    public RecordMessageConverter converter() {
        return new StringJsonMessageConverter();
    }
}
