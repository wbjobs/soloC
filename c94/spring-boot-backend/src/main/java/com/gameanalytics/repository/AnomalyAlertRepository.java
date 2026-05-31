package com.gameanalytics.repository;

import com.gameanalytics.model.AnomalyAlert;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AnomalyAlertRepository extends JpaRepository<AnomalyAlert, Long> {

    Page<AnomalyAlert> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);

    Page<AnomalyAlert> findBySeverityOrderByCreatedAtDesc(Integer severity, Pageable pageable);

    Page<AnomalyAlert> findByPlayerIdOrderByCreatedAtDesc(String playerId, Pageable pageable);

    @Query("SELECT a FROM AnomalyAlert a WHERE a.createdAt >= :startTime ORDER BY a.createdAt DESC")
    List<AnomalyAlert> findRecentAlerts(@Param("startTime") LocalDateTime startTime);

    @Query("SELECT a.severity, COUNT(a) FROM AnomalyAlert a WHERE a.createdAt >= :startTime GROUP BY a.severity")
    List<Object[]> getAlertStatsBySeverity(@Param("startTime") LocalDateTime startTime);

    @Query("SELECT a.status, COUNT(a) FROM AnomalyAlert a WHERE a.createdAt >= :startTime GROUP BY a.status")
    List<Object[]> getAlertStatsByStatus(@Param("startTime") LocalDateTime startTime);

    @Query("SELECT a.serverId, COUNT(a) FROM AnomalyAlert a WHERE a.createdAt >= :startTime GROUP BY a.serverId")
    List<Object[]> getAlertStatsByServer(@Param("startTime") LocalDateTime startTime);
}
