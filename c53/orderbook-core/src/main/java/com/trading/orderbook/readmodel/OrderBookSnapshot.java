package com.trading.orderbook.readmodel;

import com.trading.orderbook.event.OrderCreatedEvent;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.ReentrantReadWriteLock;

@Slf4j
@Data
public class OrderBookSnapshot {
    private final String symbol;
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    
    private final NavigableMap<BigDecimal, PriceLevel> bids = new ConcurrentSkipListMap<>(Collections.reverseOrder());
    private final NavigableMap<BigDecimal, PriceLevel> asks = new ConcurrentSkipListMap<>();
    private final Map<String, OrderEntry> orderMap = new HashMap<>();
    
    private final AtomicLong lastProcessedOffset = new AtomicLong(-1);
    private final Set<String> processedEventIds = Collections.newSetFromMap(new LinkedHashMap<String, Boolean>() {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Boolean> eldest) {
            return size() > 10000;
        }
    });
    
    private final Map<String, List<PendingEvent>> pendingEvents = new HashMap<>();
    private static final int MAX_PENDING_EVENTS = 1000;

    public OrderBookSnapshot(String symbol) {
        this.symbol = symbol;
    }

    public boolean isEventProcessed(String eventId) {
        return processedEventIds.contains(eventId);
    }

    public void markEventProcessed(String eventId) {
        processedEventIds.add(eventId);
    }

    public void updateLastOffset(long offset) {
        lastProcessedOffset.set(offset);
    }

    public void addOrder(OrderEntry order) {
        lock.writeLock().lock();
        try {
            orderMap.put(order.getOrderId(), order);
            PriceLevel level = getOrCreatePriceLevel(order.getSide(), order.getPrice());
            level.addOrder(order);
            
            processPendingEvents(order.getOrderId());
        } finally {
            lock.writeLock().unlock();
        }
    }

    public void matchOrder(String buyOrderId, String sellOrderId, BigDecimal matchQty, BigDecimal matchPrice) {
        lock.writeLock().lock();
        try {
            OrderEntry buyOrder = orderMap.get(buyOrderId);
            OrderEntry sellOrder = orderMap.get(sellOrderId);
            
            if (buyOrder == null) {
                log.warn("Buy order {} not found, queueing match event", buyOrderId);
                queuePendingEvent(buyOrderId, new PendingEvent(PendingEventType.MATCH, sellOrderId, matchQty, matchPrice));
                return;
            }
            
            if (sellOrder == null) {
                log.warn("Sell order {} not found, queueing match event", sellOrderId);
                queuePendingEvent(sellOrderId, new PendingEvent(PendingEventType.MATCH, buyOrderId, matchQty, matchPrice));
                return;
            }
            
            applyMatch(buyOrder, sellOrder, matchQty);
        } finally {
            lock.writeLock().unlock();
        }
    }

    public void cancelOrder(String orderId, BigDecimal cancelledQty) {
        lock.writeLock().lock();
        try {
            OrderEntry order = orderMap.get(orderId);
            if (order == null) {
                log.warn("Order {} not found for cancellation, queueing event", orderId);
                queuePendingEvent(orderId, new PendingEvent(PendingEventType.CANCEL, null, cancelledQty, null));
                return;
            }
            
            order.reduceQuantity(cancelledQty);
            if (order.getRemainingQuantity().compareTo(BigDecimal.ZERO) <= 0) {
                removeOrder(order);
            }
        } finally {
            lock.writeLock().unlock();
        }
    }

    private void applyMatch(OrderEntry buyOrder, OrderEntry sellOrder, BigDecimal matchQty) {
        buyOrder.reduceQuantity(matchQty);
        sellOrder.reduceQuantity(matchQty);
        
        if (buyOrder.isFilled()) {
            removeOrder(buyOrder);
        }
        
        if (sellOrder.isFilled()) {
            removeOrder(sellOrder);
        }
    }

    private void removeOrder(OrderEntry order) {
        orderMap.remove(order.getOrderId());
        PriceLevel level = getPriceLevel(order.getSide(), order.getPrice());
        if (level != null) {
            level.removeOrder(order.getOrderId());
            if (level.isEmpty()) {
                removePriceLevel(order.getSide(), order.getPrice());
            }
        }
    }

    private void queuePendingEvent(String orderId, PendingEvent event) {
        List<PendingEvent> events = pendingEvents.computeIfAbsent(orderId, k -> new ArrayList<>());
        events.add(event);
        
        if (events.size() > MAX_PENDING_EVENTS) {
            events.remove(0);
            log.warn("Pending events for {} exceeded limit, oldest removed", orderId);
        }
    }

    private void processPendingEvents(String orderId) {
        List<PendingEvent> events = pendingEvents.remove(orderId);
        if (events == null || events.isEmpty()) {
            return;
        }
        
        log.info("Processing {} pending events for order {}", events.size(), orderId);
        
        OrderEntry order = orderMap.get(orderId);
        if (order == null) {
            return;
        }
        
        for (PendingEvent event : events) {
            switch (event.getType()) {
                case MATCH:
                    OrderEntry otherOrder = orderMap.get(event.getOtherOrderId());
                    if (otherOrder != null) {
                        if (order.getSide() == OrderCreatedEvent.OrderSide.BUY) {
                            applyMatch(order, otherOrder, event.getMatchQty());
                        } else {
                            applyMatch(otherOrder, order, event.getMatchQty());
                        }
                    }
                    break;
                case CANCEL:
                    order.reduceQuantity(event.getMatchQty());
                    if (order.getRemainingQuantity().compareTo(BigDecimal.ZERO) <= 0) {
                        removeOrder(order);
                    }
                    break;
            }
        }
    }

    private PriceLevel getOrCreatePriceLevel(OrderCreatedEvent.OrderSide side, BigDecimal price) {
        NavigableMap<BigDecimal, PriceLevel> map = side == OrderCreatedEvent.OrderSide.BUY ? bids : asks;
        return map.computeIfAbsent(price, k -> new PriceLevel(price));
    }

    private PriceLevel getPriceLevel(OrderCreatedEvent.OrderSide side, BigDecimal price) {
        NavigableMap<BigDecimal, PriceLevel> map = side == OrderCreatedEvent.OrderSide.BUY ? bids : asks;
        return map.get(price);
    }

    private void removePriceLevel(OrderCreatedEvent.OrderSide side, BigDecimal price) {
        NavigableMap<BigDecimal, PriceLevel> map = side == OrderCreatedEvent.OrderSide.BUY ? bids : asks;
        map.remove(price);
    }

    public OrderBookView getView() {
        lock.readLock().lock();
        try {
            return new OrderBookView(this);
        } finally {
            lock.readLock().unlock();
        }
    }

    public SnapshotValidation validateIntegrity() {
        lock.readLock().lock();
        try {
            SnapshotValidation validation = new SnapshotValidation();
            validation.setSymbol(symbol);
            
            Map<String, OrderEntry> allOrders = new HashMap<>();
            
            for (PriceLevel level : bids.values()) {
                for (OrderEntry order : level.getOrders()) {
                    if (allOrders.containsKey(order.getOrderId())) {
                        validation.addError("Duplicate order in bids: " + order.getOrderId());
                    }
                    allOrders.put(order.getOrderId(), order);
                    
                    if (order.getSide() != OrderCreatedEvent.OrderSide.BUY) {
                        validation.addError("Wrong side for buy order: " + order.getOrderId());
                    }
                }
            }
            
            for (PriceLevel level : asks.values()) {
                for (OrderEntry order : level.getOrders()) {
                    if (allOrders.containsKey(order.getOrderId())) {
                        validation.addError("Duplicate order in asks: " + order.getOrderId());
                    }
                    allOrders.put(order.getOrderId(), order);
                    
                    if (order.getSide() != OrderCreatedEvent.OrderSide.SELL) {
                        validation.addError("Wrong side for sell order: " + order.getOrderId());
                    }
                }
            }
            
            for (OrderEntry order : orderMap.values()) {
                if (!allOrders.containsKey(order.getOrderId())) {
                    validation.addError("Order in map but not in price levels: " + order.getOrderId());
                }
            }
            
            if (!pendingEvents.isEmpty()) {
                validation.setWarning("Pending events count: " + pendingEvents.size());
            }
            
            validation.setValid(validation.getErrors().isEmpty());
            validation.setTotalOrders(allOrders.size());
            return validation;
        } finally {
            lock.readLock().unlock();
        }
    }

    @Data
    public static class OrderEntry {
        private final String orderId;
        private final String traderId;
        private final OrderCreatedEvent.OrderSide side;
        private final BigDecimal price;
        private final BigDecimal quantity;
        private BigDecimal remainingQuantity;
        private final Instant createdAt;

        public OrderEntry(String orderId, String traderId, OrderCreatedEvent.OrderSide side,
                         BigDecimal price, BigDecimal quantity) {
            this.orderId = orderId;
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

    @Data
    public static class PriceLevel {
        private final BigDecimal price;
        private final List<OrderEntry> orders = new ArrayList<>();
        private BigDecimal totalQuantity = BigDecimal.ZERO;

        public PriceLevel(BigDecimal price) {
            this.price = price;
        }

        public void addOrder(OrderEntry order) {
            orders.add(order);
            recalculateQuantity();
        }

        public void removeOrder(String orderId) {
            orders.removeIf(o -> o.getOrderId().equals(orderId));
            recalculateQuantity();
        }

        private void recalculateQuantity() {
            totalQuantity = orders.stream()
                    .map(OrderEntry::getRemainingQuantity)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        public boolean isEmpty() {
            return orders.isEmpty();
        }
    }

    @Data
    public static class PendingEvent {
        private final PendingEventType type;
        private final String otherOrderId;
        private final BigDecimal matchQty;
        private final BigDecimal matchPrice;
    }

    public enum PendingEventType {
        MATCH, CANCEL
    }

    public static class OrderBookView {
        private final String symbol;
        private final List<PriceLevelView> bids;
        private final List<PriceLevelView> asks;

        public OrderBookView(OrderBookSnapshot snapshot) {
            this.symbol = snapshot.getSymbol();
            this.bids = snapshot.getBids().values().stream()
                    .map(PriceLevelView::new)
                    .toList();
            this.asks = snapshot.getAsks().values().stream()
                    .map(PriceLevelView::new)
                    .toList();
        }

        public String getSymbol() { return symbol; }
        public List<PriceLevelView> getBids() { return bids; }
        public List<PriceLevelView> getAsks() { return asks; }
    }

    public static class PriceLevelView {
        private final BigDecimal price;
        private final BigDecimal totalQuantity;
        private final int orderCount;

        public PriceLevelView(PriceLevel level) {
            this.price = level.getPrice();
            this.totalQuantity = level.getTotalQuantity();
            this.orderCount = level.getOrders().size();
        }

        public BigDecimal getPrice() { return price; }
        public BigDecimal getTotalQuantity() { return totalQuantity; }
        public int getOrderCount() { return orderCount; }
    }

    @Data
    public static class SnapshotValidation {
        private String symbol;
        private boolean valid;
        private int totalOrders;
        private List<String> errors = new ArrayList<>();
        private String warning;

        public void addError(String error) {
            errors.add(error);
        }
    }
}
