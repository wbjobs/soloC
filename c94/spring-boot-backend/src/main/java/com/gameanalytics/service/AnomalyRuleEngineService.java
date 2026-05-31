package com.gameanalytics.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gameanalytics.model.AnomalyAlert;
import com.gameanalytics.model.AnomalyRule;
import com.gameanalytics.model.PlayerBehavior;
import com.gameanalytics.repository.AnomalyAlertRepository;
import com.gameanalytics.repository.AnomalyRuleRepository;
import com.gameanalytics.repository.PlayerBehaviorRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class AnomalyRuleEngineService {

    private final AnomalyRuleRepository ruleRepository;
    private final AnomalyAlertRepository alertRepository;
    private final PlayerBehaviorRepository behaviorRepository;
    private final ObjectMapper objectMapper;

    private final Map<String, List<PlayerBehavior>> playerRecentMovements = new HashMap<>();
    private final Map<String, Long> lastAlertTimeByPlayer = new HashMap<>();

    public AnomalyRuleEngineService(AnomalyRuleRepository ruleRepository,
                                     AnomalyAlertRepository alertRepository,
                                     PlayerBehaviorRepository behaviorRepository,
                                     ObjectMapper objectMapper) {
        this.ruleRepository = ruleRepository;
        this.alertRepository = alertRepository;
        this.behaviorRepository = behaviorRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void checkBehaviorAgainstRules(PlayerBehavior behavior) {
        if (!"Move".equals(behavior.getBehaviorType())) {
            return;
        }

        String playerKey = behavior.getPlayerId();
        playerRecentMovements.computeIfAbsent(playerKey, k -> new LinkedList<>());
        List<PlayerBehavior> movements = playerRecentMovements.get(playerKey);
        movements.add(behavior);

        while (movements.size() > 100) {
            movements.remove(0);
        }

        List<AnomalyRule> rules = ruleRepository.findByRuleTypeAndEnabled("MOVEMENT");
        for (AnomalyRule rule : rules) {
            evaluateRule(behavior, movements, rule);
        }
    }

    private void evaluateRule(PlayerBehavior currentBehavior,
                              List<PlayerBehavior> movements,
                              AnomalyRule rule) {
        try {
            JsonNode condition = objectMapper.readTree(rule.getConditionJson());
            boolean triggered = evaluateCondition(currentBehavior, movements, condition);

            if (triggered && rule.getTriggerAlert()) {
                createAlert(currentBehavior, rule, movements);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private boolean evaluateCondition(PlayerBehavior currentBehavior,
                                      List<PlayerBehavior> movements,
                                      JsonNode condition) {
        String operator = condition.path("operator").asText("AND");
        JsonNode conditions = condition.path("conditions");

        List<Boolean> results = new ArrayList<>();

        if (conditions.isArray()) {
            for (JsonNode subCondition : conditions) {
                results.add(evaluateSingleCondition(currentBehavior, movements, subCondition));
            }
        } else {
            results.add(evaluateSingleCondition(currentBehavior, movements, condition));
        }

        switch (operator) {
            case "AND":
                return results.stream().allMatch(r -> r);
            case "OR":
                return results.stream().anyMatch(r -> r);
            case "NOT":
                return results.isEmpty() || !results.get(0);
            default:
                return false;
        }
    }

    private boolean evaluateSingleCondition(PlayerBehavior currentBehavior,
                                            List<PlayerBehavior> movements,
                                            JsonNode condition) {
        String field = condition.path("field").asText();
        String operator = condition.path("operator").asText(">");
        double value = condition.path("value").asDouble();

        switch (field) {
            case "moveSpeed":
                return evaluateSpeed(currentBehavior, operator, value);
            case "teleportDistance":
                return evaluateTeleportDistance(movements, operator, value);
            case "timeBetweenMovements":
                return evaluateTimeBetweenMovements(movements, operator, (long) value);
            case "consecutiveTeleports":
                return evaluateConsecutiveTeleports(movements, (int) value);
            case "unnaturalPath":
                return evaluateUnnaturalPath(movements);
            default:
                return false;
        }
    }

    private boolean evaluateSpeed(PlayerBehavior behavior, String operator, double threshold) {
        Float speed = behavior.getMoveSpeed();
        if (speed == null) return false;

        switch (operator) {
            case ">": return speed > threshold;
            case ">=": return speed >= threshold;
            case "<": return speed < threshold;
            case "<=": return speed <= threshold;
            case "==": return speed == threshold;
            default: return false;
        }
    }

    private boolean evaluateTeleportDistance(List<PlayerBehavior> movements,
                                             String operator, double threshold) {
        if (movements.size() < 2) return false;

        PlayerBehavior last = movements.get(movements.size() - 2);
        PlayerBehavior current = movements.get(movements.size() - 1);

        double distance = calculateDistance(last, current);

        switch (operator) {
            case ">": return distance > threshold;
            case ">=": return distance >= threshold;
            default: return false;
        }
    }

    private boolean evaluateTimeBetweenMovements(List<PlayerBehavior> movements,
                                                  String operator, long thresholdMs) {
        if (movements.size() < 2) return false;

        PlayerBehavior last = movements.get(movements.size() - 2);
        PlayerBehavior current = movements.get(movements.size() - 1);

        long timeDiffMs = Duration.between(last.getTimestamp(), current.getTimestamp()).toMillis();

        switch (operator) {
            case "<": return timeDiffMs < thresholdMs;
            case "<=": return timeDiffMs <= thresholdMs;
            default: return false;
        }
    }

    private boolean evaluateConsecutiveTeleports(List<PlayerBehavior> movements, int threshold) {
        if (movements.size() < threshold + 1) return false;

        int consecutiveCount = 0;
        for (int i = 1; i < movements.size(); i++) {
            double distance = calculateDistance(movements.get(i - 1), movements.get(i));
            if (distance > 50) {
                consecutiveCount++;
                if (consecutiveCount >= threshold) return true;
            } else {
                consecutiveCount = 0;
            }
        }
        return false;
    }

    private boolean evaluateUnnaturalPath(List<PlayerBehavior> movements) {
        if (movements.size() < 10) return false;

        int directionChanges = 0;
        for (int i = 2; i < movements.size(); i++) {
            double dx1 = movements.get(i - 1).getPositionX() - movements.get(i - 2).getPositionX();
            double dz1 = movements.get(i - 1).getPositionZ() - movements.get(i - 2).getPositionZ();
            double dx2 = movements.get(i).getPositionX() - movements.get(i - 1).getPositionX();
            double dz2 = movements.get(i).getPositionZ() - movements.get(i - 1).getPositionZ();

            double dotProduct = dx1 * dx2 + dz1 * dz2;
            if (dotProduct < 0) {
                directionChanges++;
            }
        }

        return directionChanges > movements.size() * 0.4;
    }

    private double calculateDistance(PlayerBehavior a, PlayerBehavior b) {
        if (a.getPositionX() == null || a.getPositionZ() == null ||
            b.getPositionX() == null || b.getPositionZ() == null) {
            return 0;
        }
        double dx = a.getPositionX() - b.getPositionX();
        double dz = a.getPositionZ() - b.getPositionZ();
        return Math.sqrt(dx * dx + dz * dz);
    }

    private void createAlert(PlayerBehavior behavior, AnomalyRule rule,
                             List<PlayerBehavior> movements) {
        String alertKey = behavior.getPlayerId() + "_" + rule.getRuleCode();
        long now = System.currentTimeMillis();
        long lastAlert = lastAlertTimeByPlayer.getOrDefault(alertKey, 0L);

        if (now - lastAlert < 60000) {
            return;
        }
        lastAlertTimeByPlayer.put(alertKey, now);

        AnomalyAlert alert = new AnomalyAlert();
        alert.setPlayerId(behavior.getPlayerId());
        alert.setPlayerName(behavior.getPlayerName());
        alert.setServerId(behavior.getServerId());
        alert.setRuleId(rule.getId());
        alert.setRuleCode(rule.getRuleCode());
        alert.setRuleName(rule.getRuleName());
        alert.setSeverity(rule.getSeverity());
        alert.setStatus("NEW");

        Map<String, Object> evidence = new HashMap<>();
        evidence.put("mapId", behavior.getMapId());
        evidence.put("positionX", behavior.getPositionX());
        evidence.put("positionZ", behavior.getPositionZ());
        evidence.put("moveSpeed", behavior.getMoveSpeed());
        evidence.put("recentMovementCount", movements.size());
        evidence.put("timestamp", behavior.getTimestamp().toString());

        try {
            alert.setEvidenceJson(objectMapper.writeValueAsString(evidence));
        } catch (Exception e) {
            alert.setEvidenceJson("{}");
        }

        alertRepository.save(alert);

        behavior.setIsAnomaly(true);
        behavior.setAnomalyType(rule.getRuleCode());
    }

    @Scheduled(fixedRate = 60000)
    public void cleanupOldMovementData() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(10);
        playerRecentMovements.entrySet().removeIf(entry -> {
            List<PlayerBehavior> movements = entry.getValue();
            movements.removeIf(m -> m.getTimestamp().isBefore(cutoff));
            return movements.isEmpty();
        });
    }

    @Transactional
    public void initDefaultRules() {
        if (ruleRepository.count() == 0) {
            createDefaultRules();
        }
    }

    private void createDefaultRules() {
        AnomalyRule speedHack = new AnomalyRule();
        speedHack.setRuleCode("SPEED_HACK_01");
        speedHack.setRuleName("高速移动检测");
        speedHack.setDescription("检测玩家移动速度超过正常阈值");
        speedHack.setRuleType("MOVEMENT");
        speedHack.setSeverity(3);
        speedHack.setEnabled(true);
        speedHack.setTriggerAlert(true);
        speedHack.setConditionJson("{\"field\":\"moveSpeed\",\"operator\":\">\",\"value\":20.0}");
        ruleRepository.save(speedHack);

        AnomalyRule teleport = new AnomalyRule();
        teleport.setRuleCode("TELEPORT_HACK_01");
        teleport.setRuleName("瞬移检测");
        teleport.setDescription("检测玩家短时间内移动距离异常");
        teleport.setRuleType("MOVEMENT");
        teleport.setSeverity(3);
        teleport.setEnabled(true);
        teleport.setTriggerAlert(true);
        teleport.setConditionJson("{\"field\":\"teleportDistance\",\"operator\":\">\",\"value\":100.0}");
        ruleRepository.save(teleport);

        AnomalyRule frequency = new AnomalyRule();
        frequency.setRuleCode("MOVE_FREQUENCY_01");
        frequency.setRuleName("移动频率异常");
        frequency.setDescription("检测玩家移动数据包发送频率异常");
        frequency.setRuleType("MOVEMENT");
        frequency.setSeverity(2);
        frequency.setEnabled(true);
        frequency.setTriggerAlert(true);
        frequency.setConditionJson("{\"field\":\"timeBetweenMovements\",\"operator\":\"<\",\"value\":50}");
        ruleRepository.save(frequency);

        AnomalyRule comboRule = new AnomalyRule();
        comboRule.setRuleCode("SPEED_TELEPORT_COMBO");
        comboRule.setRuleName("高速+瞬移组合检测");
        comboRule.setDescription("同时触发高速和瞬移的可疑行为");
        comboRule.setRuleType("MOVEMENT");
        comboRule.setSeverity(4);
        comboRule.setEnabled(true);
        comboRule.setTriggerAlert(true);
        comboRule.setConditionJson("{\"operator\":\"AND\",\"conditions\":[{\"field\":\"moveSpeed\",\"operator\":\">\",\"value\":15.0},{\"field\":\"teleportDistance\",\"operator\":\">\",\"value\":50.0}]}");
        ruleRepository.save(comboRule);
    }
}
