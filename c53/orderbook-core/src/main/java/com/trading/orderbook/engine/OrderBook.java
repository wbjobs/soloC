package com.trading.orderbook.engine;

import com.trading.orderbook.event.OrderCreatedEvent;
import com.trading.orderbook.event.OrderMatchedEvent;
import com.trading.orderbook.model.Order;
import lombok.extern.slf4j.Slf4j;

import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.concurrent.locks.ReentrantLock;

@Slf4j
public class OrderBook {
    private final String symbol;
    private final ReentrantLock lock = new ReentrantLock();
    
    private final NavigableMap<BigDecimal, List<Order>> bids = new ConcurrentSkipListMap<>(Collections.reverseOrder());
    private final NavigableMap<BigDecimal, List<Order>> asks = new ConcurrentSkipListMap<>();
    private final Map<String, Order> orderMap = new HashMap<>();

    public OrderBook(String symbol) {
        this.symbol = symbol;
    }

    public List<OrderMatchedEvent> addOrder(Order order) {
        lock.lock();
        try {
            List<OrderMatchedEvent> events = new ArrayList<>();
            
            if (order.getSide() == OrderCreatedEvent.OrderSide.BUY) {
                events = matchBuyOrder(order);
            } else {
                events = matchSellOrder(order);
            }
            
            if (!order.isFilled()) {
                addToBook(order);
            }
            
            return events;
        } finally {
            lock.unlock();
        }
    }

    private List<OrderMatchedEvent> matchBuyOrder(Order buyOrder) {
        List<OrderMatchedEvent> events = new ArrayList<>();
        
        Iterator<Map.Entry<BigDecimal, List<Order>>> askIterator = asks.entrySet().iterator();
        
        while (askIterator.hasNext() && !buyOrder.isFilled()) {
            Map.Entry<BigDecimal, List<Order>> entry = askIterator.next();
            BigDecimal askPrice = entry.getKey();
            
            if (askPrice.compareTo(buyOrder.getPrice()) > 0) {
                break;
            }
            
            List<Order> askOrders = entry.getValue();
            Iterator<Order> orderIterator = askOrders.iterator();
            
            while (orderIterator.hasNext() && !buyOrder.isFilled()) {
                Order sellOrder = orderIterator.next();
                
                BigDecimal matchQty = buyOrder.getRemainingQuantity()
                        .min(sellOrder.getRemainingQuantity());
                BigDecimal matchPrice = askPrice;
                
                buyOrder.reduceQuantity(matchQty);
                sellOrder.reduceQuantity(matchQty);
                
                OrderMatchedEvent event = new OrderMatchedEvent(
                    symbol,
                    buyOrder.getOrderId(),
                    sellOrder.getOrderId(),
                    buyOrder.getTraderId(),
                    sellOrder.getTraderId(),
                    matchPrice,
                    matchQty
                );
                events.add(event);
                
                if (sellOrder.isFilled()) {
                    orderIterator.remove();
                    orderMap.remove(sellOrder.getOrderId());
                }
            }
            
            if (askOrders.isEmpty()) {
                askIterator.remove();
            }
        }
        
        return events;
    }

    private List<OrderMatchedEvent> matchSellOrder(Order sellOrder) {
        List<OrderMatchedEvent> events = new ArrayList<>();
        
        Iterator<Map.Entry<BigDecimal, List<Order>>> bidIterator = bids.entrySet().iterator();
        
        while (bidIterator.hasNext() && !sellOrder.isFilled()) {
            Map.Entry<BigDecimal, List<Order>> entry = bidIterator.next();
            BigDecimal bidPrice = entry.getKey();
            
            if (bidPrice.compareTo(sellOrder.getPrice()) < 0) {
                break;
            }
            
            List<Order> bidOrders = entry.getValue();
            Iterator<Order> orderIterator = bidOrders.iterator();
            
            while (orderIterator.hasNext() && !sellOrder.isFilled()) {
                Order buyOrder = orderIterator.next();
                
                BigDecimal matchQty = sellOrder.getRemainingQuantity()
                        .min(buyOrder.getRemainingQuantity());
                BigDecimal matchPrice = bidPrice;
                
                sellOrder.reduceQuantity(matchQty);
                buyOrder.reduceQuantity(matchQty);
                
                OrderMatchedEvent event = new OrderMatchedEvent(
                    symbol,
                    buyOrder.getOrderId(),
                    sellOrder.getOrderId(),
                    buyOrder.getTraderId(),
                    sellOrder.getTraderId(),
                    matchPrice,
                    matchQty
                );
                events.add(event);
                
                if (buyOrder.isFilled()) {
                    orderIterator.remove();
                    orderMap.remove(buyOrder.getOrderId());
                }
            }
            
            if (bidOrders.isEmpty()) {
                bidIterator.remove();
            }
        }
        
        return events;
    }

    private void addToBook(Order order) {
        orderMap.put(order.getOrderId(), order);
        
        if (order.getSide() == OrderCreatedEvent.OrderSide.BUY) {
            bids.computeIfAbsent(order.getPrice(), k -> new ArrayList<>()).add(order);
        } else {
            asks.computeIfAbsent(order.getPrice(), k -> new ArrayList<>()).add(order);
        }
    }

    public NavigableMap<BigDecimal, List<Order>> getBids() {
        return bids;
    }

    public NavigableMap<BigDecimal, List<Order>> getAsks() {
        return asks;
    }

    public String getSymbol() {
        return symbol;
    }
}
