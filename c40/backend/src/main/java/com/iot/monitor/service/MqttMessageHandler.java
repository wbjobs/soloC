package com.iot.monitor.service;

import com.alibaba.fastjson.JSON;
import com.influxdb.client.WriteApi;
import com.influxdb.client.write.Point;
import com.iot.monitor.config.InfluxDBConfig;
import com.iot.monitor.model.DeviceData;
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class MqttMessageHandler {

    private final InfluxDBConfig influxDBConfig;
    private final WriteApi writeApi;
    private final WindowDataService windowDataService;
    private final Map<String, Instant> lastMessageTimestamps = new ConcurrentHashMap<>();
    private final Set<String> activeDeviceIds = ConcurrentHashMap.newKeySet();

    public MqttMessageHandler(InfluxDBConfig influxDBConfig, 
                             com.influxdb.client.InfluxDBClient influxDBClient,
                             WindowDataService windowDataService) {
        this.influxDBConfig = influxDBConfig;
        this.writeApi = influxDBClient.makeWriteApi();
        this.windowDataService = windowDataService;
    }
    
    public Set<String> getActiveDeviceIds() {
        return activeDeviceIds;
    }

    @ServiceActivator(inputChannel = "mqttInputChannel")
    public void handleMessage(Message<String> message) {
        try {
            String payload = message.getPayload();
            DeviceData deviceData = JSON.parseObject(payload, DeviceData.class);
            
            String deviceId = deviceData.getDeviceId();
            Instant messageTimestamp = deviceData.getTimestamp() != null ? deviceData.getTimestamp() : Instant.now();
            
            Instant lastTimestamp = lastMessageTimestamps.get(deviceId);
            if (lastTimestamp != null && messageTimestamp.isBefore(lastTimestamp)) {
                System.out.printf("Discarding out-of-order message for %s: %s (last: %s)%n", 
                    deviceId, messageTimestamp, lastTimestamp);
                return;
            }
            
            lastMessageTimestamps.put(deviceId, messageTimestamp);
            activeDeviceIds.add(deviceId);
            
            Point point = Point.measurement("device_metrics")
                    .addTag("deviceId", deviceId)
                    .addField("temperature", deviceData.getTemperature())
                    .addField("vibration", deviceData.getVibration())
                    .addField("current", deviceData.getCurrent())
                    .time(messageTimestamp);
            
            writeApi.writePoint(point);
            windowDataService.addDeviceData(deviceData);
            
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
