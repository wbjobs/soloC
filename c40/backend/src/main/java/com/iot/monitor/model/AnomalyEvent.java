package com.iot.monitor.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Data
@Document(collection = "anomaly_events")
public class AnomalyEvent {
    @Id
    private String id;
    private String deviceId;
    private String ruleId;
    private String ruleName;
    private String severity;
    private String message;
    private List<Map<String, Object>> windowData;
    private Instant detectedAt;
    private boolean acknowledged;
}
