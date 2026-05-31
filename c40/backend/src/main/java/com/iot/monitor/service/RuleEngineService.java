package com.iot.monitor.service;

import com.alibaba.fastjson.JSON;
import com.iot.monitor.model.AnomalyEvent;
import com.iot.monitor.model.DetectionRule;
import com.iot.monitor.repository.AnomalyEventRepository;
import com.iot.monitor.repository.DetectionRuleRepository;
import org.jeasy.rules.annotation.*;
import org.jeasy.rules.api.*;
import org.jeasy.rules.core.DefaultRulesEngine;
import org.mvel2.MVEL;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.time.Instant;
import java.util.*;

@Service
public class RuleEngineService {

    private final DetectionRuleRepository ruleRepository;
    private final AnomalyEventRepository eventRepository;
    private final WindowDataService windowDataService;
    private final SimpMessagingTemplate messagingTemplate;
    private final MqttMessageHandler mqttMessageHandler;
    private final RulesEngine rulesEngine;
    private final Map<String, Rules> deviceRules = new HashMap<>();

    public RuleEngineService(DetectionRuleRepository ruleRepository,
                            AnomalyEventRepository eventRepository,
                            WindowDataService windowDataService,
                            SimpMessagingTemplate messagingTemplate,
                            MqttMessageHandler mqttMessageHandler) {
        this.ruleRepository = ruleRepository;
        this.eventRepository = eventRepository;
        this.windowDataService = windowDataService;
        this.messagingTemplate = messagingTemplate;
        this.mqttMessageHandler = mqttMessageHandler;
        this.rulesEngine = new DefaultRulesEngine();
    }

    @PostConstruct
    public void init() {
        createDefaultRule();
        refreshRules();
    }

    private void createDefaultRule() {
        if (ruleRepository.count() > 0) {
            return;
        }

        DetectionRule defaultRule = new DetectionRule();
        defaultRule.setName("振动尖峰 + 温度骤降");
        defaultRule.setDescription("检测振动突然升高同时温度突然下降的异常模式");
        defaultRule.setEnabled(true);
        defaultRule.setWindowSeconds(30);
        defaultRule.setSeverity("CRITICAL");
        defaultRule.setNotificationMessage("检测到异常模式：振动尖峰 + 温度骤降");

        List<com.iot.monitor.model.RuleCondition> conditions = new ArrayList<>();
        
        com.iot.monitor.model.RuleCondition vibrationCondition = new com.iot.monitor.model.RuleCondition();
        vibrationCondition.setMetric("vibration");
        vibrationCondition.setOperator(">");
        vibrationCondition.setValue(50);
        vibrationCondition.setAggregation("changePercent");
        conditions.add(vibrationCondition);

        com.iot.monitor.model.RuleCondition temperatureCondition = new com.iot.monitor.model.RuleCondition();
        temperatureCondition.setMetric("temperature");
        temperatureCondition.setOperator("<");
        temperatureCondition.setValue(-10);
        temperatureCondition.setAggregation("changePercent");
        conditions.add(temperatureCondition);

        defaultRule.setConditions(conditions);
        defaultRule.setCreatedAt(Instant.now());
        defaultRule.setUpdatedAt(Instant.now());

        ruleRepository.save(defaultRule);
    }

    public void refreshRules() {
        deviceRules.clear();
    }

    @Scheduled(fixedDelay = 5000)
    public void evaluateAllDevices() {
        List<DetectionRule> enabledRules = ruleRepository.findByEnabled(true);
        if (enabledRules.isEmpty()) {
            return;
        }

        for (String deviceId : getAllActiveDeviceIds()) {
            for (DetectionRule rule : enabledRules) {
                evaluateRule(deviceId, rule);
            }
        }
    }

    private void evaluateRule(String deviceId, DetectionRule rule) {
        try {
            boolean allConditionsMet = true;
            
            for (com.iot.monitor.model.RuleCondition condition : rule.getConditions()) {
                boolean conditionMet = windowDataService.checkCondition(
                    deviceId,
                    rule.getWindowSeconds(),
                    condition.getMetric(),
                    condition.getOperator(),
                    condition.getValue(),
                    condition.getAggregation()
                );
                
                if (!conditionMet) {
                    allConditionsMet = false;
                    break;
                }
            }

            if (allConditionsMet) {
                triggerAnomaly(deviceId, rule);
            }
        } catch (Exception e) {
            System.err.printf("Error evaluating rule %s for device %s: %s%n", 
                rule.getName(), deviceId, e.getMessage());
        }
    }

    private void triggerAnomaly(String deviceId, DetectionRule rule) {
        String eventKey = deviceId + "_" + rule.getId() + "_" + Instant.now().getEpochSecond() / 60;
        
        AnomalyEvent event = new AnomalyEvent();
        event.setDeviceId(deviceId);
        event.setRuleId(rule.getId());
        event.setRuleName(rule.getName());
        event.setSeverity(rule.getSeverity());
        event.setMessage(rule.getNotificationMessage());
        event.setDetectedAt(Instant.now());
        event.setAcknowledged(false);
        
        List<Map<String, Object>> windowData = new ArrayList<>();
        for (com.iot.monitor.model.DeviceData d : windowDataService.getWindowData(deviceId, rule.getWindowSeconds())) {
            Map<String, Object> point = new HashMap<>();
            point.put("temperature", d.getTemperature());
            point.put("vibration", d.getVibration());
            point.put("current", d.getCurrent());
            point.put("timestamp", d.getTimestamp().toString());
            windowData.add(point);
        }
        event.setWindowData(windowData);
        
        eventRepository.save(event);
        messagingTemplate.convertAndSend("/topic/anomalies", event);
        
        System.out.printf("ANOMALY DETECTED: Device=%s, Rule=%s%n", deviceId, rule.getName());
    }

    private Set<String> getAllActiveDeviceIds() {
        return mqttMessageHandler.getActiveDeviceIds();
    }

    public DetectionRule saveRule(DetectionRule rule) {
        if (rule.getCreatedAt() == null) {
            rule.setCreatedAt(Instant.now());
        }
        rule.setUpdatedAt(Instant.now());
        DetectionRule saved = ruleRepository.save(rule);
        refreshRules();
        return saved;
    }

    public void deleteRule(String ruleId) {
        ruleRepository.deleteById(ruleId);
        refreshRules();
    }

    public List<DetectionRule> getAllRules() {
        return ruleRepository.findAll();
    }

    public Optional<DetectionRule> getRuleById(String ruleId) {
        return ruleRepository.findById(ruleId);
    }

    public List<AnomalyEvent> getRecentAnomalies() {
        return eventRepository.findByAcknowledgedFalse();
    }

    public List<AnomalyEvent> getDeviceAnomalies(String deviceId) {
        return eventRepository.findByDeviceIdAndDetectedAtAfter(deviceId, Instant.now().minusSeconds(3600));
    }

    public void acknowledgeAnomaly(String eventId) {
        eventRepository.findById(eventId).ifPresent(event -> {
            event.setAcknowledged(true);
            eventRepository.save(event);
        });
    }
}
