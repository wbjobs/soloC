package com.gameanalytics.service;

import com.gameanalytics.model.PlayerBehavior;
import com.gameanalytics.repository.PlayerBehaviorRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class AnomalyDetectionService {

    private final PlayerBehaviorRepository behaviorRepository;

    @Value("${analytics.anomaly.max-normal-speed:15.0}")
    private double maxNormalSpeed;

    @Value("${analytics.anomaly.speed-threshold-multiplier:2.0}")
    private double speedThresholdMultiplier;

    @Value("${analytics.anomaly.teleport-distance-threshold:100.0}")
    private double teleportDistanceThreshold;

    @Value("${analytics.anomaly.min-time-between-movements:100}")
    private long minTimeBetweenMovements;

    public AnomalyDetectionService(PlayerBehaviorRepository behaviorRepository) {
        this.behaviorRepository = behaviorRepository;
    }

    public void detectAndMarkAnomalies(PlayerBehavior newMovement) {
        if (!"Move".equals(newMovement.getBehaviorType())) {
            return;
        }

        LocalDateTime startTime = LocalDateTime.now().minusMinutes(5);
        List<PlayerBehavior> recentMovements = behaviorRepository.findRecentMovements(
                newMovement.getPlayerId(), startTime);

        if (recentMovements.isEmpty()) {
            return;
        }

        PlayerBehavior lastMovement = recentMovements.get(recentMovements.size() - 1);

        if (checkSpeedAnomaly(newMovement, lastMovement)) {
            newMovement.setIsAnomaly(true);
            newMovement.setAnomalyType("SPEED_HACK");
            return;
        }

        if (checkTeleportAnomaly(newMovement, lastMovement)) {
            newMovement.setIsAnomaly(true);
            newMovement.setAnomalyType("TELEPORT_HACK");
            return;
        }

        if (checkTimeIntervalAnomaly(newMovement, lastMovement)) {
            newMovement.setIsAnomaly(true);
            newMovement.setAnomalyType("TIME_ANOMALY");
        }
    }

    private boolean checkSpeedAnomaly(PlayerBehavior current, PlayerBehavior previous) {
        if (current.getMoveSpeed() != null) {
            double speedThreshold = maxNormalSpeed * speedThresholdMultiplier;
            return current.getMoveSpeed() > speedThreshold;
        }

        double distance = calculateDistance(current, previous);
        long timeDiffMs = Duration.between(previous.getTimestamp(), current.getTimestamp()).toMillis();

        if (timeDiffMs > 0) {
            double calculatedSpeed = (distance / timeDiffMs) * 1000;
            double speedThreshold = maxNormalSpeed * speedThresholdMultiplier;
            return calculatedSpeed > speedThreshold;
        }

        return false;
    }

    private boolean checkTeleportAnomaly(PlayerBehavior current, PlayerBehavior previous) {
        double distance = calculateDistance(current, previous);
        long timeDiffMs = Duration.between(previous.getTimestamp(), current.getTimestamp()).toMillis();

        if (timeDiffMs == 0) {
            return distance > teleportDistanceThreshold;
        }

        double speedThreshold = maxNormalSpeed * speedThresholdMultiplier;
        double maxPossibleDistance = speedThreshold * (timeDiffMs / 1000.0);

        return distance > maxPossibleDistance && distance > teleportDistanceThreshold;
    }

    private boolean checkTimeIntervalAnomaly(PlayerBehavior current, PlayerBehavior previous) {
        long timeDiffMs = Duration.between(previous.getTimestamp(), current.getTimestamp()).toMillis();
        return timeDiffMs < minTimeBetweenMovements;
    }

    private double calculateDistance(PlayerBehavior a, PlayerBehavior b) {
        if (a.getPositionX() == null || a.getPositionY() == null || a.getPositionZ() == null ||
            b.getPositionX() == null || b.getPositionY() == null || b.getPositionZ() == null) {
            return 0;
        }

        double dx = a.getPositionX() - b.getPositionX();
        double dy = a.getPositionY() - b.getPositionY();
        double dz = a.getPositionZ() - b.getPositionZ();

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    public List<PlayerBehavior> getRecentAnomalies(int minutes) {
        LocalDateTime startTime = LocalDateTime.now().minusMinutes(minutes);
        return behaviorRepository.findAnomalies(startTime);
    }
}
