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
@Table(name = "anomaly_alerts", indexes = {
    @Index(name = "idx_player_id", columnList = "playerId"),
    @Index(name = "idx_rule_id", columnList = "ruleId"),
    @Index(name = "idx_status", columnList = "status"),
    @Index(name = "idx_created_at", columnList = "createdAt")
})
public class AnomalyAlert {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String playerId;

    private String playerName;

    private String serverId;

    private Long ruleId;

    private String ruleCode;

    private String ruleName;

    private Integer severity;

    @Column(nullable = false)
    private String status = "NEW";

    @Lob
    private String evidenceJson;

    private String assignedTo;

    private String notes;

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
