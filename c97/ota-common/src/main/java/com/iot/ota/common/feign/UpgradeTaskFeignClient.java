package com.iot.ota.common.feign;

import com.iot.ota.common.entity.UpgradeTask;
import com.iot.ota.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@FeignClient(name = "upgrade-service")
public interface UpgradeTaskFeignClient {

    @PostMapping("/api/upgrade/task/create")
    Result<UpgradeTask> createTask(@RequestBody Map<String, Object> taskData);

    @PostMapping("/api/upgrade/task/execute/{taskId}")
    Result<Void> executeTask(@PathVariable("taskId") String taskId);

    @GetMapping("/api/upgrade/task/{taskId}")
    Result<UpgradeTask> getTaskDetail(@PathVariable("taskId") String taskId);

    @PostMapping("/api/upgrade/progress/report")
    Result<Void> reportProgress(
            @RequestParam("taskId") String taskId,
            @RequestParam("deviceKey") String deviceKey,
            @RequestParam("progress") Integer progress,
            @RequestParam("status") Integer status
    );

    @GetMapping("/api/upgrade/task/progress/{taskId}")
    Result<Map<String, Object>> getTaskProgress(@PathVariable("taskId") String taskId);
}
