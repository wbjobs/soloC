package com.iot.monitor.controller;

import com.iot.monitor.model.Alert;
import com.iot.monitor.service.AlertService;
import com.iot.monitor.service.PredictionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class DeviceController {

    private final PredictionService predictionService;
    private final AlertService alertService;

    public DeviceController(PredictionService predictionService, AlertService alertService) {
        this.predictionService = predictionService;
        this.alertService = alertService;
    }

    @GetMapping("/devices")
    public ResponseEntity<List<PredictionService.DeviceStatus>> getDevices() {
        return ResponseEntity.ok(predictionService.getAllDeviceStatuses());
    }

    @GetMapping("/devices/{deviceId}/history")
    public ResponseEntity<List<Map<String, Object>>> getHistoricalData(@PathVariable String deviceId) {
        return ResponseEntity.ok(predictionService.getHistoricalData(deviceId));
    }

    @GetMapping("/devices/{deviceId}/predictions")
    public ResponseEntity<List<Map<String, Object>>> getPredictions(@PathVariable String deviceId) {
        return ResponseEntity.ok(predictionService.predictTemperature(deviceId));
    }

    @GetMapping("/alerts")
    public ResponseEntity<List<Alert>> getActiveAlerts() {
        return ResponseEntity.ok(alertService.getActiveAlerts());
    }

    @DeleteMapping("/alerts/{deviceId}")
    public ResponseEntity<Map<String, String>> clearAlert(@PathVariable String deviceId) {
        alertService.clearAlert(deviceId);
        Map<String, String> response = new HashMap<>();
        response.put("message", "Alert cleared for device: " + deviceId);
        return ResponseEntity.ok(response);
    }
}
