package com.gameanalytics.controller;

import com.gameanalytics.model.AnomalyAlert;
import com.gameanalytics.model.AnomalyRule;
import com.gameanalytics.service.AnomalyRuleEngineService;
import com.gameanalytics.service.AnomalyRuleService;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/anomaly")
@CrossOrigin(origins = "*")
public class AnomalyRuleController {

    private final AnomalyRuleService ruleService;
    private final AnomalyRuleEngineService ruleEngineService;

    public AnomalyRuleController(AnomalyRuleService ruleService,
                                  AnomalyRuleEngineService ruleEngineService) {
        this.ruleService = ruleService;
        this.ruleEngineService = ruleEngineService;
    }

    @PostMapping("/init-default-rules")
    public ResponseEntity<Void> initDefaultRules() {
        ruleEngineService.initDefaultRules();
        return ResponseEntity.ok().build();
    }

    @GetMapping("/rules")
    public ResponseEntity<List<AnomalyRule>> getAllRules() {
        return ResponseEntity.ok(ruleService.getAllRules());
    }

    @GetMapping("/rules/enabled")
    public ResponseEntity<List<AnomalyRule>> getEnabledRules() {
        return ResponseEntity.ok(ruleService.getEnabledRules());
    }

    @GetMapping("/rules/{id}")
    public ResponseEntity<AnomalyRule> getRuleById(@PathVariable Long id) {
        AnomalyRule rule = ruleService.getRuleById(id);
        return rule != null ? ResponseEntity.ok(rule) : ResponseEntity.notFound().build();
    }

    @PostMapping("/rules")
    public ResponseEntity<AnomalyRule> createRule(@RequestBody AnomalyRule rule) {
        return ResponseEntity.ok(ruleService.createRule(rule));
    }

    @PutMapping("/rules/{id}")
    public ResponseEntity<AnomalyRule> updateRule(@PathVariable Long id, @RequestBody AnomalyRule rule) {
        AnomalyRule updated = ruleService.updateRule(id, rule);
        return updated != null ? ResponseEntity.ok(updated) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/rules/{id}")
    public ResponseEntity<Void> deleteRule(@PathVariable Long id) {
        ruleService.deleteRule(id);
        return ResponseEntity.ok().build();
    }

    @PatchMapping("/rules/{id}/toggle")
    public ResponseEntity<AnomalyRule> toggleRule(@PathVariable Long id, @RequestParam boolean enabled) {
        AnomalyRule updated = ruleService.toggleRule(id, enabled);
        return updated != null ? ResponseEntity.ok(updated) : ResponseEntity.notFound().build();
    }

    @GetMapping("/alerts")
    public ResponseEntity<Page<AnomalyAlert>> getAlerts(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer severity,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ruleService.getAlerts(status, severity, page, size));
    }

    @GetMapping("/alerts/recent")
    public ResponseEntity<List<AnomalyAlert>> getRecentAlerts(@RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(ruleService.getRecentAlerts(hours));
    }

    @PatchMapping("/alerts/{id}/status")
    public ResponseEntity<AnomalyAlert> updateAlertStatus(
            @PathVariable Long id,
            @RequestParam String status,
            @RequestParam(required = false) String notes) {
        AnomalyAlert updated = ruleService.updateAlertStatus(id, status, notes);
        return updated != null ? ResponseEntity.ok(updated) : ResponseEntity.notFound().build();
    }

    @GetMapping("/alerts/stats")
    public ResponseEntity<Map<String, Object>> getAlertStatistics(@RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(ruleService.getAlertStatistics(hours));
    }
}
