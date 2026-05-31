package com.iot.monitor.repository;

import com.iot.monitor.model.DetectionRule;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DetectionRuleRepository extends MongoRepository<DetectionRule, String> {
    List<DetectionRule> findByEnabled(boolean enabled);
}
