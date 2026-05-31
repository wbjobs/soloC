package com.trading.orderbook.readmodel;

import com.trading.orderbook.event.OrderCreatedEvent;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantReadWriteLock;

@Data
public class TraderOrderView {
    private final String traderId;
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    
    private final Map<String, OrderRecord> activeOrders = new ConcurrentHashMap<>();
    private final Map<String, OrderRecord> historicalOrders = new ConcurrentHashMap<>();
    private final List<TradeRecord> tradeHistory = new ArrayList<>();

    public TraderOrderView(String traderId) {
        this.traderId = traderId;
    }

    public void addOrder(OrderRecord order) {
        lock.writeLock().lock();
        try {
            activeOrders.put(order.getOrderId(), order);
            historicalOrders.put(order.getOrderId(), order);
        } finally {
            lock.writeLock().unlock();
        }
    }

    public void recordTrade(TradeRecord trade) {
        lock.writeLock().lock();
        try {
            tradeHistory.add(trade);
            
            OrderRecord order = activeOrders.get(trade.getOrderId());
            if (order != null) {
                order.addFilledQuantity(trade.getQuantity());
                if (order.isFullyFilled()) {
                    order.setStatus(OrderStatus.FILLED);
                    activeOrders.remove(trade.getOrderId());
                }
            }
        } finally {
            lock.writeLock().unlock();
        }
    }

    public void cancelOrder(String orderId, BigDecimal cancelledQuantity) {
        lock.writeLock().lock();
        try {
            OrderRecord order = activeOrders.get(orderId);
            if (order != null) {
                order.setCancelledQuantity(cancelledQuantity);
                order.setStatus(OrderStatus.CANCELLED);
                activeOrders.remove(orderId);
            }
        } finally {
            lock.writeLock().unlock();
        }
    }

    public TraderHistoryView getHistoryView() {
        lock.readLock().lock();
        try {
            return new TraderHistoryView(this);
        } finally {
            lock.readLock().unlock();
        }
    }

    @Data
    public static class OrderRecord {
        private final String orderId;
        private final String symbol;
        private final OrderCreatedEvent.OrderSide side;
        private final BigDecimal price;
        private final BigDecimal originalQuantity;
        private BigDecimal filledQuantity = BigDecimal.ZERO;
        private BigDecimal cancelledQuantity = BigDecimal.ZERO;
        private OrderStatus status;
        private final Instant createdAt;

        public OrderRecord(String orderId, String symbol, OrderCreatedEvent.OrderSide side,
                          BigDecimal price, BigDecimal originalQuantity) {
            this.orderId = orderId;
            this.symbol = symbol;
            this.side = side;
            this.price = price;
            this.originalQuantity = originalQuantity;
            this.status = OrderStatus.ACTIVE;
            this.createdAt = Instant.now();
        }

        public void addFilledQuantity(BigDecimal amount) {
            this.filledQuantity = this.filledQuantity.add(amount);
        }

        public boolean isFullyFilled() {
            return filledQuantity.compareTo(originalQuantity) >= 0;
        }

        public BigDecimal getRemainingQuantity() {
            return originalQuantity.subtract(filledQuantity).subtract(cancelledQuantity);
        }
    }

    @Data
    public static class TradeRecord {
        private final String tradeId;
        private final String orderId;
        private final String symbol;
        private final OrderCreatedEvent.OrderSide side;
        private final BigDecimal price;
        private final BigDecimal quantity;
        private final String counterpartyTraderId;
        private final Instant tradedAt;

        public BigDecimal getTradeValue() {
            return price.multiply(quantity);
        }
    }

    public enum OrderStatus {
        ACTIVE, PARTIALLY_FILLED, FILLED, CANCELLED
    }

    @Data
    public static class TraderHistoryView {
        private final String traderId;
        private final List<OrderRecordView> activeOrders;
        private final List<OrderRecordView> orderHistory;
        private final List<TradeRecordView> tradeHistory;
        private final TradeSummary summary;

        public TraderHistoryView(TraderOrderView view) {
            this.traderId = view.getTraderId();
            this.activeOrders = view.getActiveOrders().values().stream()
                    .map(OrderRecordView::new)
                    .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                    .toList();
            this.orderHistory = view.getHistoricalOrders().values().stream()
                    .map(OrderRecordView::new)
                    .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                    .toList();
            this.tradeHistory = view.getTradeHistory().stream()
                    .map(TradeRecordView::new)
                    .sorted((a, b) -> b.getTradedAt().compareTo(a.getTradedAt()))
                    .toList();
            this.summary = new TradeSummary(view);
        }
    }

    @Data
    public static class OrderRecordView {
        private final String orderId;
        private final String symbol;
        private final OrderCreatedEvent.OrderSide side;
        private final BigDecimal price;
        private final BigDecimal originalQuantity;
        private final BigDecimal filledQuantity;
        private final BigDecimal cancelledQuantity;
        private final BigDecimal remainingQuantity;
        private final OrderStatus status;
        private final Instant createdAt;

        public OrderRecordView(OrderRecord record) {
            this.orderId = record.getOrderId();
            this.symbol = record.getSymbol();
            this.side = record.getSide();
            this.price = record.getPrice();
            this.originalQuantity = record.getOriginalQuantity();
            this.filledQuantity = record.getFilledQuantity();
            this.cancelledQuantity = record.getCancelledQuantity();
            this.remainingQuantity = record.getRemainingQuantity();
            this.status = record.getStatus();
            this.createdAt = record.getCreatedAt();
        }
    }

    @Data
    public static class TradeRecordView {
        private final String tradeId;
        private final String orderId;
        private final String symbol;
        private final OrderCreatedEvent.OrderSide side;
        private final BigDecimal price;
        private final BigDecimal quantity;
        private final BigDecimal tradeValue;
        private final String counterpartyTraderId;
        private final Instant tradedAt;

        public TradeRecordView(TradeRecord record) {
            this.tradeId = record.getTradeId();
            this.orderId = record.getOrderId();
            this.symbol = record.getSymbol();
            this.side = record.getSide();
            this.price = record.getPrice();
            this.quantity = record.getQuantity();
            this.tradeValue = record.getTradeValue();
            this.counterpartyTraderId = record.getCounterpartyTraderId();
            this.tradedAt = record.getTradedAt();
        }
    }

    @Data
    public static class TradeSummary {
        private final int totalOrders;
        private final int activeOrdersCount;
        private final int totalTrades;
        private final BigDecimal totalBuyVolume;
        private final BigDecimal totalSellVolume;
        private final BigDecimal totalTurnover;

        public TradeSummary(TraderOrderView view) {
            this.totalOrders = view.getHistoricalOrders().size();
            this.activeOrdersCount = view.getActiveOrders().size();
            this.totalTrades = view.getTradeHistory().size();
            
            BigDecimal buyVol = BigDecimal.ZERO;
            BigDecimal sellVol = BigDecimal.ZERO;
            BigDecimal turnover = BigDecimal.ZERO;
            
            for (TradeRecord trade : view.getTradeHistory()) {
                if (trade.getSide() == OrderCreatedEvent.OrderSide.BUY) {
                    buyVol = buyVol.add(trade.getQuantity());
                } else {
                    sellVol = sellVol.add(trade.getQuantity());
                }
                turnover = turnover.add(trade.getTradeValue());
            }
            
            this.totalBuyVolume = buyVol;
            this.totalSellVolume = sellVol;
            this.totalTurnover = turnover;
        }
    }
}
