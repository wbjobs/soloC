package com.iot.ota.log.service;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.iot.ota.common.entity.*;
import com.iot.ota.log.mapper.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class UpgradeAnalysisService extends ServiceImpl<UpgradeAnalysisReportMapper, UpgradeAnalysisReport> {

    private static final Logger logger = LoggerFactory.getLogger(UpgradeAnalysisService.class);

    @Autowired
    private UpgradeLogMapper logMapper;

    @Autowired
    private UpgradeTaskMapper taskMapper;

    @Autowired
    private UpgradeTaskDetailMapper detailMapper;

    @Autowired
    private UpgradeErrorCodeMapper errorCodeMapper;

    @Autowired
    private DeviceMapper deviceMapper;

    @Transactional
    public UpgradeAnalysisReport generateDailyReport(String productKey, LocalDate date) {
        logger.info("Generating daily upgrade report for {} on {}", productKey, date);

        Date startDate = java.sql.Date.valueOf(date);
        Date endDate = java.sql.Date.valueOf(date.plusDays(1));

        QueryWrapper<UpgradeLog> logQuery = new QueryWrapper<>();
        logQuery.ge("create_time", startDate)
                .lt("create_time", endDate);
        if (productKey != null && !productKey.isEmpty()) {
            logQuery.eq("product_key", productKey);
        }
        List<UpgradeLog> logs = logMapper.selectList(logQuery);

        Set<String> attemptedDevices = logs.stream()
                .map(UpgradeLog::getDeviceKey)
                .collect(Collectors.toSet());

        QueryWrapper<UpgradeTaskDetail> detailQuery = new QueryWrapper<>();
        detailQuery.ge("complete_time", startDate)
                   .lt("complete_time", endDate);
        List<UpgradeTaskDetail> details = detailMapper.selectList(detailQuery);

        long successCount = details.stream().filter(d -> d.getStatus() == 2).count();
        long failedCount = details.stream().filter(d -> d.getStatus() == 3).count();
        long total = successCount + failedCount;

        UpgradeAnalysisReport report = new UpgradeAnalysisReport();
        report.setReportType(1);
        report.setReportDate(java.sql.Date.valueOf(date));
        report.setProductKey(productKey);
        report.setAttemptedDevices(attemptedDevices.size());
        report.setSuccessDevices((int) successCount);
        report.setFailedDevices((int) failedCount);

        if (total > 0) {
            BigDecimal successRate = BigDecimal.valueOf(successCount)
                    .multiply(BigDecimal.valueOf(100))
                    .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP);
            report.setSuccessRate(successRate);
        }

        Map<String, Object> failureAnalysis = analyzeFailures(details);
        report.setFailureAnalysis(JSON.toJSONString(failureAnalysis));

        Map<String, Long> errorCodeStats = details.stream()
                .filter(d -> d.getStatus() == 3 && d.getErrorCode() != null)
                .collect(Collectors.groupingBy(UpgradeTaskDetail::getErrorCode, Collectors.counting()));

        List<Map<String, Object>> topErrorCodes = errorCodeStats.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
                .limit(10)
                .map(e -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("errorCode", e.getKey());
                    map.put("count", e.getValue());
                    UpgradeErrorCode errorCode = errorCodeMapper.selectOne(
                            new QueryWrapper<UpgradeErrorCode>().eq("error_code", e.getKey()));
                    if (errorCode != null) {
                        map.put("errorName", errorCode.getErrorName());
                        map.put("category", errorCode.getErrorCategory());
                        map.put("solution", errorCode.getSolution());
                    }
                    return map;
                })
                .collect(Collectors.toList());
        report.setTopErrorCodes(JSON.toJSONString(topErrorCodes));

        Map<String, Object> regionAnalysis = analyzeByRegion(logs, details);
        report.setRegionAnalysis(JSON.toJSONString(regionAnalysis));

        Map<String, Object> versionAnalysis = analyzeByVersion(details);
        report.setVersionAnalysis(JSON.toJSONString(versionAnalysis));

        report.setRecommendations(generateRecommendations(failureAnalysis, topErrorCodes));
        report.setStatus(1);
        report.setCreateTime(new Date());

        QueryWrapper<UpgradeAnalysisReport> existQuery = new QueryWrapper<>();
        existQuery.eq("report_type", 1)
                  .eq("report_date", report.getReportDate())
                  .eq("product_key", productKey);
        UpgradeAnalysisReport existing = getOne(existQuery);

        if (existing != null) {
            report.setId(existing.getId());
            updateById(report);
        } else {
            save(report);
        }

        logger.info("Daily upgrade report generated: {}", report.getId());
        return report;
    }

    private Map<String, Object> analyzeFailures(List<UpgradeTaskDetail> details) {
        Map<String, Object> result = new HashMap<>();

        Map<String, Long> categoryStats = new HashMap<>();
        Map<String, Integer> categoryRetry = new HashMap<>();

        for (UpgradeTaskDetail detail : details) {
            if (detail.getStatus() == 3 && detail.getErrorCode() != null) {
                UpgradeErrorCode errorCode = errorCodeMapper.selectOne(
                        new QueryWrapper<UpgradeErrorCode>().eq("error_code", detail.getErrorCode()));

                if (errorCode != null) {
                    String category = errorCode.getErrorCategory();
                    categoryStats.put(category, categoryStats.getOrDefault(category, 0L) + 1);
                    
                    if (detail.getRetryTimes() != null && detail.getRetryTimes() > 0) {
                        categoryRetry.put(category, categoryRetry.getOrDefault(category, 0) + detail.getRetryTimes());
                    }
                }
            }
        }

        long totalFailures = categoryStats.values().stream().mapToLong(Long::longValue).sum();
        Map<String, Object> detailedStats = new HashMap<>();
        for (Map.Entry<String, Long> entry : categoryStats.entrySet()) {
            Map<String, Object> catDetail = new HashMap<>();
            catDetail.put("count", entry.getValue());
            catDetail.put("percentage", totalFailures > 0 ? 
                    BigDecimal.valueOf(entry.getValue() * 100)
                            .divide(BigDecimal.valueOf(totalFailures), 2, RoundingMode.HALF_UP) : BigDecimal.ZERO);
            catDetail.put("avgRetries", categoryRetry.getOrDefault(entry.getKey(), 0));
            detailedStats.put(entry.getKey(), catDetail);
        }

        result.put("byCategory", detailedStats);
        result.put("totalFailures", totalFailures);

        return result;
    }

    private Map<String, Object> analyzeByRegion(List<UpgradeLog> logs, List<UpgradeTaskDetail> details) {
        Map<String, Object> result = new HashMap<>();

        Map<String, Set<String>> regionDevices = new HashMap<>();
        Map<String, Long> regionSuccess = new HashMap<>();
        Map<String, Long> regionFailed = new HashMap<>();

        for (UpgradeLog log : logs) {
            Device device = deviceMapper.selectOne(
                    new QueryWrapper<Device>().eq("device_key", log.getDeviceKey()));
            if (device != null && device.getRegion() != null) {
                String region = device.getRegion();
                regionDevices.computeIfAbsent(region, k -> new HashSet<>()).add(log.getDeviceKey());
            }
        }

        for (UpgradeTaskDetail detail : details) {
            Device device = deviceMapper.selectOne(
                    new QueryWrapper<Device>().eq("device_key", detail.getDeviceKey()));
            if (device != null && device.getRegion() != null) {
                String region = device.getRegion();
                if (detail.getStatus() == 2) {
                    regionSuccess.put(region, regionSuccess.getOrDefault(region, 0L) + 1);
                } else if (detail.getStatus() == 3) {
                    regionFailed.put(region, regionFailed.getOrDefault(region, 0L) + 1);
                }
            }
        }

        List<Map<String, Object>> regionStats = new ArrayList<>();
        for (Map.Entry<String, Set<String>> entry : regionDevices.entrySet()) {
            Map<String, Object> stat = new HashMap<>();
            stat.put("region", entry.getKey());
            stat.put("deviceCount", entry.getValue().size());

            long success = regionSuccess.getOrDefault(entry.getKey(), 0L);
            long failed = regionFailed.getOrDefault(entry.getKey(), 0L);
            stat.put("successCount", success);
            stat.put("failedCount", failed);

            if (success + failed > 0) {
                BigDecimal rate = BigDecimal.valueOf(success * 100)
                        .divide(BigDecimal.valueOf(success + failed), 2, RoundingMode.HALF_UP);
                stat.put("successRate", rate);
            }

            regionStats.add(stat);
        }

        regionStats.sort((a, b) -> ((BigDecimal) b.getOrDefault("successRate", BigDecimal.ZERO))
                .compareTo((BigDecimal) a.getOrDefault("successRate", BigDecimal.ZERO)));

        result.put("regions", regionStats);
        return result;
    }

    private Map<String, Object> analyzeByVersion(List<UpgradeTaskDetail> details) {
        Map<String, Object> result = new HashMap<>();

        Map<String, Long> versionTotal = new HashMap<>();
        Map<String, Long> versionSuccess = new HashMap<>();
        Map<String, Long> versionFailed = new HashMap<>();

        for (UpgradeTaskDetail detail : details) {
            String version = detail.getFirmwareVersion();
            if (version != null) {
                versionTotal.put(version, versionTotal.getOrDefault(version, 0L) + 1);
                if (detail.getStatus() == 2) {
                    versionSuccess.put(version, versionSuccess.getOrDefault(version, 0L) + 1);
                } else if (detail.getStatus() == 3) {
                    versionFailed.put(version, versionFailed.getOrDefault(version, 0L) + 1);
                }
            }
        }

        List<Map<String, Object>> versionStats = new ArrayList<>();
        for (Map.Entry<String, Long> entry : versionTotal.entrySet()) {
            Map<String, Object> stat = new HashMap<>();
            stat.put("firmwareVersion", entry.getKey());
            stat.put("totalCount", entry.getValue());
            stat.put("successCount", versionSuccess.getOrDefault(entry.getKey(), 0L));
            stat.put("failedCount", versionFailed.getOrDefault(entry.getKey(), 0L));

            long success = versionSuccess.getOrDefault(entry.getKey(), 0L);
            long failed = versionFailed.getOrDefault(entry.getKey(), 0L);
            if (success + failed > 0) {
                BigDecimal rate = BigDecimal.valueOf(success * 100)
                        .divide(BigDecimal.valueOf(success + failed), 2, RoundingMode.HALF_UP);
                stat.put("successRate", rate);
            }

            versionStats.add(stat);
        }

        result.put("versions", versionStats);
        return result;
    }

    private String generateRecommendations(Map<String, Object> failureAnalysis, 
                                           List<Map<String, Object>> topErrorCodes) {
        List<String> recommendations = new ArrayList<>();

        Map<String, Object> byCategory = (Map<String, Object>) failureAnalysis.get("byCategory");
        if (byCategory != null) {
            for (Map.Entry<String, Object> entry : byCategory.entrySet()) {
                Map<String, Object> catDetail = (Map<String, Object>) entry.getValue();
                BigDecimal percentage = (BigDecimal) catDetail.get("percentage");
                if (percentage != null && percentage.compareTo(BigDecimal.valueOf(30)) > 0) {
                    switch (entry.getKey()) {
                        case "NETWORK":
                            recommendations.add("网络问题占比较高(" + percentage + "%)，建议优化CDN节点覆盖并增强断点续传机制");
                            break;
                        case "DEVICE":
                            recommendations.add("设备问题占比较高(" + percentage + "%)，建议检查设备存储空间和电池状态");
                            break;
                        case "FIRMWARE":
                            recommendations.add("固件问题占比较高(" + percentage + "%)，建议加强固件完整性校验并验证兼容性");
                            break;
                        case "SERVER":
                            recommendations.add("服务端问题占比较高(" + percentage + "%)，建议排查服务器负载和网络带宽");
                            break;
                    }
                }
            }
        }

        if (!topErrorCodes.isEmpty()) {
            Map<String, Object> topError = topErrorCodes.get(0);
            recommendations.add("最常见错误: " + topError.get("errorName") + "，建议优先解决: " + topError.get("solution"));
        }

        return String.join("; ", recommendations);
    }

    public UpgradeAnalysisReport generateTaskReport(String taskId) {
        logger.info("Generating task report for {}", taskId);

        UpgradeTask task = taskMapper.selectOne(
                new QueryWrapper<UpgradeTask>().eq("task_id", taskId));
        if (task == null) {
            return null;
        }

        QueryWrapper<UpgradeTaskDetail> detailQuery = new QueryWrapper<>();
        detailQuery.eq("task_id", taskId);
        List<UpgradeTaskDetail> details = detailMapper.selectList(detailQuery);

        QueryWrapper<UpgradeLog> logQuery = new QueryWrapper<>();
        logQuery.eq("task_id", taskId);
        List<UpgradeLog> logs = logMapper.selectList(logQuery);

        UpgradeAnalysisReport report = new UpgradeAnalysisReport();
        report.setReportType(4);
        report.setReportDate(new Date());
        report.setTaskId(taskId);
        report.setProductKey(task.getProductKey());
        report.setAttemptedDevices(details.size());
        report.setSuccessDevices(task.getSuccessCount());
        report.setFailedDevices(task.getFailedCount());
        report.setSuccessRate(task.getSuccessRate());

        Map<String, Object> failureAnalysis = analyzeFailures(details);
        report.setFailureAnalysis(JSON.toJSONString(failureAnalysis));

        Map<String, Object> regionAnalysis = analyzeByRegion(logs, details);
        report.setRegionAnalysis(JSON.toJSONString(regionAnalysis));

        Map<String, Object> versionAnalysis = analyzeByVersion(details);
        report.setVersionAnalysis(JSON.toJSONString(versionAnalysis));

        report.setRecommendations(generateRecommendations(failureAnalysis, new ArrayList<>()));
        report.setStatus(1);
        report.setCreateTime(new Date());

        save(report);

        logger.info("Task report generated: {}", report.getId());
        return report;
    }

    @Scheduled(cron = "0 30 2 * * ?")
    public void generateDailyReports() {
        LocalDate yesterday = LocalDate.now().minusDays(1);
        QueryWrapper<Device> deviceQuery = new QueryWrapper<>();
        deviceQuery.select("DISTINCT product_key");
        List<String> productKeys = deviceMapper.selectList(deviceQuery).stream()
                .map(Device::getProductKey)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        for (String productKey : productKeys) {
            generateDailyReport(productKey, yesterday);
        }

        logger.info("Daily upgrade reports generated for {} products", productKeys.size());
    }

    public List<Map<String, Object>> getTrendAnalysis(String productKey, int days) {
        List<Map<String, Object>> result = new ArrayList<>();
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusDays(days);

        QueryWrapper<UpgradeAnalysisReport> query = new QueryWrapper<>();
        query.eq("report_type", 1)
                .between("report_date", startDate, endDate)
                .orderByAsc("report_date");
        if (productKey != null && !productKey.isEmpty()) {
            query.eq("product_key", productKey);
        }

        List<UpgradeAnalysisReport> reports = list(query);

        for (UpgradeAnalysisReport report : reports) {
            Map<String, Object> point = new HashMap<>();
            point.put("date", report.getReportDate());
            point.put("successRate", report.getSuccessRate());
            point.put("attemptedDevices", report.getAttemptedDevices());
            point.put("successDevices", report.getSuccessDevices());
            point.put("failedDevices", report.getFailedDevices());
            result.add(point);
        }

        return result;
    }

    public Map<String, Object> getDashboardStatistics(String productKey) {
        Map<String, Object> result = new HashMap<>();

        LocalDate today = LocalDate.now();
        LocalDate weekAgo = today.minusDays(7);
        LocalDate monthAgo = today.minusDays(30);

        QueryWrapper<UpgradeTaskDetail> detailQuery = new QueryWrapper<>();
        detailQuery.ge("complete_time", java.sql.Date.valueOf(monthAgo));
        if (productKey != null && !productKey.isEmpty()) {
            detailQuery.eq("product_key", productKey);
        }
        List<UpgradeTaskDetail> monthDetails = detailMapper.selectList(detailQuery);

        long totalUpgrades = monthDetails.size();
        long success = monthDetails.stream().filter(d -> d.getStatus() == 2).count();
        long failed = monthDetails.stream().filter(d -> d.getStatus() == 3).count();

        result.put("monthlyTotalUpgrades", totalUpgrades);
        result.put("monthlySuccessCount", success);
        result.put("monthlyFailedCount", failed);
        
        if (totalUpgrades > 0) {
            BigDecimal successRate = BigDecimal.valueOf(success * 100)
                    .divide(BigDecimal.valueOf(totalUpgrades), 2, RoundingMode.HALF_UP);
            result.put("monthlySuccessRate", successRate);
        }

        List<UpgradeTaskDetail> weekDetails = monthDetails.stream()
                .filter(d -> d.getCompleteTime() != null && 
                        d.getCompleteTime().after(java.sql.Date.valueOf(weekAgo)))
                .collect(Collectors.toList());
        
        result.put("weeklyUpgrades", weekDetails.size());

        QueryWrapper<UpgradeTask> taskQuery = new QueryWrapper<>();
        taskQuery.eq("status", 1);
        if (productKey != null && !productKey.isEmpty()) {
            taskQuery.eq("product_key", productKey);
        }
        Integer ongoingTasks = taskMapper.selectCount(taskQuery).intValue();
        result.put("ongoingTasks", ongoingTasks);

        Set<String> activeDevices = monthDetails.stream()
                .map(UpgradeTaskDetail::getDeviceKey)
                .collect(Collectors.toSet());
        result.put("activeDevices", activeDevices.size());

        return result;
    }
}
