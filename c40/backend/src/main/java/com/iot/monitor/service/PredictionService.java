package com.iot.monitor.service;

import com.influxdb.client.InfluxDBClient;
import com.influxdb.client.QueryApi;
import com.influxdb.query.FluxRecord;
import com.influxdb.query.FluxTable;
import com.iot.monitor.config.InfluxDBConfig;
import com.iot.monitor.model.Alert;
import org.apache.commons.math3.stat.regression.SimpleRegression;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Service
public class PredictionService {

    private final InfluxDBClient influxDBClient;
    private final InfluxDBConfig influxDBConfig;
    private final AlertService alertService;

    @Value("${prediction.threshold}")
    private double threshold;

    @Value("${prediction.history-hours}")
    private int historyHours;

    @Value("${prediction.forecast-minutes}")
    private int forecastMinutes;

    public PredictionService(InfluxDBClient influxDBClient, InfluxDBConfig influxDBConfig, AlertService alertService) {
        this.influxDBClient = influxDBClient;
        this.influxDBConfig = influxDBConfig;
        this.alertService = alertService;
    }

    public List<Map<String, Object>> predictTemperature(String deviceId) {
        String flux = String.format(
                "from(bucket:\"%s\") |> range(start: -%dh) |> filter(fn: (r) => r._measurement == \"device_metrics\" and r.deviceId == \"%s\" and r._field == \"temperature\") |> sort(columns: [\"_time\"])",
                influxDBConfig.getBucket(), historyHours, deviceId
        );

        QueryApi queryApi = influxDBClient.getQueryApi();
        List<FluxTable> tables = queryApi.query(flux);

        if (tables.isEmpty() || tables.get(0).getRecords().isEmpty()) {
            System.out.printf("No data found for device %s, cannot predict%n", deviceId);
            return Collections.emptyList();
        }

        List<FluxRecord> records = tables.get(0).getRecords();
        
        if (records.size() < 10) {
            System.out.printf("Insufficient data for device %s: only %d points, need at least 10%n", 
                deviceId, records.size());
            return Collections.emptyList();
        }
        
        SimpleRegression regression = new SimpleRegression();
        long baseTime = records.get(0).getTime().getEpochSecond();
        int validPoints = 0;

        for (FluxRecord record : records) {
            Object value = record.getValue();
            if (value == null || record.getTime() == null) {
                continue;
            }
            try {
                long timeOffset = record.getTime().getEpochSecond() - baseTime;
                double temperature = ((Number) value).doubleValue();
                if (!Double.isNaN(temperature) && !Double.isInfinite(temperature)) {
                    regression.addData(timeOffset, temperature);
                    validPoints++;
                }
            } catch (Exception e) {
                System.err.printf("Error processing record for device %s: %s%n", deviceId, e.getMessage());
            }
        }

        if (validPoints < 10 || !regression.hasData()) {
            System.out.printf("Not enough valid data points for device %s: %d%n", deviceId, validPoints);
            return Collections.emptyList();
        }

        List<Map<String, Object>> predictions = new ArrayList<>();
        long now = Instant.now().getEpochSecond();
        long predictionBase = now - baseTime;

        for (long t = predictionBase; t <= predictionBase + forecastMinutes * 60L; t += 300) {
            double predictedTemp = regression.predict(t);
            if (Double.isNaN(predictedTemp) || Double.isInfinite(predictedTemp)) {
                continue;
            }
            Instant predictionTime = Instant.ofEpochSecond(baseTime + t);
            
            Map<String, Object> prediction = new HashMap<>();
            prediction.put("timestamp", predictionTime.toString());
            prediction.put("temperature", Math.round(predictedTemp * 100.0) / 100.0);
            predictions.add(prediction);
        }

        return predictions;
    }

    public boolean checkAlert(String deviceId, List<Map<String, Object>> predictions) {
        if (predictions.isEmpty()) {
            return false;
        }

        for (Map<String, Object> prediction : predictions) {
            double temp = (double) prediction.get("temperature");
            if (temp > threshold) {
                Alert alert = new Alert();
                alert.setDeviceId(deviceId);
                alert.setTimestamp(Instant.now());
                alert.setMessage(String.format("预测温度将超过阈值: %.2f°C > %.2f°C", temp, threshold));
                alert.setPredictedTemperature(temp);
                alert.setThreshold(threshold);
                alert.setLevel(temp > threshold + 10 ? Alert.AlertLevel.CRITICAL : Alert.AlertLevel.WARNING);
                
                alertService.createAlert(alert);
                return true;
            }
        }
        return false;
    }

    public List<DeviceStatus> getAllDeviceStatuses() {
        String flux = String.format(
                "from(bucket:\"%s\") |> range(start: -5m) |> filter(fn: (r) => r._measurement == \"device_metrics\") |> filter(fn: (r) => r._field == \"temperature\") |> last()",
                influxDBConfig.getBucket()
        );

        QueryApi queryApi = influxDBClient.getQueryApi();
        List<FluxTable> tables = queryApi.query(flux);

        List<DeviceStatus> statuses = new ArrayList<>();
        Set<String> alertedDevices = alertService.getActiveAlertDeviceIds();

        for (FluxTable table : tables) {
            for (FluxRecord record : table.getRecords()) {
                DeviceStatus status = new DeviceStatus();
                status.setDeviceId(record.getValueByKey("deviceId").toString());
                status.setLastTemperature(((Number) record.getValue()).doubleValue());
                status.setLastUpdate(record.getTime().toString());
                status.setHasAlert(alertedDevices.contains(status.getDeviceId()));
                statuses.add(status);
            }
        }

        statuses.sort(Comparator.comparing(DeviceStatus::getDeviceId));
        return statuses;
    }

    public List<Map<String, Object>> getHistoricalData(String deviceId) {
        String flux = String.format(
                "from(bucket:\"%s\") |> range(start: -1h) |> filter(fn: (r) => r._measurement == \"device_metrics\" and r.deviceId == \"%s\" and r._field == \"temperature\") |> sort(columns: [\"_time\"])",
                influxDBConfig.getBucket(), deviceId
        );

        QueryApi queryApi = influxDBClient.getQueryApi();
        List<FluxTable> tables = queryApi.query(flux);

        List<Map<String, Object>> data = new ArrayList<>();
        if (tables.isEmpty() || tables.get(0).getRecords().isEmpty()) {
            return data;
        }

        for (FluxRecord record : tables.get(0).getRecords()) {
            try {
                Object value = record.getValue();
                if (value == null || record.getTime() == null) {
                    continue;
                }
                double temperature = ((Number) value).doubleValue();
                if (Double.isNaN(temperature) || Double.isInfinite(temperature)) {
                    continue;
                }
                
                Map<String, Object> point = new HashMap<>();
                point.put("timestamp", record.getTime().toString());
                point.put("temperature", temperature);
                data.add(point);
            } catch (Exception e) {
                System.err.printf("Error processing historical record for device %s: %s%n", deviceId, e.getMessage());
            }
        }

        return data;
    }

    public static class DeviceStatus {
        private String deviceId;
        private double lastTemperature;
        private String lastUpdate;
        private boolean hasAlert;

        public String getDeviceId() { return deviceId; }
        public void setDeviceId(String deviceId) { this.deviceId = deviceId; }
        public double getLastTemperature() { return lastTemperature; }
        public void setLastTemperature(double lastTemperature) { this.lastTemperature = lastTemperature; }
        public String getLastUpdate() { return lastUpdate; }
        public void setLastUpdate(String lastUpdate) { this.lastUpdate = lastUpdate; }
        public boolean isHasAlert() { return hasAlert; }
        public void setHasAlert(boolean hasAlert) { this.hasAlert = hasAlert; }
    }
}
