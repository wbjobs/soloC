package com.bigdata.orderflow;

public class FactorResult {
    private String symbol;
    private double buyPressure;
    private double sellPressure;
    private double netFlow;
    private double largeOrderNetFlow;
    private long windowStart;
    private long windowEnd;
    private String timestamp;

    public FactorResult() {}

    public String getSymbol() { return symbol; }
    public void setSymbol(String symbol) { this.symbol = symbol; }
    public double getBuyPressure() { return buyPressure; }
    public void setBuyPressure(double buyPressure) { this.buyPressure = buyPressure; }
    public double getSellPressure() { return sellPressure; }
    public void setSellPressure(double sellPressure) { this.sellPressure = sellPressure; }
    public double getNetFlow() { return netFlow; }
    public void setNetFlow(double netFlow) { this.netFlow = netFlow; }
    public double getLargeOrderNetFlow() { return largeOrderNetFlow; }
    public void setLargeOrderNetFlow(double largeOrderNetFlow) { this.largeOrderNetFlow = largeOrderNetFlow; }
    public long getWindowStart() { return windowStart; }
    public void setWindowStart(long windowStart) { this.windowStart = windowStart; }
    public long getWindowEnd() { return windowEnd; }
    public void setWindowEnd(long windowEnd) { this.windowEnd = windowEnd; }
    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }
}
