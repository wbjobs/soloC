package com.iot.ota.firmware.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.iot.ota.common.entity.Firmware;
import com.iot.ota.common.result.Result;
import com.iot.ota.firmware.feign.UpgradeSchedulerClient;
import com.iot.ota.firmware.mapper.FirmwareMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.*;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@RestController
@RequestMapping("/api/firmware")
public class FirmwareDownloadController {

    private static final Logger logger = LoggerFactory.getLogger(FirmwareDownloadController.class);

    @Autowired
    private FirmwareMapper firmwareMapper;

    @Autowired
    private UpgradeSchedulerClient schedulerClient;

    @Value("${ota.firmware.storage-path:/data/firmware}")
    private String storagePath;

    @Value("${ota.download.chunk-size:8192}")
    private int defaultChunkSize;

    @Value("${ota.download.max-bandwidth-mbps:100}")
    private int maxBandwidthMbps;

    @Value("${ota.download.speed-limit-kbps:500}")
    private int speedLimitKbps;

    private final AtomicLong totalBandwidth = new AtomicLong(0);
    private final Map<String, AtomicLong> deviceBandwidthMap = new ConcurrentHashMap<>();

    @GetMapping("/download")
    public ResponseEntity<StreamingResponseBody> downloadFirmware(
            @RequestParam String deviceKey,
            @RequestParam String taskId,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader) {

        Result<Boolean> permitResult = schedulerClient.acquireDownloadPermit(deviceKey);
        if (permitResult != null && permitResult.getCode() == 200 && !Boolean.TRUE.equals(permitResult.getData())) {
            logger.warn("Device {} rate limited, try again later", deviceKey);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", "5")
                    .build();
        }

        QueryWrapper<Firmware> wrapper = new QueryWrapper<>();
        wrapper.eq("id", taskId).or().eq("download_url", taskId);
        Firmware firmware = firmwareMapper.selectOne(wrapper);

        if (firmware == null) {
            schedulerClient.releaseDownloadPermit(deviceKey);
            return ResponseEntity.notFound().build();
        }

        File firmwareFile = new File(storagePath, firmware.getFilePath());
        if (!firmwareFile.exists()) {
            schedulerClient.releaseDownloadPermit(deviceKey);
            return ResponseEntity.notFound().build();
        }

        long fileSize = firmwareFile.length();
        long start = 0;
        long end = fileSize - 1;

        if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
            String[] ranges = rangeHeader.substring(6).split("-");
            try {
                if (ranges.length > 0 && !ranges[0].isEmpty()) {
                    start = Long.parseLong(ranges[0]);
                }
                if (ranges.length > 1 && !ranges[1].isEmpty()) {
                    end = Long.parseLong(ranges[1]);
                }
            } catch (NumberFormatException e) {
                start = 0;
                end = fileSize - 1;
            }
        }

        if (start >= fileSize) {
            schedulerClient.releaseDownloadPermit(deviceKey);
            return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).build();
        }

        end = Math.min(end, fileSize - 1);
        long contentLength = end - start + 1;

        logger.info("Device {} downloading firmware {}: {}-{}/{}", 
                   deviceKey, firmware.getFirmwareName(), start, end, fileSize);

        long finalStart = start;
        long finalEnd = end;

        StreamingResponseBody responseBody = outputStream -> {
            RandomAccessFile raf = null;
            try {
                raf = new RandomAccessFile(firmwareFile, "r");
                raf.seek(finalStart);

                byte[] buffer = new byte[defaultChunkSize];
                long bytesRemaining = contentLength;
                long startTime = System.currentTimeMillis();
                long bytesSent = 0;

                while (bytesRemaining > 0) {
                    int bytesToRead = (int) Math.min(buffer.length, bytesRemaining);
                    int bytesRead = raf.read(buffer, 0, bytesToRead);

                    if (bytesRead == -1) {
                        break;
                    }

                    outputStream.write(buffer, 0, bytesRead);
                    bytesRemaining -= bytesRead;
                    bytesSent += bytesRead;

                    applySpeedLimit(bytesSent, startTime);

                    if (bytesSent % (1024 * 1024) == 0) {
                        outputStream.flush();
                    }
                }

                outputStream.flush();
                logger.info("Device {} completed download: {} bytes", deviceKey, contentLength);

            } catch (IOException e) {
                logger.warn("Download interrupted for device {}: {}", deviceKey, e.getMessage());
                throw e;
            } finally {
                if (raf != null) {
                    try {
                        raf.close();
                    } catch (IOException e) {
                        // ignore
                    }
                }
                schedulerClient.releaseDownloadPermit(deviceKey);
            }
        };

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        headers.setContentDispositionFormData("attachment", firmware.getFirmwareName());
        headers.set("Accept-Ranges", "bytes");
        headers.setContentLength(contentLength);

        if (rangeHeader != null) {
            headers.set("Content-Range", "bytes " + start + "-" + end + "/" + fileSize);
            return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                    .headers(headers)
                    .body(responseBody);
        } else {
            return ResponseEntity.ok()
                    .headers(headers)
                    .body(responseBody);
        }
    }

    private void applySpeedLimit(long bytesSent, long startTime) throws InterruptedException {
        if (speedLimitKbps <= 0) {
            return;
        }

        long elapsedTime = System.currentTimeMillis() - startTime;
        if (elapsedTime > 0) {
            long currentSpeedKbps = (bytesSent * 8) / elapsedTime;

            if (currentSpeedKbps > speedLimitKbps) {
                long extraBytes = (currentSpeedKbps - speedLimitKbps) * elapsedTime / 8;
                long sleepTime = (extraBytes * 1000) / (speedLimitKbps * 128);

                if (sleepTime > 0 && sleepTime < 1000) {
                    Thread.sleep(sleepTime);
                }
            }
        }
    }

    @GetMapping("/info/{firmwareId}")
    public Result<Firmware> getFirmwareInfo(@PathVariable Long firmwareId) {
        Firmware firmware = firmwareMapper.selectById(firmwareId);
        if (firmware == null) {
            return Result.error("Firmware not found");
        }
        return Result.success(firmware);
    }
}
