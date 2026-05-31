package com.iot.monitor.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class PredictionScheduler {

    private final PredictionService predictionService;

    @Value("${prediction.prediction-interval-minutes:5}")
    private int predictionIntervalMinutes;

    public PredictionScheduler(PredictionService predictionService) {
        this.predictionService = predictionService;
    }

    @Scheduled(fixedRateString = "${prediction.prediction-interval-minutes:5}000")
    public void runPredictionsForAllDevices() {
        List<PredictionService.DeviceStatus> devices = predictionService.getAllDeviceStatuses();
        
        for (PredictionService.DeviceStatus device : devices) {
            try {
                List<Map<String, Object>> predictions = predictionService.predictTemperature(device.getDeviceId());
                predictionService.checkAlert(device.getDeviceId(), predictions);
            } catch (Exception e) {
                System.err.println("Error predicting for device " + device.getDeviceId() + ": " + e.getMessage());
            }
        }
    }
}
