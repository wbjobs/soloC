package com.trading.orderbook;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;

@SpringBootApplication
@EnableKafka
public class OrderbookApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderbookApplication.class, args);
    }
}
