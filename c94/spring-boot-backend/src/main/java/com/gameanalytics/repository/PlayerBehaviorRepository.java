package com.gameanalytics.repository;

import com.gameanalytics.model.PlayerBehavior;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface PlayerBehaviorRepository extends JpaRepository<PlayerBehavior, Long> {

    List<PlayerBehavior> findByPlayerIdAndBehaviorTypeOrderByTimestampDesc(String playerId, String behaviorType, Pageable pageable);

    @Query("SELECT p FROM PlayerBehavior p WHERE p.playerId = :playerId AND p.behaviorType = 'Move' AND p.timestamp >= :startTime ORDER BY p.timestamp ASC")
    List<PlayerBehavior> findRecentMovements(@Param("playerId") String playerId, @Param("startTime") LocalDateTime startTime);

    @Query("SELECT p.mapId, COUNT(p) as count FROM PlayerBehavior p WHERE p.behaviorType = 'Move' AND p.timestamp >= :startTime GROUP BY p.mapId ORDER BY count DESC")
    List<Object[]> findPopularMaps(@Param("startTime") LocalDateTime startTime);

    @Query("SELECT p.skillName, COUNT(p) as count FROM PlayerBehavior p WHERE p.behaviorType = 'SkillUse' AND p.timestamp >= :startTime GROUP BY p.skillName ORDER BY count DESC")
    List<Object[]> findPopularSkills(@Param("startTime") LocalDateTime startTime);

    @Query("SELECT p.taskName, COUNT(DISTINCT p.playerId) as completedCount FROM PlayerBehavior p WHERE p.behaviorType = 'TaskComplete' AND p.timestamp >= :startTime GROUP BY p.taskName")
    List<Object[]> findTaskCompletionStats(@Param("startTime") LocalDateTime startTime);

    @Query("SELECT p FROM PlayerBehavior p WHERE p.behaviorType = 'Move' AND p.mapId = :mapId AND p.timestamp >= :startTime")
    List<PlayerBehavior> findHeatmapData(@Param("mapId") String mapId, @Param("startTime") LocalDateTime startTime);

    @Query("SELECT p FROM PlayerBehavior p WHERE p.isAnomaly = true AND p.timestamp >= :startTime")
    List<PlayerBehavior> findAnomalies(@Param("startTime") LocalDateTime startTime);

    @Query("SELECT p FROM PlayerBehavior p WHERE p.playerId = :playerId AND p.behaviorType = 'Move' AND p.timestamp BETWEEN :startTime AND :endTime ORDER BY p.timestamp ASC")
    List<PlayerBehavior> findPlayerMovementsInTimeRange(@Param("playerId") String playerId, @Param("startTime") LocalDateTime startTime, @Param("endTime") LocalDateTime endTime);

    @Query("SELECT DISTINCT p.serverId FROM PlayerBehavior p")
    List<String> findAllServerIds();

    @Query("SELECT DISTINCT p.mapId FROM PlayerBehavior p WHERE p.mapId IS NOT NULL")
    List<String> findAllMapIds();
}
