package com.iot.monitor.repository;

import com.iot.monitor.model.AnomalyEvent;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface AnomalyEventRepository extends MongoRepository<AnomalyEvent, String> {
    List<AnomalyEvent> findByDeviceIdAndDetectedAtAfter(String deviceId, Instant after);
    List<AnomalyEvent> findByAcknowledgedFalse();
}
