#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <esp_ota_ops.h>
#include <mbedtls/md5.h>

#define WIFI_SSID "your_wifi_ssid"
#define WIFI_PASSWORD "your_wifi_password"
#define OTA_SERVER "http://your-server.com"
#define DEVICE_KEY "ESP32_DEVICE_001"
#define PRODUCT_KEY "ESP32_PRODUCT_001"
#define CHUNK_SIZE 8192
#define MAX_RETRY 5
#define MAX_TOTAL_RETRY 10
#define WIFI_RECONNECT_DELAY 5000
#define HTTP_TIMEOUT 30000
#define DOWNLOAD_TIMEOUT 60000

Preferences prefs;
String currentVersion = "1.0.0";
String firmwareVersion = "";
String firmwareMd5 = "";
String currentTaskId = "";
unsigned long firmwareSize = 0;
unsigned long downloadedBytes = 0;
int retryCount = 0;
int totalRetryCount = 0;
bool isUpgrading = false;
bool otaVerified = false;
unsigned long lastWifiCheck = 0;
unsigned long downloadStartTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  prefs.begin("ota_storage", false);
  
  loadOtaState();
  verifyBootPartition();
  
  Serial.println("Connecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\nWiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
  
  lastWifiCheck = millis();
  checkFirmwareUpdate();
}

void loop() {
  if (millis() - lastWifiCheck > 10000) {
    ensureWifiConnected();
    lastWifiCheck = millis();
  }
  
  if (!isUpgrading) {
    checkUpgradeTask();
  }
  delay(1000);
}

void loadOtaState() {
  downloadedBytes = prefs.getULong("downloaded", 0);
  firmwareVersion = prefs.getString("version", "");
  firmwareMd5 = prefs.getString("md5", "");
  firmwareSize = prefs.getULong("size", 0);
  totalRetryCount = prefs.getInt("totalRetry", 0);
  otaVerified = prefs.getBool("verified", false);
  
  if (downloadedBytes > 0) {
    Serial.printf("Resuming OTA from %lu bytes, total retry: %d\n", downloadedBytes, totalRetryCount);
  }
}

void saveOtaState() {
  prefs.putULong("downloaded", downloadedBytes);
  prefs.putString("version", firmwareVersion);
  prefs.putString("md5", firmwareMd5);
  prefs.putULong("size", firmwareSize);
  prefs.putInt("totalRetry", totalRetryCount);
  prefs.putBool("verified", otaVerified);
}

void clearOtaState() {
  prefs.remove("downloaded");
  prefs.remove("version");
  prefs.remove("md5");
  prefs.remove("size");
  prefs.remove("totalRetry");
  prefs.remove("verified");
  downloadedBytes = 0;
  firmwareVersion = "";
  firmwareMd5 = "";
  firmwareSize = 0;
  totalRetryCount = 0;
  otaVerified = false;
}

bool ensureWifiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }
  
  Serial.println("WiFi disconnected, reconnecting...");
  reportUpgradeStatus(currentTaskId, 1, (downloadedBytes * 100) / max(firmwareSize, 1UL), "WiFi reconnecting");
  
  WiFi.reconnect();
  
  unsigned long start = millis();
  while (millis() - start < WIFI_RECONNECT_DELAY && WiFi.status() != WL_CONNECTED) {
    delay(100);
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi reconnected");
    reportUpgradeStatus(currentTaskId, 1, (downloadedBytes * 100) / max(firmwareSize, 1UL), "WiFi reconnected");
    return true;
  }
  
  Serial.println("WiFi reconnection failed");
  return false;
}

void verifyBootPartition() {
  const esp_partition_t *running = esp_ota_get_running_partition();
  esp_ota_img_states_t ota_state;
  
  if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK) {
    if (ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
      Serial.println("First boot after OTA, verifying...");
      
      if (esp_ota_mark_app_valid_cancel_rollback() == ESP_OK) {
        Serial.println("OTA app verified, rollback canceled");
        otaVerified = true;
        saveOtaState();
        reportUpgradeStatus(currentTaskId, 2, 100, "OTA verified successfully");
      } else {
        Serial.println("Failed to mark app valid, will rollback on next boot");
        esp_ota_mark_app_invalid_rollback_and_reboot();
      }
    }
  }
}

void checkFirmwareUpdate() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String(OTA_SERVER) + "/api/upgrade/check?deviceKey=" + DEVICE_KEY + "&productKey=" + PRODUCT_KEY + "&version=" + currentVersion;
  
  http.begin(url);
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String payload = http.getString();
    Serial.println("Check response: " + payload);
    
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, payload);
    
    if (!error && doc["code"] == 200) {
      JsonObject data = doc["data"];
      bool hasUpdate = data["hasUpdate"];
      
      if (hasUpdate) {
        firmwareVersion = data["firmwareVersion"].as<String>();
        firmwareMd5 = data["firmwareMd5"].as<String>();
        firmwareSize = data["firmwareSize"];
        String taskId = data["taskId"].as<String>();
        
        Serial.printf("New firmware available: %s, size: %lu\n", firmwareVersion.c_str(), firmwareSize);
        
        startOTA(taskId);
      }
    }
  } else {
    Serial.printf("Check update failed, code: %d\n", httpCode);
  }
  
  http.end();
}

void checkUpgradeTask() {
  checkFirmwareUpdate();
}

void startOTA(String taskId) {
  if (isUpgrading) return;
  
  isUpgrading = true;
  currentTaskId = taskId;
  retryCount = 0;
  downloadStartTime = millis();
  
  Serial.println("Starting OTA update...");
  reportUpgradeStatus(taskId, 1, 0, "Starting OTA");
  
  performOTA(taskId);
}

void performOTA(String taskId) {
  if (totalRetryCount >= MAX_TOTAL_RETRY) {
    Serial.println("Max total retry reached, OTA failed");
    reportUpgradeStatus(taskId, 3, (downloadedBytes * 100) / max(firmwareSize, 1UL), "Max total retry reached");
    isUpgrading = false;
    clearOtaState();
    return;
  }
  
  if (retryCount >= MAX_RETRY) {
    Serial.println("Max retry reached for this phase, waiting...");
    delay(30000);
    retryCount = 0;
    totalRetryCount++;
    saveOtaState();
  }
  
  if (!ensureWifiConnected()) {
    retryCount++;
    totalRetryCount++;
    saveOtaState();
    delay(5000);
    performOTA(taskId);
    return;
  }
  
  if (downloadedBytes > 0 && downloadedBytes >= firmwareSize) {
    Serial.println("Firmware already downloaded, verifying...");
    if (verifyFirmware()) {
      finishOTA(taskId);
    } else {
      Serial.println("Verification failed, redownloading...");
      clearOtaState();
      retryCount++;
      totalRetryCount++;
      saveOtaState();
      delay(3000);
      performOTA(taskId);
    }
    return;
  }
  
  if (!Update.isRunning()) {
    if (downloadedBytes == 0) {
      Update.abort();
    }
    
    if (!Update.begin(firmwareSize)) {
      Serial.println("Update.begin() failed!");
      Update.printError(Serial);
      retryCount++;
      totalRetryCount++;
      saveOtaState();
      delay(2000);
      performOTA(taskId);
      return;
    }
  }
  
  Serial.printf("Connecting to download firmware... (retry: %d/%d, total: %d/%d)\n", 
                retryCount, MAX_RETRY, totalRetryCount, MAX_TOTAL_RETRY);
  
  HTTPClient http;
  String url = String(OTA_SERVER) + "/api/firmware/download?deviceKey=" + DEVICE_KEY + "&taskId=" + taskId;
  
  http.begin(url);
  http.addHeader("Range", "bytes=" + String(downloadedBytes) + "-");
  http.setTimeout(HTTP_TIMEOUT);
  http.setConnectTimeout(HTTP_TIMEOUT);
  
  int httpCode = http.GET();
  
  if (httpCode == 200 || httpCode == 206) {
    WiFiClient *stream = http.getStreamPtr();
    int contentLength = http.getSize();
    
    Serial.printf("Downloading from %lu bytes, content length: %d\n", downloadedBytes, contentLength);
    
    unsigned long lastProgressTime = millis();
    unsigned long lastDataTime = millis();
    unsigned long delayTime = 10 + (totalRetryCount * 5);
    
    while (http.connected() && downloadedBytes < firmwareSize) {
      if (!ensureWifiConnected()) {
        break;
      }
      
      size_t available = stream->available();
      
      if (available) {
        lastDataTime = millis();
        uint8_t buffer[CHUNK_SIZE];
        int bytesRead = stream->readBytes(buffer, min((size_t)CHUNK_SIZE, available));
        
        size_t written = Update.write(buffer, bytesRead);
        
        if (written != bytesRead) {
          Serial.printf("Write mismatch! Expected: %d, Written: %d\n", bytesRead, written);
          Update.printError(Serial);
          break;
        }
        
        downloadedBytes += bytesRead;
        saveOtaState();
        
        if (millis() - lastProgressTime > 5000) {
          int progress = (downloadedBytes * 100) / firmwareSize;
          float speed = (downloadedBytes / 1024.0f) / ((millis() - downloadStartTime) / 1000.0f);
          Serial.printf("Progress: %d%% (%lu/%lu), Speed: %.2f KB/s\n", 
                        progress, downloadedBytes, firmwareSize, speed);
          reportUpgradeStatus(taskId, 2, progress, "Downloading");
          lastProgressTime = millis();
        }
      } else {
        if (millis() - lastDataTime > DOWNLOAD_TIMEOUT) {
          Serial.println("Download timeout! No data received.");
          break;
        }
        delay(delayTime);
      }
    }
    
    http.end();
    
    if (downloadedBytes >= firmwareSize) {
      Serial.println("Download completed!");
      
      if (verifyFirmware()) {
        finishOTA(taskId);
      } else {
        Serial.println("Firmware verification failed! Redownloading...");
        clearOtaState();
        retryCount++;
        totalRetryCount++;
        saveOtaState();
        delay(5000);
        performOTA(taskId);
      }
    } else {
      Serial.printf("Download incomplete: %lu/%lu bytes\n", downloadedBytes, firmwareSize);
      retryCount++;
      totalRetryCount++;
      saveOtaState();
      delay(3000 + (retryCount * 2000));
      performOTA(taskId);
    }
  } else {
    Serial.printf("Download failed, code: %d\n", httpCode);
    if (httpCode == 404) {
      Serial.println("Firmware not found on server");
      reportUpgradeStatus(taskId, 3, (downloadedBytes * 100) / max(firmwareSize, 1UL), "Firmware not found");
      isUpgrading = false;
      clearOtaState();
      http.end();
      return;
    }
    http.end();
    retryCount++;
    totalRetryCount++;
    saveOtaState();
    delay(5000 + (retryCount * 1000));
    performOTA(taskId);
  }
}

bool verifyFirmware() {
  Serial.println("Verifying firmware...");
  
  if (!Update.end(true)) {
    Serial.println("Update.end() failed!");
    Update.printError(Serial);
    return false;
  }
  
  if (!Update.isFinished()) {
    Serial.println("Update not finished!");
    return false;
  }
  
  const esp_partition_t *update_partition = esp_ota_get_next_update_partition(NULL);
  if (!update_partition) {
    Serial.println("Failed to get update partition!");
    return false;
  }
  
  Serial.printf("Verifying partition: %s, size: 0x%lx\n", 
                update_partition->label, firmwareSize);
  
  const size_t blockSize = 4096;
  uint8_t *buffer = (uint8_t *)malloc(blockSize);
  if (!buffer) {
    Serial.println("Memory allocation failed!");
    return false;
  }
  
  uint8_t md5Result[16];
  mbedtls_md5_context md5_ctx;
  mbedtls_md5_init(&md5_ctx);
  mbedtls_md5_starts_ret(&md5_ctx);
  
  for (size_t offset = 0; offset < firmwareSize; offset += blockSize) {
    size_t readSize = min(blockSize, firmwareSize - offset);
    
    esp_err_t err = esp_partition_read(update_partition, offset, buffer, readSize);
    if (err != ESP_OK) {
      Serial.printf("Partition read failed at offset: %zu, err: %d\n", offset, err);
      free(buffer);
      mbedtls_md5_free(&md5_ctx);
      return false;
    }
    
    mbedtls_md5_update_ret(&md5_ctx, buffer, readSize);
    
    if (offset % (blockSize * 10) == 0) {
      Serial.printf("Verifying... %.1f%%\n", (offset * 100.0f) / firmwareSize);
    }
  }
  
  mbedtls_md5_finish_ret(&md5_ctx, md5Result);
  mbedtls_md5_free(&md5_ctx);
  free(buffer);
  
  char md5String[33];
  for (int i = 0; i < 16; i++) {
    sprintf(&md5String[i * 2], "%02x", md5Result[i]);
  }
  
  Serial.printf("Calculated MD5: %s\n", md5String);
  Serial.printf("Expected MD5:   %s\n", firmwareMd5.c_str());
  
  if (String(md5String) != firmwareMd5) {
    Serial.println("MD5 verification failed!");
    Update.abort();
    return false;
  }
  
  Serial.println("Firmware verification passed!");
  return true;
}

void finishOTA(String taskId) {
  Serial.println("OTA update successful! Preparing to reboot...");
  reportUpgradeStatus(taskId, 2, 100, "Verification successful");
  
  clearOtaState();
  isUpgrading = false;
  
  reportUpgradeStatus(taskId, 2, 100, "Preparing to reboot");
  
  delay(2000);
  
  Serial.println("Rebooting...");
  reportUpgradeStatus(taskId, 2, 100, "Rebooting");
  
  delay(1000);
  ESP.restart();
}

bool reportUpgradeStatus(String taskId, int status, int progress, String message) {
  if (WiFi.status() != WL_CONNECTED) return false;
  
  int maxRetries = 3;
  int retryDelay = 1000;
  
  for (int attempt = 1; attempt <= maxRetries; attempt++) {
    HTTPClient http;
    String url = String(OTA_SERVER) + "/api/log/report";
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000);
    
    DynamicJsonDocument doc(512);
    doc["deviceKey"] = DEVICE_KEY;
    doc["taskId"] = taskId;
    doc["status"] = status;
    doc["progress"] = progress;
    doc["message"] = message;
    doc["logType"] = status == 3 ? 3 : 1;
    doc["attempt"] = attempt;
    
    String payload;
    serializeJson(doc, payload);
    
    int httpCode = http.POST(payload);
    
    if (httpCode == 200) {
      Serial.printf("Status reported successfully: status=%d, progress=%d%%\n", status, progress);
      http.end();
      return true;
    }
    
    Serial.printf("Report status failed (attempt %d/%d): code=%d\n", 
                  attempt, maxRetries, httpCode);
    http.end();
    
    if (attempt < maxRetries) {
      delay(retryDelay * attempt);
    }
  }
  
  Serial.println("All report attempts failed");
  return false;
}
