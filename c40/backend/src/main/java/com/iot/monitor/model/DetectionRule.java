package com.iot.monitor.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;

@Data
@Document(collection = "detection_rules")
public class DetectionRule {
    @Id
    private String id;
    private String name;
    private String description;
    private boolean enabled;
    private int windowSeconds;
    private List<RuleCondition> conditions;
    private String severity;
    private String notificationMessage;
    private Instant createdAt;
    private Instant updatedAt;
}
