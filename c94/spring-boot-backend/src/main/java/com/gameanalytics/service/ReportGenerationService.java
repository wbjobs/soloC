package com.gameanalytics.service;

import com.gameanalytics.model.PlayerBehavior;
import com.gameanalytics.repository.PlayerBehaviorRepository;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Service
public class ReportGenerationService {

    private final PlayerBehaviorService behaviorService;
    private final AnomalyDetectionService anomalyDetectionService;

    @Value("${analytics.report.output-path:./reports}")
    private String reportOutputPath;

    public ReportGenerationService(PlayerBehaviorService behaviorService,
                                    AnomalyDetectionService anomalyDetectionService) {
        this.behaviorService = behaviorService;
        this.anomalyDetectionService = anomalyDetectionService;
    }

    @Scheduled(cron = "0 0 0 * * ?")
    public void generateDailyReport() throws IOException {
        generateReport(24, "daily");
    }

    @Scheduled(cron = "0 0 0 * * MON")
    public void generateWeeklyReport() throws IOException {
        generateReport(168, "weekly");
    }

    public String generateReport(int hours, String reportType) throws IOException {
        File reportDir = new File(reportOutputPath);
        if (!reportDir.exists()) {
            reportDir.mkdirs();
        }

        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
        String fileName = String.format("%s_report_%s.xlsx", reportType, timestamp);
        String filePath = reportOutputPath + "/" + fileName;

        try (Workbook workbook = new XSSFWorkbook()) {
            createPopularMapsSheet(workbook, hours);
            createPopularSkillsSheet(workbook, hours);
            createTaskCompletionSheet(workbook, hours);
            createAnomaliesSheet(workbook, hours);

            try (FileOutputStream outputStream = new FileOutputStream(filePath)) {
                workbook.write(outputStream);
            }
        }

        return filePath;
    }

    private void createPopularMapsSheet(Workbook workbook, int hours) {
        Sheet sheet = workbook.createSheet("热门地图统计");
        List<Map<String, Object>> maps = behaviorService.getPopularMaps(hours);

        createHeaderRow(sheet, "排名", "地图ID", "访问次数");

        int rowNum = 1;
        for (int i = 0; i < maps.size(); i++) {
            Row row = sheet.createRow(rowNum++);
            row.createCell(0).setCellValue(i + 1);
            row.createCell(1).setCellValue(String.valueOf(maps.get(i).get("mapId")));
            row.createCell(2).setCellValue(Long.parseLong(String.valueOf(maps.get(i).get("count"))));
        }

        sheet.autoSizeColumn(0);
        sheet.autoSizeColumn(1);
        sheet.autoSizeColumn(2);
    }

    private void createPopularSkillsSheet(Workbook workbook, int hours) {
        Sheet sheet = workbook.createSheet("热门技能统计");
        List<Map<String, Object>> skills = behaviorService.getPopularSkills(hours);

        createHeaderRow(sheet, "排名", "技能名称", "使用次数");

        int rowNum = 1;
        for (int i = 0; i < skills.size(); i++) {
            Row row = sheet.createRow(rowNum++);
            row.createCell(0).setCellValue(i + 1);
            row.createCell(1).setCellValue(String.valueOf(skills.get(i).get("skillName")));
            row.createCell(2).setCellValue(Long.parseLong(String.valueOf(skills.get(i).get("count"))));
        }

        sheet.autoSizeColumn(0);
        sheet.autoSizeColumn(1);
        sheet.autoSizeColumn(2);
    }

    private void createTaskCompletionSheet(Workbook workbook, int hours) {
        Sheet sheet = workbook.createSheet("任务完成统计");
        List<Map<String, Object>> tasks = behaviorService.getTaskCompletionStats(hours);

        createHeaderRow(sheet, "任务名称", "完成人数");

        int rowNum = 1;
        for (Map<String, Object> task : tasks) {
            Row row = sheet.createRow(rowNum++);
            row.createCell(0).setCellValue(String.valueOf(task.get("taskName")));
            row.createCell(1).setCellValue(Long.parseLong(String.valueOf(task.get("completedCount"))));
        }

        sheet.autoSizeColumn(0);
        sheet.autoSizeColumn(1);
    }

    private void createAnomaliesSheet(Workbook workbook, int hours) {
        Sheet sheet = workbook.createSheet("异常行为检测");
        List<PlayerBehavior> anomalies = anomalyDetectionService.getRecentAnomalies(hours * 60);

        createHeaderRow(sheet, "玩家ID", "玩家名称", "异常类型", "地图ID", "时间");

        int rowNum = 1;
        for (PlayerBehavior anomaly : anomalies) {
            Row row = sheet.createRow(rowNum++);
            row.createCell(0).setCellValue(anomaly.getPlayerId());
            row.createCell(1).setCellValue(anomaly.getPlayerName());
            row.createCell(2).setCellValue(anomaly.getAnomalyType());
            row.createCell(3).setCellValue(anomaly.getMapId() != null ? anomaly.getMapId() : "");
            row.createCell(4).setCellValue(anomaly.getTimestamp().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        }

        for (int i = 0; i <= 4; i++) {
            sheet.autoSizeColumn(i);
        }
    }

    private void createHeaderRow(Sheet sheet, String... headers) {
        Row headerRow = sheet.createRow(0);
        CellStyle headerStyle = sheet.getWorkbook().createCellStyle();
        Font headerFont = sheet.getWorkbook().createFont();
        headerFont.setBold(true);
        headerStyle.setFont(headerFont);
        headerStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

        for (int i = 0; i < headers.length; i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(headers[i]);
            cell.setCellStyle(headerStyle);
        }
    }
}
