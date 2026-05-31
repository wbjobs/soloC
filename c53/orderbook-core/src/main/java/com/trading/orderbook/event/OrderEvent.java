package com.trading.orderbook.event;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Data
@NoArgsConstructor
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "eventType")
@JsonSubTypes({
    @JsonSubTypes.Type(value = OrderCreatedEvent.class, name = "ORDER_CREATED"),
    @JsonSubTypes.Type(value = OrderMatchedEvent.class, name = "ORDER_MATCHED"),
    @JsonSubTypes.Type(value = OrderCancelledEvent.class, name = "ORDER_CANCELLED")
})
public abstract class OrderEvent {
    private String eventId;
    private Instant timestamp;
    private String orderId;
    private String symbol;

    protected OrderEvent(String orderId, String symbol) {
        this.eventId = UUID.randomUUID().toString();
        this.timestamp = Instant.now();
        this.orderId = orderId;
        this.symbol = symbol;
    }

    public abstract String getEventType();
}
