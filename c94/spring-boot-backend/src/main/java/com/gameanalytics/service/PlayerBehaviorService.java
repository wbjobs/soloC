package com.gameanalytics.service;

import com.gameanalytics.model.PlayerBehavior;
import com.gameanalytics.repository.PlayerBehaviorRepository;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PlayerBehaviorService {

    private final PlayerBehaviorRepository behaviorRepository;
    private final AnomalyDetectionService anomalyDetectionService;
    private final AnomalyRuleEngineService ruleEngineService;

    public PlayerBehaviorService(PlayerBehaviorRepository behaviorRepository,
                                 AnomalyDetectionService anomalyDetectionService,
                                 AnomalyRuleEngineService ruleEngineService) {
        this.behaviorRepository = behaviorRepository;
        this.anomalyDetectionService = anomalyDetectionService;
        this.ruleEngineService = ruleEngineService;
    }

    @Transactional
    public PlayerBehavior saveBehavior(PlayerBehavior behavior) {
        anomalyDetectionService.detectAndMarkAnomalies(behavior);
        ruleEngineService.checkBehaviorAgainstRules(behavior);
        return behaviorRepository.save(behavior);
    }

    @Transactional
    public List<PlayerBehavior> saveBatchBehaviors(List<PlayerBehavior> behaviors) {
        for (PlayerBehavior behavior : behaviors) {
            anomalyDetectionService.detectAndMarkAnomalies(behavior);
            ruleEngineService.checkBehaviorAgainstRules(behavior);
        }
        return behaviorRepository.saveAll(behaviors);
    }

    public List<PlayerBehavior> getPlayerMovements(String playerId, int limit) {
        return behaviorRepository.findByPlayerIdAndBehaviorTypeOrderByTimestampDesc(
                playerId, "Move", org.springframework.data.domain.PageRequest.of(0, limit));
    }

    @Cacheable(value = "popularMaps", key = "#hours")
    public List<Map<String, Object>> getPopularMaps(int hours) {
        LocalDateTime startTime = LocalDateTime.now().minusHours(hours);
        List<Object[]> results = behaviorRepository.findPopularMaps(startTime);
        return results.stream()
                .map(result -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("mapId", result[0]);
                    map.put("count", result[1]);
                    return map;
                })
                .collect(Collectors.toList());
    }

    @Cacheable(value = "popularSkills", key = "#hours")
    public List<Map<String, Object>> getPopularSkills(int hours) {
        LocalDateTime startTime = LocalDateTime.now().minusHours(hours);
        List<Object[]> results = behaviorRepository.findPopularSkills(startTime);
        return results.stream()
                .map(result -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("skillName", result[0]);
                    map.put("count", result[1]);
                    return map;
                })
                .collect(Collectors.toList());
    }

    @Cacheable(value = "taskCompletion", key = "#hours")
    public List<Map<String, Object>> getTaskCompletionStats(int hours) {
        LocalDateTime startTime = LocalDateTime.now().minusHours(hours);
        List<Object[]> results = behaviorRepository.findTaskCompletionStats(startTime);
        return results.stream()
                .map(result -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("taskName", result[0]);
                    map.put("completedCount", result[1]);
                    return map;
                })
                .collect(Collectors.toList());
    }

    @Cacheable(value = "heatmapData", key = "#mapId + '_' + #hours + '_' + #gridSize")
    public List<Map<String, Object>> getAggregatedHeatmapData(String mapId, int hours, double gridSize) {
        LocalDateTime startTime = LocalDateTime.now().minusHours(hours);
        List<PlayerBehavior> rawData = behaviorRepository.findHeatmapData(mapId, startTime);
        
        Map<String, HeatmapCell> aggregatedCells = new HashMap<>();
        
        for (PlayerBehavior data : rawData) {
            if (data.getPositionX() == null || data.getPositionZ() == null) {
                continue;
            }
            
            long gridX = (long) Math.floor(data.getPositionX() / gridSize);
            long gridZ = (long) Math.floor(data.getPositionZ() / gridSize);
            String cellKey = gridX + "_" + gridZ;
            
            HeatmapCell cell = aggregatedCells.computeIfAbsent(cellKey, k -> new HeatmapCell(
                gridX * gridSize + gridSize / 2,
                data.getPositionY() != null ? data.getPositionY() : 0,
                gridZ * gridSize + gridSize / 2
            ));
            
            cell.incrementCount();
            cell.addPlayerId(data.getPlayerId());
        }
        
        return aggregatedCells.values().stream()
                .map(cell -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("x", cell.getX());
                    map.put("y", cell.getY());
                    map.put("z", cell.getZ());
                    map.put("count", cell.getCount());
                    map.put("uniquePlayers", cell.getUniquePlayerCount());
                    return map;
                })
                .sorted((a, b) -> Integer.compare((Integer) b.get("count"), (Integer) a.get("count")))
                .collect(Collectors.toList());
    }

    public List<PlayerBehavior> getHeatmapData(String mapId, int hours) {
        LocalDateTime startTime = LocalDateTime.now().minusHours(hours);
        return behaviorRepository.findHeatmapData(mapId, startTime);
    }

    public List<String> getAllServers() {
        return behaviorRepository.findAllServerIds();
    }

    public List<String> getAllMaps() {
        return behaviorRepository.findAllMapIds();
    }

    private static class HeatmapCell {
        private final double x;
        private final double y;
        private final double z;
        private int count;
        private final Set<String> playerIds;

        public HeatmapCell(double x, double y, double z) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.count = 0;
            this.playerIds = new HashSet<>();
        }

        public void incrementCount() {
            this.count++;
        }

        public void addPlayerId(String playerId) {
            this.playerIds.add(playerId);
        }

        public double getX() { return x; }
        public double getY() { return y; }
        public double getZ() { return z; }
        public int getCount() { return count; }
        public int getUniquePlayerCount() { return playerIds.size(); }
    }
}
