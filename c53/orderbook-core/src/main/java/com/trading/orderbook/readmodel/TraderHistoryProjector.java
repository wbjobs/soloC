package com.trading.orderbook.readmodel;

import com.trading.orderbook.event.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

@Slf4j
@Component
@RequiredArgsConstructor
public class TraderHistoryProjector {

    private final Map<String, TraderOrderView> traderViews = new ConcurrentHashMap<>();
    private final Map<String, ReentrantLock> traderLocks = new ConcurrentHashMap<>();
    private final Map<String, String> orderToTraderMap = new ConcurrentHashMap<>();

    @KafkaListener(
        topics = "${spring.kafka.topic.orders}",
        groupId = "trader-history-projector",
        concurrency = "3"
    )
    public void processEvent(ConsumerRecord<String, OrderEvent> record, Acknowledgment ack) {
        OrderEvent event = record.value();
        
        switch (event.getEventType()) {
            case "ORDER_CREATED":
                handleOrderCreated((OrderCreatedEvent) event);
                break;
            case "ORDER_MATCHED":
                handleOrderMatched((OrderMatchedEvent) event);
                break;
            case "ORDER_CANCELLED":
                handleOrderCancelled((OrderCancelledEvent) event);
                break;
            default:
                log.warn("Unknown event type: {}", event.getEventType());
        }
        
        ack.acknowledge();
    }

    private void handleOrderCreated(OrderCreatedEvent event) {
        String traderId = event.getTraderId();
        ReentrantLock lock = getTraderLock(traderId);
        
        lock.lock();
        try {
            TraderOrderView view = getOrCreateTraderView(traderId);
            
            TraderOrderView.OrderRecord orderRecord = new TraderOrderView.OrderRecord(
                event.getOrderId(),
                event.getSymbol(),
                event.getSide(),
                event.getPrice(),
                event.getQuantity()
            );
            
            view.addOrder(orderRecord);
            orderToTraderMap.put(event.getOrderId(), traderId);
            
            log.debug("Projected order {} for trader {}", event.getOrderId(), traderId);
        } finally {
            lock.unlock();
        }
    }

    private void handleOrderMatched(OrderMatchedEvent event) {
        processBuyerTrade(event);
        processSellerTrade(event);
    }

    private void processBuyerTrade(OrderMatchedEvent event) {
        String buyerId = event.getBuyTraderId();
        ReentrantLock lock = getTraderLock(buyerId);
        
        lock.lock();
        try {
            TraderOrderView view = getOrCreateTraderView(buyerId);
            
            TraderOrderView.TradeRecord trade = new TraderOrderView.TradeRecord(
                UUID.randomUUID().toString(),
                event.getBuyOrderId(),
                event.getSymbol(),
                OrderCreatedEvent.OrderSide.BUY,
                event.getMatchPrice(),
                event.getMatchQuantity(),
                event.getSellTraderId(),
                Instant.now()
            );
            
            view.recordTrade(trade);
            log.debug("Projected buy trade for trader {}: {} @ {}", 
                buyerId, event.getMatchQuantity(), event.getMatchPrice());
        } finally {
            lock.unlock();
        }
    }

    private void processSellerTrade(OrderMatchedEvent event) {
        String sellerId = event.getSellTraderId();
        ReentrantLock lock = getTraderLock(sellerId);
        
        lock.lock();
        try {
            TraderOrderView view = getOrCreateTraderView(sellerId);
            
            TraderOrderView.TradeRecord trade = new TraderOrderView.TradeRecord(
                UUID.randomUUID().toString(),
                event.getSellOrderId(),
                event.getSymbol(),
                OrderCreatedEvent.OrderSide.SELL,
                event.getMatchPrice(),
                event.getMatchQuantity(),
                event.getBuyTraderId(),
                Instant.now()
            );
            
            view.recordTrade(trade);
            log.debug("Projected sell trade for trader {}: {} @ {}", 
                sellerId, event.getMatchQuantity(), event.getMatchPrice());
        } finally {
            lock.unlock();
        }
    }

    private void handleOrderCancelled(OrderCancelledEvent event) {
        String traderId = event.getTraderId();
        ReentrantLock lock = getTraderLock(traderId);
        
        lock.lock();
        try {
            TraderOrderView view = getOrCreateTraderView(traderId);
            view.cancelOrder(event.getOrderId(), event.getCancelledQuantity());
            
            log.debug("Projected cancellation for order {}: {}", 
                event.getOrderId(), event.getCancelledQuantity());
        } finally {
            lock.unlock();
        }
    }

    private TraderOrderView getOrCreateTraderView(String traderId) {
        return traderViews.computeIfAbsent(traderId, TraderOrderView::new);
    }

    private ReentrantLock getTraderLock(String traderId) {
        return traderLocks.computeIfAbsent(traderId, k -> new ReentrantLock());
    }

    public TraderOrderView.TraderHistoryView getTraderHistory(String traderId) {
        TraderOrderView view = traderViews.get(traderId);
        return view != null ? view.getHistoryView() : null;
    }

    public boolean hasTraderHistory(String traderId) {
        return traderViews.containsKey(traderId);
    }
}
