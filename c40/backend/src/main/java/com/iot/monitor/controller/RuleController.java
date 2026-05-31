package com.iot.monitor.controller;

import com.iot.monitor.model.AnomalyEvent;
import com.iot.monitor.model.DetectionRule;
import com.iot.monitor.service.RuleEngineService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/rules")
@CrossOrigin(origins = "*")
public class RuleController {

    private final RuleEngineService ruleEngineService;

    public RuleController(RuleEngineService ruleEngineService) {
        this.ruleEngineService = ruleEngineService;
    }

    @GetMapping
    public ResponseEntity<List<DetectionRule>> getAllRules() {
        return ResponseEntity.ok(ruleEngineService.getAllRules());
    }

    @GetMapping("/{id}")
    public ResponseEntity<DetectionRule> getRuleById(@PathVariable String id) {
        Optional<DetectionRule> rule = ruleEngineService.getRuleById(id);
        return rule.map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<DetectionRule> createRule(@RequestBody DetectionRule rule) {
        DetectionRule saved = ruleEngineService.saveRule(rule);
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<DetectionRule> updateRule(@PathVariable String id, @RequestBody DetectionRule rule) {
        rule.setId(id);
        DetectionRule saved = ruleEngineService.saveRule(rule);
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteRule(@PathVariable String id) {
        ruleEngineService.deleteRule(id);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/refresh")
    public ResponseEntity<Void> refreshRules() {
        ruleEngineService.refreshRules();
        return ResponseEntity.ok().build();
    }

    @GetMapping("/anomalies")
    public ResponseEntity<List<AnomalyEvent>> getRecentAnomalies() {
        return ResponseEntity.ok(ruleEngineService.getRecentAnomalies());
    }

    @GetMapping("/anomalies/{deviceId}")
    public ResponseEntity<List<AnomalyEvent>> getDeviceAnomalies(@PathVariable String deviceId) {
        return ResponseEntity.ok(ruleEngineService.getDeviceAnomalies(deviceId));
    }

    @PostMapping("/anomalies/{id}/acknowledge")
    public ResponseEntity<Void> acknowledgeAnomaly(@PathVariable String id) {
        ruleEngineService.acknowledgeAnomaly(id);
        return ResponseEntity.ok().build();
    }
}
