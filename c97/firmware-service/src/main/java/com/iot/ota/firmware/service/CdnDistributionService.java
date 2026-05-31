package com.iot.ota.firmware.service;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.iot.ota.common.entity.*;
import com.iot.ota.firmware.mapper.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.File;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class CdnDistributionService extends ServiceImpl<CdnNodeMapper, CdnNode> {

    private static final Logger logger = LoggerFactory.getLogger(CdnDistributionService.class);

    @Autowired
    private FirmwareCdnCacheMapper cacheMapper;

    @Autowired
    private FirmwareMapper firmwareMapper;

    @Autowired
    private DeviceMapper deviceMapper;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private RestTemplate restTemplate;

    @Value("${ota.firmware.storage-path:/data/firmware}")
    private String storagePath;

    @Value("${ota.cdn.cache-expire-days:30}")
    private int cacheExpireDays;

    private static final String CDN_NODE_CACHE_KEY = "cdn:nodes:cache";
    private static final String CDN_CACHE_HIT_KEY = "cdn:cache:hit:";
    private static final String CDN_CACHE_MISS_KEY = "cdn:cache:miss:";

    public String getOptimalDownloadUrl(String deviceKey, Long firmwareId, String region) {
        CdnNode bestNode = selectOptimalNode(deviceKey, region, firmwareId);
        
        if (bestNode == null) {
            logger.info("No CDN node available for device {}, using origin download", deviceKey);
            return getOriginDownloadUrl(firmwareId);
        }

        QueryWrapper<FirmwareCdnCache> cacheQuery = new QueryWrapper<>();
        cacheQuery.eq("firmware_id", firmwareId)
                  .eq("node_id", bestNode.getId())
                  .eq("status", 1);
        FirmwareCdnCache cache = cacheMapper.selectOne(cacheQuery);

        if (cache != null) {
            recordCacheHit(bestNode.getId(), firmwareId);
            logger.debug("CDN cache hit for firmware {} on node {}", firmwareId, bestNode.getNodeCode());
            return cache.getCacheUrl();
        }

        recordCacheMiss(bestNode.getId(), firmwareId);
        asyncPushToCdnNode(bestNode, firmwareId);
        
        return getOriginDownloadUrl(firmwareId);
    }

    private CdnNode selectOptimalNode(String deviceKey, String region, Long firmwareId) {
        List<CdnNode> nodes = getAvailableNodes();
        if (nodes.isEmpty()) {
            return null;
        }

        Map<String, List<CdnNode>> regionNodeMap = nodes.stream()
                .collect(Collectors.groupingBy(node -> 
                    node.getRegion() != null ? node.getRegion() : "default"));

        if (region != null && regionNodeMap.containsKey(region)) {
            List<CdnNode> regionNodes = regionNodeMap.get(region);
            return selectBestNodeByPriorityAndLoad(regionNodes, firmwareId);
        }

        return selectBestNodeByPriorityAndLoad(nodes, firmwareId);
    }

    private CdnNode selectBestNodeByPriorityAndLoad(List<CdnNode> nodes, Long firmwareId) {
        String bestNodeKey = null;
        double bestScore = -1;

        for (CdnNode node : nodes) {
            double score = calculateNodeScore(node, firmwareId);
            if (score > bestScore) {
                bestScore = score;
                bestNodeKey = node.getNodeCode();
            }
        }

        final String finalBestNodeKey = bestNodeKey;
        return nodes.stream()
                .filter(n -> n.getNodeCode().equals(finalBestNodeKey))
                .findFirst()
                .orElse(null);
    }

    private double calculateNodeScore(CdnNode node, Long firmwareId) {
        double score = 100.0 - node.getPriority();

        if (node.getCacheHitRate() != null) {
            score += node.getCacheHitRate().doubleValue() * 0.3;
        }

        QueryWrapper<FirmwareCdnCache> cacheQuery = new QueryWrapper<>();
        cacheQuery.eq("firmware_id", firmwareId)
                  .eq("node_id", node.getId())
                  .eq("status", 1);
        if (cacheMapper.selectCount(cacheQuery) > 0) {
            score += 50;
        }

        if (node.getBandwidthMbps() != null) {
            score += node.getBandwidthMbps() * 0.1;
        }

        return score;
    }

    private List<CdnNode> getAvailableNodes() {
        Object cacheData = redisTemplate.opsForValue().get(CDN_NODE_CACHE_KEY);
        if (cacheData != null) {
            return JSON.parseArray(cacheData.toString(), CdnNode.class);
        }

        QueryWrapper<CdnNode> query = new QueryWrapper<>();
        query.eq("status", 1).eq("health_status", 1).orderByAsc("priority");
        List<CdnNode> nodes = list(query);

        redisTemplate.opsForValue().set(CDN_NODE_CACHE_KEY, JSON.toJSONString(nodes), 5, TimeUnit.MINUTES);
        return nodes;
    }

    @Async
    public void asyncPushToCdnNode(CdnNode node, Long firmwareId) {
        Firmware firmware = firmwareMapper.selectById(firmwareId);
        if (firmware == null) {
            return;
        }

        QueryWrapper<FirmwareCdnCache> existQuery = new QueryWrapper<>();
        existQuery.eq("firmware_id", firmwareId).eq("node_id", node.getId());
        if (cacheMapper.selectCount(existQuery) > 0) {
            return;
        }

        logger.info("Pre-caching firmware {} to CDN node {}", firmwareId, node.getNodeCode());

        FirmwareCdnCache cache = new FirmwareCdnCache();
        cache.setFirmwareId(firmwareId);
        cache.setFirmwareVersion(firmware.getFirmwareVersion());
        cache.setNodeId(node.getId());
        cache.setNodeCode(node.getNodeCode());
        cache.setCacheUrl(generateCdnUrl(node, firmware));
        cache.setFileSize(firmware.getFileSize());
        cache.setMd5Hash(firmware.getFileMd5());
        cache.setStatus(2);
        cache.setHitCount(0L);
        cache.setExpireTime(new Date(System.currentTimeMillis() + cacheExpireDays * 86400000L));
        cache.setCreateTime(new Date());
        cacheMapper.insert(cache);

        boolean pushSuccess = pushFirmwareToNode(node, firmware);
        if (pushSuccess) {
            cache.setStatus(1);
            cacheMapper.updateById(cache);
            logger.info("Firmware {} cached on CDN node {}", firmwareId, node.getNodeCode());
        }
    }

    private boolean pushFirmwareToNode(CdnNode node, Firmware firmware) {
        try {
            String pushUrl = node.getBaseUrl() + "/api/cdn/push";
            
            Map<String, Object> request = new HashMap<>();
            request.put("firmwareId", firmware.getId());
            request.put("firmwareVersion", firmware.getFirmwareVersion());
            request.put("filePath", firmware.getFilePath());
            request.put("md5", firmware.getFileMd5());
            request.put("fileSize", firmware.getFileSize());

            String response = restTemplate.postForObject(pushUrl, request, String.class);
            
            return response != null && response.contains("success");
        } catch (Exception e) {
            logger.warn("Failed to push firmware to CDN node {}: {}", node.getNodeCode(), e.getMessage());
            return false;
        }
    }

    private String generateCdnUrl(CdnNode node, Firmware firmware) {
        return node.getBaseUrl() + "/firmware/" + firmware.getProductKey() + "/" 
               + firmware.getFirmwareVersion() + "/" + firmware.getFilePath();
    }

    private String getOriginDownloadUrl(Long firmwareId) {
        return "/api/firmware/download/origin/" + firmwareId;
    }

    private void recordCacheHit(Long nodeId, Long firmwareId) {
        redisTemplate.opsForValue().increment(CDN_CACHE_HIT_KEY + nodeId);
        
        QueryWrapper<FirmwareCdnCache> query = new QueryWrapper<>();
        query.eq("firmware_id", firmwareId).eq("node_id", nodeId);
        FirmwareCdnCache cache = cacheMapper.selectOne(query);
        if (cache != null) {
            cache.setHitCount(cache.getHitCount() + 1);
            cache.setLastAccessTime(new Date());
            cacheMapper.updateById(cache);
        }
    }

    private void recordCacheMiss(Long nodeId, Long firmwareId) {
        redisTemplate.opsForValue().increment(CDN_CACHE_MISS_KEY + nodeId);
    }

    @Scheduled(fixedDelay = 300000)
    public void healthCheckAllNodes() {
        List<CdnNode> nodes = list();
        for (CdnNode node : nodes) {
            if (node.getStatus() == 1) {
                boolean healthy = checkNodeHealth(node);
                node.setHealthStatus(healthy ? 1 : 0);
                node.setLastHealthCheck(new Date());
                updateById(node);
            }
        }
        redisTemplate.delete(CDN_NODE_CACHE_KEY);
        logger.info("CDN node health check completed");
    }

    private boolean checkNodeHealth(CdnNode node) {
        if (node.getHealthCheckUrl() == null) {
            return true;
        }
        try {
            restTemplate.getForObject(node.getHealthCheckUrl(), String.class);
            return true;
        } catch (Exception e) {
            logger.warn("CDN node {} health check failed: {}", node.getNodeCode(), e.getMessage());
            return false;
        }
    }

    @Scheduled(cron = "0 0 2 * * ?")
    public void updateCacheHitRates() {
        List<CdnNode> nodes = list();
        for (CdnNode node : nodes) {
            Object hitObj = redisTemplate.opsForValue().get(CDN_CACHE_HIT_KEY + node.getId());
            Object missObj = redisTemplate.opsForValue().get(CDN_CACHE_MISS_KEY + node.getId());

            long hits = hitObj != null ? Long.parseLong(hitObj.toString()) : 0;
            long misses = missObj != null ? Long.parseLong(missObj.toString()) : 0;
            long total = hits + misses;

            if (total > 0) {
                BigDecimal hitRate = BigDecimal.valueOf(hits)
                        .multiply(BigDecimal.valueOf(100))
                        .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP);
                node.setCacheHitRate(hitRate);
                updateById(node);
            }
        }
        logger.info("CDN cache hit rates updated");
    }

    public Map<String, Object> getCdnStatistics() {
        Map<String, Object> result = new HashMap<>();

        List<CdnNode> nodes = list();
        result.put("totalNodes", nodes.size());

        long healthyNodes = nodes.stream().filter(n -> n.getHealthStatus() == 1).count();
        result.put("healthyNodes", healthyNodes);

        long cachedFiles = cacheMapper.selectCount(new QueryWrapper<>());
        result.put("cachedFiles", cachedFiles);

        BigDecimal totalTraffic = BigDecimal.ZERO;
        for (CdnNode node : nodes) {
            if (node.getTotalTrafficGb() != null) {
                totalTraffic = totalTraffic.add(node.getTotalTrafficGb());
            }
        }
        result.put("totalTrafficGb", totalTraffic);

        List<Map<String, Object>> nodeStats = new ArrayList<>();
        for (CdnNode node : nodes) {
            Map<String, Object> nodeStat = new HashMap<>();
            nodeStat.put("nodeCode", node.getNodeCode());
            nodeStat.put("region", node.getRegion());
            nodeStat.put("hitRate", node.getCacheHitRate());
            nodeStat.put("trafficGb", node.getTotalTrafficGb());
            nodeStat.put("status", node.getHealthStatus());
            nodeStats.add(nodeStat);
        }
        result.put("nodeStatistics", nodeStats);

        return result;
    }

    public void preCacheFirmware(Long firmwareId, List<Long> nodeIds) {
        Firmware firmware = firmwareMapper.selectById(firmwareId);
        if (firmware == null) {
            return;
        }

        for (Long nodeId : nodeIds) {
            CdnNode node = getById(nodeId);
            if (node != null && node.getStatus() == 1 && node.getHealthStatus() == 1) {
                asyncPushToCdnNode(node, firmwareId);
            }
        }
    }

    public void invalidateCache(Long firmwareId) {
        QueryWrapper<FirmwareCdnCache> query = new QueryWrapper<>();
        query.eq("firmware_id", firmwareId);
        List<FirmwareCdnCache> caches = cacheMapper.selectList(query);

        for (FirmwareCdnCache cache : caches) {
            cache.setStatus(0);
            cacheMapper.updateById(cache);
        }

        logger.info("Invalidated {} CDN caches for firmware {}", caches.size(), firmwareId);
    }
}
