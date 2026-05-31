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
@Table(name = "behavior_aggregates", indexes = {
    @Index(name = "idx_aggregate_server", columnList = "serverId"),
    @Index(name = "idx_aggregate_map", columnList = "mapId"),
    @Index(name = "idx_aggregate_level", columnList = "playerLevel"),
    @Index(name = "idx_aggregate_type", columnList = "behaviorType"),
    @Index(name = "idx_aggregate_time", columnList = "aggregateTime")
})
public class BehaviorAggregate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String serverId;

    private String mapId;

    private Integer playerLevel;

    @Column(nullable = false)
    private String behaviorType;

    @Column(nullable = false)
    private LocalDateTime aggregateTime;

    @Column(nullable = false)
    private Long totalCount = 0L;

    private Long uniquePlayers = 0L;

    private Double avgMoveSpeed;

    private Double maxMoveSpeed;

    private Double minMoveSpeed;

    private Long skillCount;

    private Long taskCompleteCount;

    private Long anomalyCount;

    @Column(columnDefinition = "TEXT")
    private String gridHeatmapData;

    @Column(columnDefinition = "TEXT")
    private String skillDistribution;

    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
