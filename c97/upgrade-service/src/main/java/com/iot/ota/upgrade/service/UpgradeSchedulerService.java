package com.iot.ota.upgrade.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.iot.ota.common.entity.UpgradeTask;
import com.iot.ota.common.entity.UpgradeTaskDetail;
import com.iot.ota.upgrade.mapper.UpgradeTaskDetailMapper;
import com.iot.ota.upgrade.mapper.UpgradeTaskMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class UpgradeSchedulerService {

    private static final Logger logger = LoggerFactory.getLogger(UpgradeSchedulerService.class);

    private static final String UPGRADE_QUEUE_KEY = "upgrade:queue:";
    private static final String UPGRADE_ACTIVE_KEY = "upgrade:active:";
    private static final String UPGRADE_RATE_LIMIT_KEY = "upgrade:rate:";
    private static final String DEVICE_LAST_REQUEST_KEY = "upgrade:last_req:";

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private UpgradeTaskMapper taskMapper;

    @Autowired
    private UpgradeTaskDetailMapper detailMapper;

    @Value("${ota.max-concurrent-upgrades:50}")
    private int maxConcurrentUpgrades;

    @Value("${ota.max-download-rate:100}")
    private int maxDownloadRatePerMinute;

    @Value("${ota.batch-size:10}")
    private int batchSize;

    @Value("${ota.min-request-interval:3000}")
    private long minRequestInterval;

    private final AtomicInteger activeUpgrades = new AtomicInteger(0);
    private final Semaphore downloadSemaphore = new Semaphore(maxConcurrentUpgrades);
    private final Map<String, AtomicInteger> taskProgressMap = new ConcurrentHashMap<>();

    @Scheduled(fixedDelay = 5000)
    public void processUpgradeQueue() {
        QueryWrapper<UpgradeTask> wrapper = new QueryWrapper<>();
        wrapper.eq("status", 1);
        List<UpgradeTask> tasks = taskMapper.selectList(wrapper);

        for (UpgradeTask task : tasks) {
            processTaskBatch(task.getTaskId());
        }
    }

    @Scheduled(fixedRate = 60000)
    public void resetRateLimiter() {
        redisTemplate.delete(UPGRADE_RATE_LIMIT_KEY + "*");
        logger.info("Rate limiter reset");
    }

    public void processTaskBatch(String taskId) {
        String queueKey = UPGRADE_QUEUE_KEY + taskId;
        String activeKey = UPGRADE_ACTIVE_KEY + taskId;

        Set<Object> activeDevices = redisTemplate.opsForSet().members(activeKey);
        int activeCount = activeDevices != null ? activeDevices.size() : 0;

        if (activeCount >= maxConcurrentUpgrades) {
            return;
        }

        int availableSlots = maxConcurrentUpgrades - activeCount;
        int batchCount = Math.min(availableSlots, batchSize);

        if (batchCount <= 0) {
            return;
        }

        List<Object> batchDevices = redisTemplate.opsForList().range(queueKey, 0, batchCount - 1);
        if (batchDevices == null || batchDevices.isEmpty()) {
            return;
        }

        for (Object deviceKeyObj : batchDevices) {
            String deviceKey = (String) deviceKeyObj;
            redisTemplate.opsForList().remove(queueKey, 1, deviceKey);
            redisTemplate.opsForSet().add(activeKey, deviceKey);
            activeUpgrades.incrementAndGet();

            notifyDeviceToUpgrade(taskId, deviceKey);
        }

        logger.info("Started batch upgrade for {} devices in task: {}, active: {}/{}", 
                   batchDevices.size(), taskId, activeCount + batchDevices.size(), maxConcurrentUpgrades);
    }

    private void notifyDeviceToUpgrade(String taskId, String deviceKey) {
        String notificationKey = "upgrade:notify:" + deviceKey;
        redisTemplate.opsForValue().set(notificationKey, taskId, 5, TimeUnit.MINUTES);
        
        QueryWrapper<UpgradeTaskDetail> wrapper = new QueryWrapper<>();
        wrapper.eq("task_id", taskId).eq("device_key", deviceKey);
        UpgradeTaskDetail detail = detailMapper.selectOne(wrapper);
        
        if (detail != null) {
            detail.setStatus(1);
            detail.setStartTime(new Date());
            detailMapper.updateById(detail);
        }
    }

    public void addToUpgradeQueue(String taskId, List<String> deviceKeys) {
        String queueKey = UPGRADE_QUEUE_KEY + taskId;
        List<String> shuffledKeys = new ArrayList<>(deviceKeys);
        Collections.shuffle(shuffledKeys);
        
        for (String deviceKey : shuffledKeys) {
            redisTemplate.opsForList().rightPush(queueKey, deviceKey);
        }
        
        logger.info("Added {} devices to upgrade queue for task: {}", deviceKeys.size(), taskId);
    }

    public boolean acquireDownloadPermit(String deviceKey) {
        String lastReqKey = DEVICE_LAST_REQUEST_KEY + deviceKey;
        Long lastRequest = (Long) redisTemplate.opsForValue().get(lastReqKey);
        long now = System.currentTimeMillis();
        
        if (lastRequest != null && (now - lastRequest) < minRequestInterval) {
            return false;
        }
        
        String rateKey = UPGRADE_RATE_LIMIT_KEY + deviceKey;
        Long requestCount = redisTemplate.opsForValue().increment(rateKey);
        
        if (requestCount != null && requestCount > maxDownloadRatePerMinute) {
            return false;
        }
        
        try {
            boolean acquired = downloadSemaphore.tryAcquire(100, TimeUnit.MILLISECONDS);
            if (acquired) {
                redisTemplate.opsForValue().set(lastReqKey, now, 1, TimeUnit.MINUTES);
            }
            return acquired;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    public void releaseDownloadPermit(String deviceKey) {
        downloadSemaphore.release();
    }

    public void completeDeviceUpgrade(String taskId, String deviceKey) {
        String activeKey = UPGRADE_ACTIVE_KEY + taskId;
        redisTemplate.opsForSet().remove(activeKey, deviceKey);
        activeUpgrades.decrementAndGet();
        releaseDownloadPermit(deviceKey);
        
        redisTemplate.delete("upgrade:notify:" + deviceKey);
        redisTemplate.delete(DEVICE_LAST_REQUEST_KEY + deviceKey);
        
        logger.info("Device {} completed upgrade for task: {}", deviceKey, taskId);
    }

    public void failDeviceUpgrade(String taskId, String deviceKey, boolean allowRetry) {
        String activeKey = UPGRADE_ACTIVE_KEY + taskId;
        redisTemplate.opsForSet().remove(activeKey, deviceKey);
        activeUpgrades.decrementAndGet();
        releaseDownloadPermit(deviceKey);
        
        if (allowRetry) {
            String queueKey = UPGRADE_QUEUE_KEY + taskId;
            redisTemplate.opsForList().rightPush(queueKey, deviceKey);
            logger.info("Device {} failed, requeued for retry", deviceKey);
        }
        
        redisTemplate.delete("upgrade:notify:" + deviceKey);
    }

    public String checkDeviceUpgrade(String deviceKey) {
        String notificationKey = "upgrade:notify:" + deviceKey;
        Object taskId = redisTemplate.opsForValue().get(notificationKey);
        return taskId != null ? (String) taskId : null;
    }

    @Async
    public void initUpgradeTask(String taskId, List<String> deviceKeys) {
        addToUpgradeQueue(taskId, deviceKeys);
        logger.info("Upgrade task {} initialized with {} devices", taskId, deviceKeys.size());
    }

    public Map<String, Object> getSchedulerStatus() {
        Map<String, Object> status = new HashMap<>();
        status.put("activeUpgrades", activeUpgrades.get());
        status.put("maxConcurrentUpgrades", maxConcurrentUpgrades);
        status.put("availablePermits", downloadSemaphore.availablePermits());
        status.put("maxDownloadRatePerMinute", maxDownloadRatePerMinute);
        return status;
    }
}
