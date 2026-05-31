package com.trading.orderbook.consumer;

import com.trading.orderbook.event.*;
import com.trading.orderbook.readmodel.OrderBookSnapshot;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

@Slf4j
@Component
public class OrderEventConsumer {

    private final Map<String, OrderBookSnapshot> orderBooks = new ConcurrentHashMap<>();
    private final Map<String, ReentrantLock> symbolLocks = new ConcurrentHashMap<>();

    @KafkaListener(
        topics = "${spring.kafka.topic.orders}",
        groupId = "${spring.kafka.consumer.group-id}",
        concurrency = "3"
    )
    public void consume(ConsumerRecord<String, OrderEvent> record, Acknowledgment ack) {
        OrderEvent event = record.value();
        String symbol = event.getSymbol();
        
        ReentrantLock symbolLock = getSymbolLock(symbol);
        symbolLock.lock();
        
        try {
            OrderBookSnapshot snapshot = getOrCreateSnapshot(symbol);
            
            if (snapshot.isEventProcessed(event.getEventId())) {
                log.debug("Duplicate event skipped: {}", event.getEventId());
                ack.acknowledge();
                return;
            }
            
            processEvent(event, snapshot);
            snapshot.markEventProcessed(event.getEventId());
            snapshot.updateLastOffset(record.offset());
            
            ack.acknowledge();
            
        } catch (Exception e) {
            log.error("Error processing event: {}", event.getEventId(), e);
            throw e;
        } finally {
            symbolLock.unlock();
        }
    }

    private void processEvent(OrderEvent event, OrderBookSnapshot snapshot) {
        switch (event.getEventType()) {
            case "ORDER_CREATED":
                handleOrderCreated((OrderCreatedEvent) event, snapshot);
                break;
            case "ORDER_MATCHED":
                handleOrderMatched((OrderMatchedEvent) event, snapshot);
                break;
            case "ORDER_CANCELLED":
                handleOrderCancelled((OrderCancelledEvent) event, snapshot);
                break;
            default:
                log.warn("Unknown event type: {}", event.getEventType());
        }
    }

    private void handleOrderCreated(OrderCreatedEvent event, OrderBookSnapshot snapshot) {
        OrderBookSnapshot.OrderEntry order = new OrderBookSnapshot.OrderEntry(
            event.getOrderId(),
            event.getTraderId(),
            event.getSide(),
            event.getPrice(),
            event.getQuantity()
        );
        snapshot.addOrder(order);
        log.debug("Order added to snapshot: {} at price {}", event.getOrderId(), event.getPrice());
    }

    private void handleOrderMatched(OrderMatchedEvent event, OrderBookSnapshot snapshot) {
        snapshot.matchOrder(
            event.getBuyOrderId(),
            event.getSellOrderId(),
            event.getMatchQuantity(),
            event.getMatchPrice()
        );
        log.debug("Match processed: buy={}, sell={}, qty={}", 
            event.getBuyOrderId(), event.getSellOrderId(), event.getMatchQuantity());
    }

    private void handleOrderCancelled(OrderCancelledEvent event, OrderBookSnapshot snapshot) {
        snapshot.cancelOrder(event.getOrderId(), event.getCancelledQuantity());
        log.debug("Order cancelled: {}, qty={}", event.getOrderId(), event.getCancelledQuantity());
    }

    private OrderBookSnapshot getOrCreateSnapshot(String symbol) {
        return orderBooks.computeIfAbsent(symbol, OrderBookSnapshot::new);
    }

    private ReentrantLock getSymbolLock(String symbol) {
        return symbolLocks.computeIfAbsent(symbol, k -> new ReentrantLock());
    }

    public OrderBookSnapshot.OrderBookView getOrderBook(String symbol) {
        OrderBookSnapshot snapshot = orderBooks.get(symbol);
        return snapshot != null ? snapshot.getView() : null;
    }

    public OrderBookSnapshot getSnapshot(String symbol) {
        return orderBooks.get(symbol);
    }
}
