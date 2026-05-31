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
@Table(name = "player_behavior", indexes = {
    @Index(name = "idx_player_id", columnList = "playerId"),
    @Index(name = "idx_server_id", columnList = "serverId"),
    @Index(name = "idx_behavior_type", columnList = "behaviorType"),
    @Index(name = "idx_timestamp", columnList = "timestamp"),
    @Index(name = "idx_map_id", columnList = "mapId")
})
public class PlayerBehavior {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String playerId;

    @Column(nullable = false)
    private String playerName;

    private Integer playerLevel;

    @Column(nullable = false)
    private String serverId;

    @Column(nullable = false)
    private String behaviorType;

    @Column(nullable = false)
    private LocalDateTime timestamp;

    private String mapId;

    private Float positionX;

    private Float positionY;

    private Float positionZ;

    private String skillId;

    private String skillName;

    private String taskId;

    private String taskName;

    private Integer taskProgress;

    private Float moveSpeed;

    @Column(nullable = false)
    private String sessionId;

    private Boolean isAnomaly = false;

    private String anomalyType;
}
