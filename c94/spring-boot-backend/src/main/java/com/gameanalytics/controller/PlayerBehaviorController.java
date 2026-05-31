package com.gameanalytics.controller;

import com.gameanalytics.model.PlayerBehavior;
import com.gameanalytics.service.AnomalyDetectionService;
import com.gameanalytics.service.PlayerBehaviorService;
import com.gameanalytics.service.ReportGenerationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/behavior")
@CrossOrigin(origins = "*")
public class PlayerBehaviorController {

    private final PlayerBehaviorService behaviorService;
    private final AnomalyDetectionService anomalyDetectionService;
    private final ReportGenerationService reportGenerationService;

    public PlayerBehaviorController(PlayerBehaviorService behaviorService,
                                    AnomalyDetectionService anomalyDetectionService,
                                    ReportGenerationService reportGenerationService) {
        this.behaviorService = behaviorService;
        this.anomalyDetectionService = anomalyDetectionService;
        this.reportGenerationService = reportGenerationService;
    }

    @PostMapping
    public ResponseEntity<PlayerBehavior> createBehavior(@RequestBody PlayerBehavior behavior) {
        PlayerBehavior saved = behaviorService.saveBehavior(behavior);
        return ResponseEntity.ok(saved);
    }

    @PostMapping("/batch")
    public ResponseEntity<List<PlayerBehavior>> createBatchBehaviors(@RequestBody List<PlayerBehavior> behaviors) {
        List<PlayerBehavior> saved = behaviorService.saveBatchBehaviors(behaviors);
        return ResponseEntity.ok(saved);
    }

    @GetMapping("/player/{playerId}/movements")
    public ResponseEntity<List<PlayerBehavior>> getPlayerMovements(
            @PathVariable String playerId,
            @RequestParam(defaultValue = "100") int limit) {
        return ResponseEntity.ok(behaviorService.getPlayerMovements(playerId, limit));
    }

    @GetMapping("/stats/popular-maps")
    public ResponseEntity<List<Map<String, Object>>> getPopularMaps(
            @RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(behaviorService.getPopularMaps(hours));
    }

    @GetMapping("/stats/popular-skills")
    public ResponseEntity<List<Map<String, Object>>> getPopularSkills(
            @RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(behaviorService.getPopularSkills(hours));
    }

    @GetMapping("/stats/task-completion")
    public ResponseEntity<List<Map<String, Object>>> getTaskCompletionStats(
            @RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(behaviorService.getTaskCompletionStats(hours));
    }

    @GetMapping("/heatmap/{mapId}")
    public ResponseEntity<List<PlayerBehavior>> getHeatmapData(
            @PathVariable String mapId,
            @RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(behaviorService.getHeatmapData(mapId, hours));
    }

    @GetMapping("/heatmap/{mapId}/aggregated")
    public ResponseEntity<List<Map<String, Object>>> getAggregatedHeatmapData(
            @PathVariable String mapId,
            @RequestParam(defaultValue = "24") int hours,
            @RequestParam(defaultValue = "5.0") double gridSize) {
        return ResponseEntity.ok(behaviorService.getAggregatedHeatmapData(mapId, hours, gridSize));
    }

    @GetMapping("/anomalies")
    public ResponseEntity<List<PlayerBehavior>> getRecentAnomalies(
            @RequestParam(defaultValue = "60") int minutes) {
        return ResponseEntity.ok(anomalyDetectionService.getRecentAnomalies(minutes));
    }

    @GetMapping("/servers")
    public ResponseEntity<List<String>> getAllServers() {
        return ResponseEntity.ok(behaviorService.getAllServers());
    }

    @GetMapping("/maps")
    public ResponseEntity<List<String>> getAllMaps() {
        return ResponseEntity.ok(behaviorService.getAllMaps());
    }

    @PostMapping("/report/generate")
    public ResponseEntity<Map<String, String>> generateReport(
            @RequestParam(defaultValue = "24") int hours,
            @RequestParam(defaultValue = "custom") String reportType) throws IOException {
        String filePath = reportGenerationService.generateReport(hours, reportType);
        Map<String, String> response = new HashMap<>();
        response.put("status", "success");
        response.put("filePath", filePath);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> healthCheck() {
        Map<String, String> response = new HashMap<>();
        response.put("status", "healthy");
        response.put("service", "player-behavior-analytics");
        return ResponseEntity.ok(response);
    }
}
