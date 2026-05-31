package com.iot.monitor.service;

import com.alibaba.fastjson.JSON;
import com.iot.monitor.model.Alert;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Service
public class AlertService {

    private static final String ALERT_KEY_PREFIX = "alert:";
    private static final String ACTIVE_ALERTS_KEY = "active_alerts";

    private final RedisTemplate<String, String> redisTemplate;
    private final SimpMessagingTemplate messagingTemplate;

    public AlertService(RedisTemplate<String, String> redisTemplate, SimpMessagingTemplate messagingTemplate) {
        this.redisTemplate = redisTemplate;
        this.messagingTemplate = messagingTemplate;
    }

    public void createAlert(Alert alert) {
        String alertKey = ALERT_KEY_PREFIX + alert.getDeviceId();
        
        Boolean existingAlert = redisTemplate.hasKey(alertKey);
        if (existingAlert != null && existingAlert) {
            return;
        }

        String alertJson = JSON.toJSONString(alert);
        redisTemplate.opsForValue().set(alertKey, alertJson, 30, TimeUnit.MINUTES);
        redisTemplate.opsForSet().add(ACTIVE_ALERTS_KEY, alert.getDeviceId());

        messagingTemplate.convertAndSend("/topic/alerts", alert);
    }

    public Set<String> getActiveAlertDeviceIds() {
        Set<String> members = redisTemplate.opsForSet().members(ACTIVE_ALERTS_KEY);
        return members != null ? members : new HashSet<>();
    }

    public void clearAlert(String deviceId) {
        String alertKey = ALERT_KEY_PREFIX + deviceId;
        redisTemplate.delete(alertKey);
        redisTemplate.opsForSet().remove(ACTIVE_ALERTS_KEY, deviceId);
    }

    public java.util.List<Alert> getActiveAlerts() {
        Set<String> deviceIds = getActiveAlertDeviceIds();
        java.util.List<Alert> alerts = new java.util.ArrayList<>();
        
        for (String deviceId : deviceIds) {
            String alertJson = redisTemplate.opsForValue().get(ALERT_KEY_PREFIX + deviceId);
            if (alertJson != null) {
                alerts.add(JSON.parseObject(alertJson, Alert.class));
            }
        }
        
        return alerts;
    }
}
