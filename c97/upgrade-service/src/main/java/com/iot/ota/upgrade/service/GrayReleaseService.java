package com.iot.ota.upgrade.service;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.iot.ota.common.entity.*;
import com.iot.ota.upgrade.mapper.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class GrayReleaseService extends ServiceImpl<GrayStrategyMapper, GrayStrategy> {

    private static final Logger logger = LoggerFactory.getLogger(GrayReleaseService.class);

    @Autowired
    private GrayBatchMapper batchMapper;

    @Autowired
    private GrayDeviceMapper deviceMapper;

    @Autowired
    private DeviceMapper deviceInfoMapper;

    @Autowired
    private UpgradeTaskMapper taskMapper;

    @Autowired
    private UpgradeSchedulerService schedulerService;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    private static final String GRAY_CACHE_PREFIX = "gray:cache:";

    @Transactional(rollbackFor = Exception.class)
    public GrayStrategy createGrayStrategy(GrayStrategy strategy, List<String> groupIds, 
                                           List<String> regions, List<String> deviceKeys) {
        strategy.setStatus(0);
        strategy.setCurrentBatch(0);
        strategy.setCreateTime(new Date());
        save(strategy);

        generateBatches(strategy, groupIds, regions, deviceKeys);

        logger.info("Created gray strategy: {}, batches: {}", strategy.getId(), strategy.getBatchCount());
        return strategy;
    }

    private void generateBatches(GrayStrategy strategy, List<String> groupIds, 
                                 List<String> regions, List<String> deviceKeys) {
        QueryWrapper<Device> deviceQuery = new QueryWrapper<>();
        deviceQuery.eq("product_key", strategy.getProductKey());
        deviceQuery.eq("status", 1);

        if (strategy.getStrategyType() == 1 && groupIds != null && !groupIds.isEmpty()) {
            deviceQuery.in("group_id", groupIds);
        } else if (strategy.getStrategyType() == 2 && regions != null && !regions.isEmpty()) {
            deviceQuery.in("region", regions);
        } else if (strategy.getStrategyType() == 4 && deviceKeys != null && !deviceKeys.isEmpty()) {
            deviceQuery.in("device_key", deviceKeys);
        }

        List<Device> allDevices = deviceInfoMapper.selectList(deviceQuery);
        
        if (strategy.getStrategyType() == 3 && strategy.getGrayPercent() != null) {
            int targetSize = (int) (allDevices.size() * strategy.getGrayPercent() / 100.0);
            Collections.shuffle(allDevices);
            allDevices = allDevices.subList(0, Math.min(targetSize, allDevices.size()));
        }

        int batchCount = strategy.getBatchCount();
        int batchSize = (int) Math.ceil((double) allDevices.size() / batchCount);

        for (int i = 0; i < batchCount; i++) {
            int fromIndex = i * batchSize;
            int toIndex = Math.min((i + 1) * batchSize, allDevices.size());
            List<Device> batchDevices = allDevices.subList(fromIndex, toIndex);

            GrayBatch batch = new GrayBatch();
            batch.setStrategyId(strategy.getId());
            batch.setBatchNo(i + 1);
            batch.setBatchName("第" + (i + 1) + "批次");
            batch.setDeviceCount(batchDevices.size());
            batch.setStatus(0);
            batch.setCreateTime(new Date());
            batchMapper.insert(batch);

            for (Device device : batchDevices) {
                GrayDevice grayDevice = new GrayDevice();
                grayDevice.setStrategyId(strategy.getId());
                grayDevice.setBatchId(batch.getId());
                grayDevice.setDeviceKey(device.getDeviceKey());
                grayDevice.setStatus(0);
                grayDevice.setProgress(0);
                grayDevice.setCreateTime(new Date());
                deviceMapper.insert(grayDevice);
            }

            logger.info("Created gray batch {}: {} devices", i + 1, batchDevices.size());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void startGrayStrategy(Long strategyId) {
        GrayStrategy strategy = getById(strategyId);
        if (strategy == null) {
            throw new RuntimeException("Strategy not found");
        }

        strategy.setStatus(1);
        strategy.setStartTime(new Date());
        updateById(strategy);

        executeNextBatch(strategyId);
        logger.info("Started gray strategy: {}", strategyId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void executeNextBatch(Long strategyId) {
        GrayStrategy strategy = getById(strategyId);
        if (strategy == null || strategy.getStatus() != 1) {
            return;
        }

        int nextBatch = strategy.getCurrentBatch() + 1;
        if (nextBatch > strategy.getBatchCount()) {
            strategy.setStatus(3);
            strategy.setEndTime(new Date());
            updateById(strategy);
            logger.info("Gray strategy completed: {}", strategyId);
            return;
        }

        QueryWrapper<GrayBatch> batchQuery = new QueryWrapper<>();
        batchQuery.eq("strategy_id", strategyId).eq("batch_no", nextBatch);
        GrayBatch batch = batchMapper.selectOne(batchQuery);

        if (batch == null) {
            return;
        }

        batch.setStatus(1);
        batch.setStartTime(new Date());
        batchMapper.updateById(batch);

        strategy.setCurrentBatch(nextBatch);
        updateById(strategy);

        QueryWrapper<GrayDevice> deviceQuery = new QueryWrapper<>();
        deviceQuery.eq("batch_id", batch.getId());
        List<GrayDevice> devices = deviceMapper.selectList(deviceQuery);

        List<String> deviceKeys = devices.stream()
                .map(GrayDevice::getDeviceKey)
                .collect(Collectors.toList());

        String taskId = "GRAY_" + strategyId + "_" + nextBatch + "_" + System.currentTimeMillis();
        UpgradeTask task = new UpgradeTask();
        task.setTaskId(taskId);
        task.setTaskName(strategy.getStrategyName() + "-第" + nextBatch + "批次");
        task.setFirmwareId(strategy.getFirmwareId());
        task.setProductKey(strategy.getProductKey());
        task.setStatus(1);
        task.setCreateTime(new Date());
        taskMapper.insert(task);

        schedulerService.initUpgradeTask(taskId, deviceKeys);

        for (String deviceKey : deviceKeys) {
            String cacheKey = GRAY_CACHE_PREFIX + deviceKey;
            Map<String, Object> cacheData = new HashMap<>();
            cacheData.put("strategyId", strategyId);
            cacheData.put("batchId", batch.getId());
            cacheData.put("firmwareVersion", strategy.getFirmwareVersion());
            redisTemplate.opsForValue().set(cacheKey, JSON.toJSONString(cacheData), 7, TimeUnit.DAYS);
        }

        logger.info("Executing gray batch {} for strategy {}: {} devices", nextBatch, strategyId, deviceKeys.size());
    }

    @Scheduled(fixedDelay = 60000)
    public void monitorGrayBatches() {
        QueryWrapper<GrayStrategy> strategyQuery = new QueryWrapper<>();
        strategyQuery.eq("status", 1);
        List<GrayStrategy> strategies = list(strategyQuery);

        for (GrayStrategy strategy : strategies) {
            checkAndProgress(strategy.getId());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void checkAndProgress(Long strategyId) {
        GrayStrategy strategy = getById(strategyId);
        if (strategy == null) {
            return;
        }

        QueryWrapper<GrayBatch> batchQuery = new QueryWrapper<>();
        batchQuery.eq("strategy_id", strategyId).eq("status", 1);
        GrayBatch currentBatch = batchMapper.selectOne(batchQuery);

        if (currentBatch == null) {
            return;
        }

        QueryWrapper<GrayDevice> deviceQuery = new QueryWrapper<>();
        deviceQuery.eq("batch_id", currentBatch.getId());
        List<GrayDevice> devices = deviceMapper.selectList(deviceQuery);

        long successCount = devices.stream().filter(d -> d.getStatus() == 2).count();
        long failedCount = devices.stream().filter(d -> d.getStatus() == 3).count();
        long total = devices.size();
        long completed = successCount + failedCount;

        if (completed == 0) {
            return;
        }

        BigDecimal successRate = BigDecimal.valueOf(successCount)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(completed), 2, RoundingMode.HALF_UP);

        currentBatch.setSuccessCount((int) successCount);
        currentBatch.setFailedCount((int) failedCount);
        currentBatch.setSuccessRate(successRate);

        long now = new Date();

        if (completed == total) {
            currentBatch.setStatus(2);
            currentBatch.setEndTime(now);
            batchMapper.updateById(currentBatch);

            BigDecimal threshold = strategy.getSuccessRateThreshold();
            if (successRate.compareTo(threshold) >= 0) {
                long hoursSinceStart(strategyId);
            } else {
                logger.warn("Gray batch {} success rate {} below threshold {}", 
                           currentBatch.getBatchNo(), successRate, threshold);
                
                if (strategy.getEnableAutoRollback() == 1) {
                    BigDecimal failedRate = BigDecimal.valueOf(failedCount)
                            .multiply(BigDecimal.valueOf(100))
                            .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP);
                    
                    if (failedRate.compareTo(strategy.getRollbackThreshold()) >= 0) {
                        rollbackStrategy(strategyId);
                    }
                }
            }
        } else {
            long hoursSinceStart = (now.getTime() - currentBatch.getStartTime().getTime()) 
                    / (1000 * 60 * 60);
            
            if (hoursSinceStart >= strategy.getBatchIntervalHours()) {
                currentBatch.setStatus(2);
                currentBatch.setEndTime(now);
                batchMapper.updateById(currentBatch);

                if (successRate.compareTo(strategy.getSuccessRateThreshold()) >= 0) {
                    executeNextBatch(strategyId);
                }
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void rollbackStrategy(Long strategyId) {
        GrayStrategy strategy = getById(strategyId);
        if (strategy == null) {
            return;
        }

        strategy.setStatus(4);
        strategy.setEndTime(new Date());
        updateById(strategy);

        QueryWrapper<GrayBatch> batchQuery = new QueryWrapper<>();
        batchQuery.eq("strategy_id", strategyId);
        List<GrayBatch> batches = batchMapper.selectList(batchQuery);

        for (GrayBatch batch : batches) {
            if (batch.getStatus() == 1) {
                batch.setStatus(4);
                batch.setEndTime(new Date());
                batchMapper.updateById(batch);
            }
        }

        QueryWrapper<GrayDevice> deviceQuery = new QueryWrapper<>();
        deviceQuery.eq("strategy_id", strategyId).in("status", Arrays.asList(0, 1, 2));
        List<GrayDevice> devices = deviceMapper.selectList(deviceQuery);

        for (GrayDevice device : devices) {
            device.setStatus(4);
            deviceMapper.updateById(device);
            redisTemplate.delete(GRAY_CACHE_PREFIX + device.getDeviceKey());
        }

        logger.info("Rolled back gray strategy: {}", strategyId);
    }

    public void updateDeviceStatus(String deviceKey, int status, int progress, String errorCode, String errorMsg) {
        QueryWrapper<GrayDevice> query = new QueryWrapper<>();
        query.eq("device_key", deviceKey).in("status", Arrays.asList(0, 1));
        GrayDevice device = deviceMapper.selectOne(query);

        if (device == null) {
            return;
        }

        device.setStatus(status);
        device.setProgress(progress);
        device.setErrorCode(errorCode);
        device.setErrorMsg(errorMsg);
        device.setCompleteTime(new Date());
        deviceMapper.updateById(device);

        logger.debug("Updated gray device {} status: {}", deviceKey, status);
    }

    public Map<String, Object> getDeviceGrayInfo(String deviceKey) {
        String cacheKey = GRAY_CACHE_PREFIX + deviceKey;
        Object cacheData = redisTemplate.opsForValue().get(cacheKey);
        if (cacheData != null) {
            return JSON.parseObject(cacheData.toString(), Map.class);
        }
        return null;
    }

    public Map<String, Object> getStrategyProgress(Long strategyId) {
        Map<String, Object> result = new HashMap<>();

        GrayStrategy strategy = getById(strategyId);
        result.put("strategy", strategy);

        QueryWrapper<GrayBatch> batchQuery = new QueryWrapper<>();
        batchQuery.eq("strategy_id", strategyId).orderByAsc("batch_no");
        List<GrayBatch> batches = batchMapper.selectList(batchQuery);
        result.put("batches", batches);

        QueryWrapper<GrayDevice> deviceQuery = new QueryWrapper<>();
        deviceQuery.eq("strategy_id", strategyId);
        List<GrayDevice> devices = deviceMapper.selectList(deviceQuery);

        Map<Integer, Long> statusCount = devices.stream()
                .collect(Collectors.groupingBy(GrayDevice::getStatus, Collectors.counting()));
        result.put("statusStatistics", statusCount);

        long total = devices.size();
        long success = statusCount.getOrDefault(2, 0L);
        long failed = statusCount.getOrDefault(3, 0L);

        if (total > 0) {
            BigDecimal successRate = BigDecimal.valueOf(success)
                    .multiply(BigDecimal.valueOf(100))
                    .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP);
            result.put("overallSuccessRate", successRate);
        }

        return result;
    }
}
