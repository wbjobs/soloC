package com.trading.orderbook.event;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class OrderCreatedEvent extends OrderEvent {
    private String traderId;
    private OrderSide side;
    private BigDecimal price;
    private BigDecimal quantity;
    private BigDecimal remainingQuantity;

    public OrderCreatedEvent(String orderId, String symbol, String traderId, 
                            OrderSide side, BigDecimal price, BigDecimal quantity) {
        super(orderId, symbol);
        this.traderId = traderId;
        this.side = side;
        this.price = price;
        this.quantity = quantity;
        this.remainingQuantity = quantity;
    }

    @Override
    public String getEventType() {
        return "ORDER_CREATED";
    }

    public enum OrderSide {
        BUY, SELL
    }
}
