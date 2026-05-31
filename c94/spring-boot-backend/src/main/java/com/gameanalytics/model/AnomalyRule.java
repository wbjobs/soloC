package com.gameanalytics.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import javax.persistence.*;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "anomaly_rules")
public class AnomalyRule {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String ruleCode;

    @Column(nullable = false)
    private String ruleName;

    private String description;

    @Column(nullable = false)
    private String ruleType;

    @Column(nullable = false)
    @Lob
    private String conditionJson;

    private Integer severity = 2;

    private Boolean enabled = true;

    private Boolean triggerAlert = true;

    private String alertChannels;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
