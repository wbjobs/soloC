package com.trading.orderbook.event;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class OrderMatchedEvent extends OrderEvent {
    private String buyOrderId;
    private String sellOrderId;
    private String buyTraderId;
    private String sellTraderId;
    private BigDecimal matchPrice;
    private BigDecimal matchQuantity;

    public OrderMatchedEvent(String symbol, String buyOrderId, String sellOrderId,
                            String buyTraderId, String sellTraderId,
                            BigDecimal matchPrice, BigDecimal matchQuantity) {
        super(buyOrderId + "-" + sellOrderId, symbol);
        this.buyOrderId = buyOrderId;
        this.sellOrderId = sellOrderId;
        this.buyTraderId = buyTraderId;
        this.sellTraderId = sellTraderId;
        this.matchPrice = matchPrice;
        this.matchQuantity = matchQuantity;
    }

    @Override
    public String getEventType() {
        return "ORDER_MATCHED";
    }
}
