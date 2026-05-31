package com.iot.ota.admin.controller;

import com.iot.ota.common.entity.Firmware;
import com.iot.ota.common.entity.UpgradeTask;
import com.iot.ota.common.result.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @Autowired
    private FirmwareFeignClient firmwareFeignClient;

    @Autowired
    private DeviceFeignClient deviceFeignClient;

    @Autowired
    private UpgradeTaskFeignClient upgradeTaskFeignClient;

    @PostMapping("/firmware/upload")
    public Result<Firmware> uploadFirmware(
            @RequestParam("file") MultipartFile file,
            @RequestParam("firmwareName") String firmwareName,
            @RequestParam("firmwareVersion") String firmwareVersion,
            @RequestParam("productKey") String productKey,
            @RequestParam(value = "description", required = false) String description) {
        return firmwareFeignClient.uploadFirmware(file, firmwareName, firmwareVersion, productKey, description);
    }

    @GetMapping("/firmware/list")
    public Result<List<Firmware>> getFirmwareList(@RequestParam String productKey) {
        return firmwareFeignClient.getFirmwareList(productKey);
    }

    @PostMapping("/task/create")
    public Result<UpgradeTask> createUpgradeTask(@RequestBody Map<String, Object> taskData) {
        return upgradeTaskFeignClient.createTask(taskData);
    }

    @PostMapping("/task/execute/{taskId}")
    public Result<Void> executeTask(@PathVariable String taskId) {
        return upgradeTaskFeignClient.executeTask(taskId);
    }

    @GetMapping("/task/{taskId}")
    public Result<UpgradeTask> getTaskDetail(@PathVariable String taskId) {
        return upgradeTaskFeignClient.getTaskDetail(taskId);
    }

    @GetMapping("/device/list")
    public Result<java.util.List<com.iot.ota.common.entity.Device>> getDeviceList(
            @RequestParam String productKey,
            @RequestParam(required = false) Long groupId) {
        return deviceFeignClient.getDeviceList(productKey, groupId);
    }

    @PostMapping("/device/rollback")
    public Result<Void> rollbackDevice(
            @RequestParam String deviceKey,
            @RequestParam String targetVersion) {
        return deviceFeignClient.rollbackDevice(deviceKey, targetVersion);
    }

    @GetMapping("/task/progress/{taskId}")
    public Result<Map<String, Object>> getTaskProgress(@PathVariable String taskId) {
        return upgradeTaskFeignClient.getTaskProgress(taskId);
    }
}
