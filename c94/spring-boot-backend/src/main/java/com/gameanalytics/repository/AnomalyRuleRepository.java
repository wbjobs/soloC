package com.gameanalytics.repository;

import com.gameanalytics.model.AnomalyRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AnomalyRuleRepository extends JpaRepository<AnomalyRule, Long> {

    @Query("SELECT r FROM AnomalyRule r WHERE r.enabled = true")
    List<AnomalyRule> findAllEnabled();

    @Query("SELECT r FROM AnomalyRule r WHERE r.ruleType = :ruleType AND r.enabled = true")
    List<AnomalyRule> findByRuleTypeAndEnabled(String ruleType);

    AnomalyRule findByRuleCode(String ruleCode);
}
