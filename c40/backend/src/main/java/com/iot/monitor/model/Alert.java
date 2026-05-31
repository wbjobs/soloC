package com.iot.monitor.model;

import lombok.Data;
import java.time.Instant;

@Data
public class Alert {
    private String deviceId;
    private Instant timestamp;
    private String message;
    private double predictedTemperature;
    private double threshold;
    private AlertLevel level;

    public enum AlertLevel {
        WARNING, CRITICAL
    }
}
