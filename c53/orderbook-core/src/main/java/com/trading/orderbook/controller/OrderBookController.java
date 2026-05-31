package com.trading.orderbook.controller;

import com.trading.orderbook.consumer.OrderEventConsumer;
import com.trading.orderbook.engine.OrderBook;
import com.trading.orderbook.event.OrderCreatedEvent;
import com.trading.orderbook.event.OrderMatchedEvent;
import com.trading.orderbook.model.Order;
import com.trading.orderbook.producer.OrderEventProducer;
import com.trading.orderbook.readmodel.OrderBookSnapshot;
import com.trading.orderbook.readmodel.TraderHistoryProjector;
import com.trading.orderbook.readmodel.TraderOrderView;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/orderbook")
@RequiredArgsConstructor
public class OrderBookController {

    private final OrderEventProducer eventProducer;
    private final OrderEventConsumer eventConsumer;
    private final TraderHistoryProjector traderHistoryProjector;
    private final Map<String, OrderBook> writeModelOrderBooks = new ConcurrentHashMap<>();

    @PostMapping("/orders")
    public ResponseEntity<OrderResponse> createOrder(@RequestBody OrderRequest request) {
        String orderId = UUID.randomUUID().toString();
        String symbol = request.getSymbol();
        
        Order order = new Order(
            orderId,
            symbol,
            request.getTraderId(),
            request.getSide(),
            request.getPrice(),
            request.getQuantity()
        );
        
        OrderCreatedEvent createdEvent = new OrderCreatedEvent(
            orderId,
            symbol,
            request.getTraderId(),
            request.getSide(),
            request.getPrice(),
            request.getQuantity()
        );
        eventProducer.publish(createdEvent);
        
        OrderBook orderBook = writeModelOrderBooks.computeIfAbsent(symbol, OrderBook::new);
        List<OrderMatchedEvent> matchEvents = orderBook.addOrder(order);
        
        for (OrderMatchedEvent matchEvent : matchEvents) {
            eventProducer.publish(matchEvent);
        }
        
        return ResponseEntity.ok(new OrderResponse(
            orderId,
            symbol,
            request.getSide(),
            request.getPrice(),
            request.getQuantity(),
            order.getRemainingQuantity(),
            matchEvents.size()
        ));
    }

    @GetMapping("/{symbol}")
    public ResponseEntity<OrderBookSnapshot.OrderBookView> getOrderBook(@PathVariable String symbol) {
        OrderBookSnapshot.OrderBookView view = eventConsumer.getOrderBook(symbol);
        if (view == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(view);
    }

    @GetMapping("/{symbol}/validate")
    public ResponseEntity<OrderBookSnapshot.SnapshotValidation> validateOrderBook(@PathVariable String symbol) {
        OrderBookSnapshot snapshot = eventConsumer.getSnapshot(symbol);
        if (snapshot == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(snapshot.validateIntegrity());
    }

    @GetMapping("/traders/{traderId}/history")
    public ResponseEntity<TraderOrderView.TraderHistoryView> getTraderHistory(@PathVariable String traderId) {
        TraderOrderView.TraderHistoryView history = traderHistoryProjector.getTraderHistory(traderId);
        if (history == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(history);
    }

    @GetMapping("/traders/{traderId}/orders")
    public ResponseEntity<List<TraderOrderView.OrderRecordView>> getTraderOrders(
            @PathVariable String traderId,
            @RequestParam(required = false, defaultValue = "false") boolean activeOnly) {
        TraderOrderView.TraderHistoryView history = traderHistoryProjector.getTraderHistory(traderId);
        if (history == null) {
            return ResponseEntity.notFound().build();
        }
        
        List<TraderOrderView.OrderRecordView> orders = activeOnly 
                ? history.getActiveOrders() 
                : history.getOrderHistory();
        return ResponseEntity.ok(orders);
    }

    @GetMapping("/traders/{traderId}/trades")
    public ResponseEntity<List<TraderOrderView.TradeRecordView>> getTraderTrades(
            @PathVariable String traderId,
            @RequestParam(required = false) String symbol) {
        TraderOrderView.TraderHistoryView history = traderHistoryProjector.getTraderHistory(traderId);
        if (history == null) {
            return ResponseEntity.notFound().build();
        }
        
        List<TraderOrderView.TradeRecordView> trades = history.getTradeHistory();
        if (symbol != null) {
            trades = trades.stream()
                    .filter(t -> t.getSymbol().equals(symbol))
                    .toList();
        }
        return ResponseEntity.ok(trades);
    }

    @GetMapping("/traders/{traderId}/summary")
    public ResponseEntity<TraderOrderView.TradeSummary> getTraderSummary(@PathVariable String traderId) {
        TraderOrderView.TraderHistoryView history = traderHistoryProjector.getTraderHistory(traderId);
        if (history == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(history.getSummary());
    }

    @Data
    public static class OrderRequest {
        private String symbol;
        private String traderId;
        private OrderCreatedEvent.OrderSide side;
        private BigDecimal price;
        private BigDecimal quantity;
    }

    @Data
    public static class OrderResponse {
        private final String orderId;
        private final String symbol;
        private final OrderCreatedEvent.OrderSide side;
        private final BigDecimal price;
        private final BigDecimal quantity;
        private final BigDecimal remainingQuantity;
        private final int matchCount;
    }
}
