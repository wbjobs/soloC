package com.trading.orderbook.model;

import com.trading.orderbook.event.OrderCreatedEvent;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;

@Data
public class Order {
    private String orderId;
    private String symbol;
    private String traderId;
    private OrderCreatedEvent.OrderSide side;
    private BigDecimal price;
    private BigDecimal quantity;
    private BigDecimal remainingQuantity;
    private Instant createdAt;

    public Order(String orderId, String symbol, String traderId,
                 OrderCreatedEvent.OrderSide side, BigDecimal price, BigDecimal quantity) {
        this.orderId = orderId;
        this.symbol = symbol;
        this.traderId = traderId;
        this.side = side;
        this.price = price;
        this.quantity = quantity;
        this.remainingQuantity = quantity;
        this.createdAt = Instant.now();
    }

    public boolean isFilled() {
        return remainingQuantity.compareTo(BigDecimal.ZERO) <= 0;
    }

    public void reduceQuantity(BigDecimal amount) {
        this.remainingQuantity = this.remainingQuantity.subtract(amount);
    }
}
