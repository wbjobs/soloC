package com.iot.ota.log.controller;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.iot.ota.common.entity.UpgradeLog;
import com.iot.ota.common.entity.UpgradeTaskDetail;
import com.iot.ota.common.feign.UpgradeTaskFeignClient;
import com.iot.ota.common.result.Result;
import com.iot.ota.log.mapper.UpgradeLogMapper;
import com.iot.ota.log.mapper.UpgradeTaskDetailMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/log")
public class LogReportController {

    private static final Logger logger = LoggerFactory.getLogger(LogReportController.class);

    private static final String LAST_STATUS_KEY = "upgrade:last_status:";
    private static final String DEVICE_REPORT_LOCK = "upgrade:report_lock:";

    @Autowired
    private UpgradeLogMapper logMapper;

    @Autowired
    private UpgradeTaskDetailMapper detailMapper;

    @Autowired
    private UpgradeTaskFeignClient taskFeignClient;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @PostMapping("/report")
    @Transactional(rollbackFor = Exception.class)
    public Result<Void> reportStatus(@RequestBody Map<String, Object> reportData) {
        String deviceKey = (String) reportData.get("deviceKey");
        String taskId = (String) reportData.get("taskId");
        Integer status = (Integer) reportData.get("status");
        Integer progress = (Integer) reportData.get("progress");
        String message = (String) reportData.get("message");

        if (deviceKey == null || taskId == null) {
            return Result.error("Invalid parameters");
        }

        String lockKey = DEVICE_REPORT_LOCK + deviceKey + ":" + taskId;
        Boolean locked = redisTemplate.opsForValue().setIfAbsent(lockKey, "1", 10, TimeUnit.SECONDS);
        
        if (!Boolean.TRUE.equals(locked)) {
            logger.debug("Report request suppressed for device: {}", deviceKey);
            return Result.success();
        }

        try {
            String lastStatusKey = LAST_STATUS_KEY + deviceKey + ":" + taskId;
            String lastStatusJson = (String) redisTemplate.opsForValue().get(lastStatusKey);
            
            if (lastStatusJson != null) {
                Map<String, Object> lastStatus = JSON.parseObject(lastStatusJson, Map.class);
                Integer lastStatusValue = (Integer) lastStatus.get("status");
                Integer lastProgressValue = (Integer) lastStatus.get("progress");
                
                if (Objects.equals(lastStatusValue, status) && 
                    Objects.equals(lastProgressValue, progress) &&
                    progress < 100) {
                    logger.debug("Duplicate report suppressed for device: {}, status: {}, progress: {}", 
                                deviceKey, status, progress);
                    return Result.success();
                }
            }

            UpgradeLog log = new UpgradeLog();
            log.setDeviceKey(deviceKey);
            log.setTaskId(taskId);
            log.setStatus(status);
            log.setProgress(progress);
            log.setLogContent(message);
            log.setLogType(status == 3 ? 3 : 1);
            log.setCreateTime(new Date());
            logMapper.insert(log);

            QueryWrapper<UpgradeTaskDetail> wrapper = new QueryWrapper<>();
            wrapper.eq("task_id", taskId).eq("device_key", deviceKey);
            UpgradeTaskDetail detail = detailMapper.selectOne(wrapper);

            if (detail != null) {
                boolean shouldUpdate = false;
                
                if (status == 2) {
                    detail.setStatus(2);
                    detail.setProgress(100);
                    detail.setEndTime(new Date());
                    shouldUpdate = true;
                    logger.info("Device {} upgrade completed successfully", deviceKey);
                    
                    taskFeignClient.completeDeviceUpgrade(taskId, deviceKey);
                    
                } else if (status == 3) {
                    int currentRetry = detail.getRetryTimes() != null ? detail.getRetryTimes() : 0;
                    
                    if (currentRetry < 3) {
                        detail.setRetryTimes(currentRetry + 1);
                        detail.setProgress(progress);
                        detail.setStatus(0);
                        detail.setErrorCode("RETRY_" + currentRetry);
                        detail.setErrorMsg(message);
                        
                        taskFeignClient.failDeviceUpgrade(taskId, deviceKey, true);
                        logger.info("Device {} upgrade failed, retry {}/{}", 
                                   deviceKey, currentRetry + 1, 3);
                    } else {
                        detail.setStatus(3);
                        detail.setProgress(progress);
                        detail.setEndTime(new Date());
                        detail.setErrorCode("MAX_RETRY");
                        detail.setErrorMsg(message);
                        
                        taskFeignClient.failDeviceUpgrade(taskId, deviceKey, false);
                        logger.warn("Device {} upgrade failed, max retries reached", deviceKey);
                    }
                    shouldUpdate = true;
                    
                } else if (status == 1) {
                    detail.setStatus(1);
                    detail.setProgress(progress);
                    detail.setStartTime(new Date());
                    shouldUpdate = true;
                    
                } else {
                    if (detail.getStatus() != null && detail.getStatus() != 2 && detail.getStatus() != 3) {
                        detail.setProgress(progress);
                        shouldUpdate = true;
                    }
                }

                if (shouldUpdate) {
                    detailMapper.updateById(detail);
                    
                    Map<String, Object> statusToCache = new HashMap<>();
                    statusToCache.put("status", status);
                    statusToCache.put("progress", progress);
                    statusToCache.put("timestamp", System.currentTimeMillis());
                    redisTemplate.opsForValue().set(lastStatusKey, JSON.toJSONString(statusToCache), 5, TimeUnit.MINUTES);
                }
            }

            return Result.success();

        } finally {
            redisTemplate.delete(lockKey);
        }
    }

    @GetMapping("/query")
    public Result<List<UpgradeLog>> queryLogs(
            @RequestParam(required = false) String deviceKey,
            @RequestParam(required = false) String taskId,
            @RequestParam(defaultValue = "100") int limit) {

        QueryWrapper<UpgradeLog> wrapper = new QueryWrapper<>();
        if (deviceKey != null) {
            wrapper.eq("device_key", deviceKey);
        }
        if (taskId != null) {
            wrapper.eq("task_id", taskId);
        }
        wrapper.orderByDesc("create_time").last("LIMIT " + limit);

        List<UpgradeLog> logs = logMapper.selectList(wrapper);
        return Result.success(logs);
    }

    @GetMapping("/detail/{taskId}/{deviceKey}")
    public Result<UpgradeTaskDetail> getDetail(
            @PathVariable String taskId,
            @PathVariable String deviceKey) {

        QueryWrapper<UpgradeTaskDetail> wrapper = new QueryWrapper<>();
        wrapper.eq("task_id", taskId).eq("device_key", deviceKey);
        UpgradeTaskDetail detail = detailMapper.selectOne(wrapper);

        return Result.success(detail);
    }
}
