package com.iot.monitor.model;

import lombok.Data;
import java.time.Instant;

@Data
public class DeviceData {
    private String deviceId;
    private Instant timestamp;
    private double temperature;
    private double vibration;
    private double current;
}
