package com.iot.monitor.service;

import com.iot.monitor.model.DeviceData;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class WindowDataService {

    private final Map<String, LinkedList<DeviceData>> deviceWindows = new ConcurrentHashMap<>();
    private static final int DEFAULT_WINDOW_SIZE = 60;

    public void addDeviceData(DeviceData data) {
        String deviceId = data.getDeviceId();
        deviceWindows.computeIfAbsent(deviceId, k -> new LinkedList<>());
        
        LinkedList<DeviceData> window = deviceWindows.get(deviceId);
        window.addLast(data);
        
        while (window.size() > DEFAULT_WINDOW_SIZE) {
            window.removeFirst();
        }
    }

    public List<DeviceData> getWindowData(String deviceId, int seconds) {
        LinkedList<DeviceData> window = deviceWindows.get(deviceId);
        if (window == null || window.isEmpty()) {
            return Collections.emptyList();
        }

        Instant cutoff = Instant.now().minusSeconds(seconds);
        List<DeviceData> result = new ArrayList<>();
        
        for (DeviceData data : window) {
            if (data.getTimestamp() != null && data.getTimestamp().isAfter(cutoff)) {
                result.add(data);
            }
        }
        
        return result;
    }

    public Map<String, Object> calculateWindowStats(String deviceId, int seconds, String metric) {
        List<DeviceData> data = getWindowData(deviceId, seconds);
        if (data.isEmpty()) {
            return Collections.emptyMap();
        }

        List<Double> values = new ArrayList<>();
        for (DeviceData d : data) {
            Double val = getMetricValue(d, metric);
            if (val != null) {
                values.add(val);
            }
        }

        if (values.isEmpty()) {
            return Collections.emptyMap();
        }

        double sum = values.stream().mapToDouble(Double::doubleValue).sum();
        double avg = sum / values.size();
        double min = values.stream().mapToDouble(Double::doubleValue).min().orElse(0);
        double max = values.stream().mapToDouble(Double::doubleValue).max().orElse(0);
        double first = values.get(0);
        double last = values.get(values.size() - 1);
        double change = last - first;
        double changePercent = first != 0 ? (change / first) * 100 : 0;

        Map<String, Object> stats = new HashMap<>();
        stats.put("avg", avg);
        stats.put("min", min);
        stats.put("max", max);
        stats.put("first", first);
        stats.put("last", last);
        stats.put("change", change);
        stats.put("changePercent", changePercent);
        stats.put("count", values.size());
        
        return stats;
    }

    public boolean checkCondition(String deviceId, int windowSeconds, String metric, String operator, double threshold, String aggregation) {
        Map<String, Object> stats = calculateWindowStats(deviceId, windowSeconds, metric);
        if (stats.isEmpty()) {
            return false;
        }

        double value;
        switch (aggregation.toLowerCase()) {
            case "avg":
            case "average":
                value = (double) stats.get("avg");
                break;
            case "max":
                value = (double) stats.get("max");
                break;
            case "min":
                value = (double) stats.get("min");
                break;
            case "change":
                value = (double) stats.get("change");
                break;
            case "changepercent":
                value = (double) stats.get("changePercent");
                break;
            default:
                value = (double) stats.get("last");
        }

        return compareValues(value, operator, threshold);
    }

    private boolean compareValues(double value, String operator, double threshold) {
        switch (operator) {
            case ">":
                return value > threshold;
            case ">=":
                return value >= threshold;
            case "<":
                return value < threshold;
            case "<=":
                return value <= threshold;
            case "==":
            case "=":
                return Math.abs(value - threshold) < 0.001;
            case "!=":
                return Math.abs(value - threshold) >= 0.001;
            default:
                return false;
        }
    }

    private Double getMetricValue(DeviceData data, String metric) {
        switch (metric.toLowerCase()) {
            case "temperature":
                return data.getTemperature();
            case "vibration":
                return data.getVibration();
            case "current":
                return data.getCurrent();
            default:
                return null;
        }
    }
}
