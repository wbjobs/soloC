package com.iot.ota.upgrade.controller;

import com.iot.ota.common.result.Result;
import com.iot.ota.upgrade.service.UpgradeSchedulerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/upgrade")
public class UpgradeSchedulerController {

    @Autowired
    private UpgradeSchedulerService schedulerService;

    @PostMapping("/scheduler/acquire-permit")
    public Result<Boolean> acquireDownloadPermit(@RequestParam String deviceKey) {
        boolean result = schedulerService.acquireDownloadPermit(deviceKey);
        return Result.success(result);
    }

    @PostMapping("/scheduler/release-permit")
    public Result<Void> releaseDownloadPermit(@RequestParam String deviceKey) {
        schedulerService.releaseDownloadPermit(deviceKey);
        return Result.success();
    }

    @PostMapping("/scheduler/complete-upgrade")
    public Result<Void> completeDeviceUpgrade(
            @RequestParam String taskId,
            @RequestParam String deviceKey) {
        schedulerService.completeDeviceUpgrade(taskId, deviceKey);
        return Result.success();
    }

    @PostMapping("/scheduler/fail-upgrade")
    public Result<Void> failDeviceUpgrade(
            @RequestParam String taskId,
            @RequestParam String deviceKey,
            @RequestParam(defaultValue = "true") boolean allowRetry) {
        schedulerService.failDeviceUpgrade(taskId, deviceKey, allowRetry);
        return Result.success();
    }

    @GetMapping("/check/{deviceKey}")
    public Result<String> checkDeviceUpgrade(@PathVariable String deviceKey) {
        String taskId = schedulerService.checkDeviceUpgrade(deviceKey);
        return Result.success(taskId);
    }

    @PostMapping("/init-task")
    public Result<Void> initUpgradeTask(
            @RequestParam String taskId,
            @RequestBody List<String> deviceKeys) {
        schedulerService.initUpgradeTask(taskId, deviceKeys);
        return Result.success();
    }

    @GetMapping("/scheduler/status")
    public Result<Map<String, Object>> getSchedulerStatus() {
        return Result.success(schedulerService.getSchedulerStatus());
    }
}
