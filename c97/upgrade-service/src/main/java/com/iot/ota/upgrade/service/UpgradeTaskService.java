package com.iot.ota.upgrade.service;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.iot.ota.common.entity.Device;
import com.iot.ota.common.entity.UpgradeTask;
import com.iot.ota.common.entity.UpgradeTaskDetail;
import com.iot.ota.upgrade.mapper.UpgradeTaskMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Service
public class UpgradeTaskService extends ServiceImpl<UpgradeTaskMapper, UpgradeTask> {

    @Autowired
    private UpgradeTaskDetailService taskDetailService;

    @Autowired
    private DeviceFeignClient deviceFeignClient;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Transactional(rollbackFor = Exception.class)
    public UpgradeTask createTask(UpgradeTask task, List<String> deviceKeys) {
        task.setTaskId(UUID.randomUUID().toString().replace("-", ""));
        task.setStatus(0);
        task.setCreateTime(new Date());
        task.setDeviceCount(deviceKeys.size());
        task.setSuccessCount(0);
        task.setFailedCount(0);
        task.setUpgradingCount(0);
        
        if (task.getMaxRetryTimes() == null) {
            task.setMaxRetryTimes(3);
        }
        
        save(task);

        List<UpgradeTaskDetail> details = new ArrayList<>();
        for (String deviceKey : deviceKeys) {
            UpgradeTaskDetail detail = new UpgradeTaskDetail();
            detail.setTaskId(task.getTaskId());
            detail.setDeviceKey(deviceKey);
            detail.setFirmwareId(task.getFirmwareId());
            detail.setStatus(0);
            detail.setProgress(0);
            detail.setRetryTimes(0);
            detail.setCreateTime(new Date());
            details.add(detail);
        }
        taskDetailService.saveBatch(details);

        return task;
    }

    @Async
    public void executeTask(String taskId) {
        UpgradeTask task = getOne(new QueryWrapper<UpgradeTask>().eq("task_id", taskId));
        if (task == null || task.getStatus() != 0) {
            return;
        }

        task.setStatus(1);
        updateById(task);

        List<UpgradeTaskDetail> details = taskDetailService.list(
            new QueryWrapper<UpgradeTaskDetail>().eq("task_id", taskId)
        );

        for (UpgradeTaskDetail detail : details) {
            dispatchUpgrade(detail);
        }
    }

    private void dispatchUpgrade(UpgradeTaskDetail detail) {
        redisTemplate.opsForValue().set(
            "upgrade:pending:" + detail.getDeviceKey(),
            JSON.toJSONString(detail),
            30 * 60
        );
        
        detail.setStatus(1);
        detail.setStartTime(new Date());
        taskDetailService.updateById(detail);
    }

    public void reportProgress(String taskId, String deviceKey, int progress, int status) {
        QueryWrapper<UpgradeTaskDetail> wrapper = new QueryWrapper<>();
        wrapper.eq("task_id", taskId).eq("device_key", deviceKey);
        UpgradeTaskDetail detail = taskDetailService.getOne(wrapper);
        
        if (detail == null) return;
        
        detail.setProgress(progress);
        detail.setStatus(status);
        
        if (status == 2) {
            detail.setEndTime(new Date());
        } else if (status == 3) {
            detail.setEndTime(new Date());
            
            if (detail.getRetryTimes() < 3) {
                detail.setRetryTimes(detail.getRetryTimes() + 1);
                retryUpgrade(detail);
            }
        }
        
        taskDetailService.updateById(detail);
        updateTaskStatistics(taskId);
    }

    private void retryUpgrade(UpgradeTaskDetail detail) {
        detail.setStatus(0);
        detail.setProgress(0);
        detail.setStartTime(null);
        detail.setEndTime(null);
        
        dispatchUpgrade(detail);
    }

    private void updateTaskStatistics(String taskId) {
        List<UpgradeTaskDetail> details = taskDetailService.list(
            new QueryWrapper<UpgradeTaskDetail>().eq("task_id", taskId)
        );
        
        int success = 0, failed = 0, upgrading = 0;
        for (UpgradeTaskDetail d : details) {
            if (d.getStatus() == 2) success++;
            else if (d.getStatus() == 3) failed++;
            else if (d.getStatus() == 1) upgrading++;
        }
        
        UpgradeTask task = getOne(new QueryWrapper<UpgradeTask>().eq("task_id", taskId));
        task.setSuccessCount(success);
        task.setFailedCount(failed);
        task.setUpgradingCount(upgrading);
        
        if (task.getStatus() == 1 && success + failed == details.size()) {
            task.setStatus(2);
        }
        
        updateById(task);
    }
}
