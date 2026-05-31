package com.gameanalytics.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gameanalytics.model.BehaviorAggregate;
import com.gameanalytics.model.PlayerBehavior;
import com.gameanalytics.repository.BehaviorAggregateRepository;
import com.gameanalytics.repository.PlayerBehaviorRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class BehaviorAggregationService {

    private final PlayerBehaviorRepository behaviorRepository;
    private final BehaviorAggregateRepository aggregateRepository;
    private final ObjectMapper objectMapper;

    private LocalDateTime lastAggregationTime = LocalDateTime.now().minusHours(1);

    public BehaviorAggregationService(PlayerBehaviorRepository behaviorRepository,
                                      BehaviorAggregateRepository aggregateRepository,
                                      ObjectMapper objectMapper) {
        this.behaviorRepository = behaviorRepository;
        this.aggregateRepository = aggregateRepository;
        this.objectMapper = objectMapper;
    }

    @Scheduled(fixedRate = 300000)
    @Transactional
    public void aggregateRecentBehaviors() {
        LocalDateTime startTime = lastAggregationTime;
        LocalDateTime endTime = LocalDateTime.now();
        LocalDateTime currentHour = startTime.truncatedTo(ChronoUnit.HOURS);

        while (currentHour.isBefore(endTime)) {
            LocalDateTime nextHour = currentHour.plusHours(1);
            aggregateHourlyData(currentHour, nextHour);
            currentHour = nextHour;
        }

        lastAggregationTime = endTime;
    }

    private void aggregateHourlyData(LocalDateTime startTime, LocalDateTime endTime) {
        List<PlayerBehavior> behaviors = behaviorRepository.findAll();

        Map<String, List<PlayerBehavior>> groupedBehaviors = new HashMap<>();

        for (PlayerBehavior behavior : behaviors) {
            if (behavior.getTimestamp().isBefore(startTime) || behavior.getTimestamp().isAfter(endTime)) {
                continue;
            }

            String key = buildAggregateKey(behavior, startTime);
            groupedBehaviors.computeIfAbsent(key, k -> new ArrayList<>()).add(behavior);
        }

        for (Map.Entry<String, List<PlayerBehavior>> entry : groupedBehaviors.entrySet()) {
            String[] keyParts = entry.getKey().split("_");
            String serverId = keyParts[0];
            String mapId = keyParts[1].equals("NULL") ? null : keyParts[1];
            String behaviorType = keyParts[2];

            BehaviorAggregate aggregate = aggregateRepository
                    .findExistingAggregate(serverId, mapId, behaviorType, startTime)
                    .orElse(new BehaviorAggregate());

            updateAggregate(aggregate, entry.getValue(), serverId, mapId, behaviorType, startTime);
            aggregateRepository.save(aggregate);
        }
    }

    private String buildAggregateKey(PlayerBehavior behavior, LocalDateTime aggregateTime) {
        String mapKey = behavior.getMapId() != null ? behavior.getMapId() : "NULL";
        return behavior.getServerId() + "_" + mapKey + "_" + behavior.getBehaviorType();
    }

    private void updateAggregate(BehaviorAggregate aggregate, List<PlayerBehavior> behaviors,
                                  String serverId, String mapId, String behaviorType,
                                  LocalDateTime aggregateTime) {
        aggregate.setServerId(serverId);
        aggregate.setMapId(mapId);
        aggregate.setBehaviorType(behaviorType);
        aggregate.setAggregateTime(aggregateTime);
        aggregate.setTotalCount((long) behaviors.size());

        Set<String> uniquePlayerIds = new HashSet<>();
        DoubleSummaryStatistics speedStats = new DoubleSummaryStatistics();
        Map<String, Integer> skillCounts = new HashMap<>();
        Map<String, Integer> gridCounts = new HashMap<>();
        long anomalyCount = 0;

        for (PlayerBehavior behavior : behaviors) {
            uniquePlayerIds.add(behavior.getPlayerId());

            if (behavior.getMoveSpeed() != null) {
                speedStats.accept(behavior.getMoveSpeed());
            }

            if (behavior.getSkillName() != null) {
                skillCounts.merge(behavior.getSkillName(), 1, Integer::sum);
            }

            if (behavior.getIsAnomaly() != null && behavior.getIsAnomaly()) {
                anomalyCount++;
            }

            if (behavior.getPositionX() != null && behavior.getPositionZ() != null) {
                String gridKey = ((int) Math.floor(behavior.getPositionX() / 10.0)) + "_" +
                                 ((int) Math.floor(behavior.getPositionZ() / 10.0));
                gridCounts.merge(gridKey, 1, Integer::sum);
            }
        }

        aggregate.setUniquePlayers((long) uniquePlayerIds.size());
        aggregate.setAnomalyCount(anomalyCount);

        if (speedStats.getCount() > 0) {
            aggregate.setAvgMoveSpeed(speedStats.getAverage());
            aggregate.setMaxMoveSpeed(speedStats.getMax());
            aggregate.setMinMoveSpeed(speedStats.getMin());
        }

        aggregate.setSkillCount((long) skillCounts.size());

        if (!skillCounts.isEmpty()) {
            try {
                aggregate.setSkillDistribution(objectMapper.writeValueAsString(skillCounts));
            } catch (Exception e) {
                aggregate.setSkillDistribution("{}");
            }
        }

        if (!gridCounts.isEmpty()) {
            try {
                aggregate.setGridHeatmapData(objectMapper.writeValueAsString(gridCounts));
            } catch (Exception e) {
                aggregate.setGridHeatmapData("{}");
            }
        }

        if ("TaskComplete".equals(behaviorType)) {
            aggregate.setTaskCompleteCount((long) behaviors.size());
        }
    }

    public List<BehaviorAggregate> getAggregateDataByServer(String serverId, int hours) {
        LocalDateTime endTime = LocalDateTime.now();
        LocalDateTime startTime = endTime.minusHours(hours);
        return aggregateRepository.findByServerAndTimeRange(serverId, startTime, endTime);
    }

    public List<BehaviorAggregate> getAggregateDataByMap(String mapId, int hours) {
        LocalDateTime endTime = LocalDateTime.now();
        LocalDateTime startTime = endTime.minusHours(hours);
        return aggregateRepository.findByMapAndTimeRange(mapId, startTime, endTime);
    }

    public List<BehaviorAggregate> getAggregateDataByLevel(Integer level, int hours) {
        LocalDateTime endTime = LocalDateTime.now();
        LocalDateTime startTime = endTime.minusHours(hours);
        return aggregateRepository.findByLevelAndTimeRange(level, startTime, endTime);
    }

    public Map<String, Object> getComparisonData(List<String> servers, int hours) {
        LocalDateTime endTime = LocalDateTime.now();
        LocalDateTime startTime = endTime.minusHours(hours);
        Map<String, Object> result = new HashMap<>();

        for (String serverId : servers) {
            List<BehaviorAggregate> aggregates = aggregateRepository
                    .findByServerAndTimeRange(serverId, startTime, endTime);

            Map<String, Object> serverStats = new HashMap<>();
            long totalMovements = 0;
            long totalSkills = 0;
            long totalTasks = 0;
            long totalAnomalies = 0;
            Set<String> uniquePlayers = new HashSet<>();
            DoubleSummaryStatistics speedStats = new DoubleSummaryStatistics();

            for (BehaviorAggregate agg : aggregates) {
                if ("Move".equals(agg.getBehaviorType())) {
                    totalMovements += agg.getTotalCount();
                    if (agg.getAvgMoveSpeed() != null) {
                        speedStats.accept(agg.getAvgMoveSpeed());
                    }
                } else if ("SkillUse".equals(agg.getBehaviorType())) {
                    totalSkills += agg.getTotalCount();
                } else if ("TaskComplete".equals(agg.getBehaviorType())) {
                    totalTasks += agg.getTotalCount();
                }
                totalAnomalies += agg.getAnomalyCount() != null ? agg.getAnomalyCount() : 0;
                if (agg.getUniquePlayers() != null) {
                }
            }

            serverStats.put("totalMovements", totalMovements);
            serverStats.put("totalSkills", totalSkills);
            serverStats.put("totalTasks", totalTasks);
            serverStats.put("totalAnomalies", totalAnomalies);
            serverStats.put("avgMoveSpeed", speedStats.getCount() > 0 ? speedStats.getAverage() : 0);
            serverStats.put("behaviorPerHour", (double) totalMovements / hours);

            result.put(serverId, serverStats);
        }

        return result;
    }

    public Map<String, Object> getLevelComparisonData(List<Integer> levels, int hours) {
        LocalDateTime endTime = LocalDateTime.now();
        LocalDateTime startTime = endTime.minusHours(hours);
        Map<String, Object> result = new HashMap<>();

        for (Integer level : levels) {
            List<BehaviorAggregate> aggregates = aggregateRepository
                    .findByLevelAndTimeRange(level, startTime, endTime);

            Map<String, Object> levelStats = new HashMap<>();
            long totalMovements = 0;
            long totalSkills = 0;
            long totalTasks = 0;

            for (BehaviorAggregate agg : aggregates) {
                if ("Move".equals(agg.getBehaviorType())) {
                    totalMovements += agg.getTotalCount();
                } else if ("SkillUse".equals(agg.getBehaviorType())) {
                    totalSkills += agg.getTotalCount();
                } else if ("TaskComplete".equals(agg.getBehaviorType())) {
                    totalTasks += agg.getTotalCount();
                }
            }

            levelStats.put("level", level);
            levelStats.put("totalMovements", totalMovements);
            levelStats.put("totalSkills", totalSkills);
            levelStats.put("totalTasks", totalTasks);
            levelStats.put("avgSessionLength", calculateAvgSession(aggregates));

            result.put("level_" + level, levelStats);
        }

        return result;
    }

    private double calculateAvgSession(List<BehaviorAggregate> aggregates) {
        if (aggregates.isEmpty()) return 0;

        long totalBehaviors = aggregates.stream()
                .mapToLong(BehaviorAggregate::getTotalCount)
                .sum();
        long uniquePlayers = aggregates.stream()
                .mapToLong(a -> a.getUniquePlayers() != null ? a.getUniquePlayers() : 0)
                .sum();

        return uniquePlayers > 0 ? (double) totalBehaviors / uniquePlayers : 0;
    }

    @Transactional
    public void forceAggregation(int hours) {
        LocalDateTime endTime = LocalDateTime.now();
        LocalDateTime startTime = endTime.minusHours(hours);
        LocalDateTime currentHour = startTime.truncatedTo(ChronoUnit.HOURS);

        while (currentHour.isBefore(endTime)) {
            LocalDateTime nextHour = currentHour.plusHours(1);
            aggregateHourlyData(currentHour, nextHour);
            currentHour = nextHour;
        }

        lastAggregationTime = endTime;
    }
}
