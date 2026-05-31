package com.gameanalytics.repository;

import com.gameanalytics.model.BehaviorAggregate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface BehaviorAggregateRepository extends JpaRepository<BehaviorAggregate, Long> {

    @Query("SELECT a FROM BehaviorAggregate a WHERE a.serverId = :serverId AND a.mapId = :mapId " +
           "AND a.behaviorType = :behaviorType AND a.aggregateTime = :aggregateTime")
    Optional<BehaviorAggregate> findExistingAggregate(
            @Param("serverId") String serverId,
            @Param("mapId") String mapId,
            @Param("behaviorType") String behaviorType,
            @Param("aggregateTime") LocalDateTime aggregateTime);

    @Query("SELECT a FROM BehaviorAggregate a WHERE a.serverId = :serverId AND a.aggregateTime BETWEEN :startTime AND :endTime ORDER BY a.aggregateTime")
    List<BehaviorAggregate> findByServerAndTimeRange(
            @Param("serverId") String serverId,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime);

    @Query("SELECT a FROM BehaviorAggregate a WHERE a.mapId = :mapId AND a.aggregateTime BETWEEN :startTime AND :endTime ORDER BY a.aggregateTime")
    List<BehaviorAggregate> findByMapAndTimeRange(
            @Param("mapId") String mapId,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime);

    @Query("SELECT a FROM BehaviorAggregate a WHERE a.playerLevel = :level AND a.aggregateTime BETWEEN :startTime AND :endTime ORDER BY a.aggregateTime")
    List<BehaviorAggregate> findByLevelAndTimeRange(
            @Param("level") Integer level,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime);

    @Query("SELECT DISTINCT a.serverId FROM BehaviorAggregate a")
    List<String> findAllServerIds();

    @Query("SELECT DISTINCT a.mapId FROM BehaviorAggregate a WHERE a.mapId IS NOT NULL")
    List<String> findAllMapIds();
}
