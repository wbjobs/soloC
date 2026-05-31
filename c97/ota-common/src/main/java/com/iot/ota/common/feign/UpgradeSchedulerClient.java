package com.iot.ota.common.feign;

import com.iot.ota.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@FeignClient(name = "upgrade-service", contextId = "upgradeSchedulerClient", path = "/api/upgrade")
public interface UpgradeSchedulerClient {

    @PostMapping("/scheduler/acquire-permit")
    Result<Boolean> acquireDownloadPermit(@RequestParam("deviceKey") String deviceKey);

    @PostMapping("/scheduler/release-permit")
    Result<Void> releaseDownloadPermit(@RequestParam("deviceKey") String deviceKey);

    @PostMapping("/scheduler/complete-upgrade")
    Result<Void> completeDeviceUpgrade(
            @RequestParam("taskId") String taskId,
            @RequestParam("deviceKey") String deviceKey);

    @PostMapping("/scheduler/fail-upgrade")
    Result<Void> failDeviceUpgrade(
            @RequestParam("taskId") String taskId,
            @RequestParam("deviceKey") String deviceKey,
            @RequestParam(value = "allowRetry", defaultValue = "true") boolean allowRetry);

    @GetMapping("/check/{deviceKey}")
    Result<String> checkDeviceUpgrade(@PathVariable("deviceKey") String deviceKey);

    @PostMapping("/init-task")
    Result<Void> initUpgradeTask(
            @RequestParam("taskId") String taskId,
            @RequestBody List<String> deviceKeys);

    @GetMapping("/scheduler/status")
    Result<Map<String, Object>> getSchedulerStatus();
}
