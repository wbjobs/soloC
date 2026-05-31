package com.trading.orderbook.event;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class OrderCancelledEvent extends OrderEvent {
    private String traderId;
    private OrderCreatedEvent.OrderSide side;
    private BigDecimal price;
    private BigDecimal cancelledQuantity;

    public OrderCancelledEvent(String orderId, String symbol, String traderId,
                              OrderCreatedEvent.OrderSide side, BigDecimal price,
                              BigDecimal cancelledQuantity) {
        super(orderId, symbol);
        this.traderId = traderId;
        this.side = side;
        this.price = price;
        this.cancelledQuantity = cancelledQuantity;
    }

    @Override
    public String getEventType() {
        return "ORDER_CANCELLED";
    }
}
