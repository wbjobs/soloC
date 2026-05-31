package com.gameanalytics.service;

import com.gameanalytics.model.AnomalyAlert;
import com.gameanalytics.model.AnomalyRule;
import com.gameanalytics.repository.AnomalyAlertRepository;
import com.gameanalytics.repository.AnomalyRuleRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AnomalyRuleService {

    private final AnomalyRuleRepository ruleRepository;
    private final AnomalyAlertRepository alertRepository;

    public AnomalyRuleService(AnomalyRuleRepository ruleRepository,
                              AnomalyAlertRepository alertRepository) {
        this.ruleRepository = ruleRepository;
        this.alertRepository = alertRepository;
    }

    public List<AnomalyRule> getAllRules() {
        return ruleRepository.findAll();
    }

    public List<AnomalyRule> getEnabledRules() {
        return ruleRepository.findAllEnabled();
    }

    public AnomalyRule getRuleById(Long id) {
        return ruleRepository.findById(id).orElse(null);
    }

    @Transactional
    public AnomalyRule createRule(AnomalyRule rule) {
        return ruleRepository.save(rule);
    }

    @Transactional
    public AnomalyRule updateRule(Long id, AnomalyRule rule) {
        AnomalyRule existing = ruleRepository.findById(id).orElse(null);
        if (existing == null) {
            return null;
        }
        existing.setRuleName(rule.getRuleName());
        existing.setDescription(rule.getDescription());
        existing.setConditionJson(rule.getConditionJson());
        existing.setSeverity(rule.getSeverity());
        existing.setEnabled(rule.getEnabled());
        existing.setTriggerAlert(rule.getTriggerAlert());
        existing.setAlertChannels(rule.getAlertChannels());
        return ruleRepository.save(existing);
    }

    @Transactional
    public void deleteRule(Long id) {
        ruleRepository.deleteById(id);
    }

    @Transactional
    public AnomalyRule toggleRule(Long id, boolean enabled) {
        AnomalyRule rule = ruleRepository.findById(id).orElse(null);
        if (rule != null) {
            rule.setEnabled(enabled);
            return ruleRepository.save(rule);
        }
        return null;
    }

    public Page<AnomalyAlert> getAlerts(String status, Integer severity, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        if (status != null) {
            return alertRepository.findByStatusOrderByCreatedAtDesc(status, pageable);
        }
        if (severity != null) {
            return alertRepository.findBySeverityOrderByCreatedAtDesc(severity, pageable);
        }
        return alertRepository.findAll(pageable);
    }

    public List<AnomalyAlert> getRecentAlerts(int hours) {
        LocalDateTime startTime = LocalDateTime.now().minusHours(hours);
        return alertRepository.findRecentAlerts(startTime);
    }

    @Transactional
    public AnomalyAlert updateAlertStatus(Long id, String status, String notes) {
        AnomalyAlert alert = alertRepository.findById(id).orElse(null);
        if (alert != null) {
            alert.setStatus(status);
            if (notes != null) {
                alert.setNotes(notes);
            }
            return alertRepository.save(alert);
        }
        return null;
    }

    public Map<String, Object> getAlertStatistics(int hours) {
        LocalDateTime startTime = LocalDateTime.now().minusHours(hours);
        Map<String, Object> stats = new HashMap<>();

        List<Object[]> severityStats = alertRepository.getAlertStatsBySeverity(startTime);
        Map<String, Long> severityMap = new HashMap<>();
        for (Object[] row : severityStats) {
            severityMap.put("SEVERITY_" + row[0], (Long) row[1]);
        }
        stats.put("bySeverity", severityMap);

        List<Object[]> statusStats = alertRepository.getAlertStatsByStatus(startTime);
        Map<String, Long> statusMap = new HashMap<>();
        for (Object[] row : statusStats) {
            statusMap.put((String) row[0], (Long) row[1]);
        }
        stats.put("byStatus", statusMap);

        List<Object[]> serverStats = alertRepository.getAlertStatsByServer(startTime);
        Map<String, Long> serverMap = new HashMap<>();
        for (Object[] row : serverStats) {
            serverMap.put((String) row[0], (Long) row[1]);
        }
        stats.put("byServer", serverMap);

        return stats;
    }
}
