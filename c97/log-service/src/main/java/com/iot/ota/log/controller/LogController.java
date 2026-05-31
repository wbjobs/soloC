package com.iot.ota.log.controller;

import com.iot.ota.common.entity.UpgradeLog;
import com.iot.ota.common.result.Result;
import com.iot.ota.log.service.UpgradeLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Date;
import java.util.Map;

@RestController
@RequestMapping("/api/log")
public class LogController {

    @Autowired
    private UpgradeLogService logService;

    @Autowired
    private UpgradeTaskFeignClient upgradeTaskFeignClient;

    @PostMapping("/report")
    public Result<Void> reportLog(@RequestBody Map<String, Object> logData) {
        UpgradeLog log = new UpgradeLog();
        log.setDeviceKey((String) logData.get("deviceKey"));
        log.setTaskId((String) logData.get("taskId"));
        log.setProgress((Integer) logData.get("progress"));
        log.setStatus((Integer) logData.get("status"));
        log.setLogContent((String) logData.get("message"));
        log.setLogType(1);
        log.setCreateTime(new Date());
        logService.save(log);

        if (log.getTaskId() != null) {
            upgradeTaskFeignClient.reportProgress(
                log.getTaskId(),
                log.getDeviceKey(),
                log.getProgress(),
                log.getStatus()
            );
        }

        return Result.success();
    }

    @GetMapping("/device/{deviceKey}")
    public Result<java.util.List<UpgradeLog>> getDeviceLogs(@PathVariable String deviceKey) {
        return Result.success(logService.getDeviceLogs(deviceKey));
    }

    @GetMapping("/task/{taskId}")
    public Result<java.util.List<UpgradeLog>> getTaskLogs(@PathVariable String taskId) {
        return Result.success(logService.getTaskLogs(taskId));
    }
}
