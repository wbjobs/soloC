package controllers

import (
	"bytes"
	"clipboard-sync/config"
	"clipboard-sync/models"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klauspost/compress/gzip"
)

type ClipboardDataRequest struct {
	DataID       string    `json:"data_id"`
	DataType     string    `json:"data_type" binding:"required"`
	Content      string    `json:"content"`
	ContentHash  string    `json:"content_hash"`
	ImagePath    string    `json:"image_path"`
	Tags         string    `json:"tags"`
	IsSensitive  bool      `json:"is_sensitive"`
	IsDeleted    bool      `json:"is_deleted"`
	ModifiedTime time.Time `json:"modified_time" binding:"required"`
	DeviceUUID   string    `json:"device_uuid" binding:"required"`
}

type SyncRequest struct {
	DeviceUUID   string              `json:"device_uuid" binding:"required"`
	LastSyncTime time.Time           `json:"last_sync_time"`
	Data         []ClipboardDataRequest `json:"data"`
}

func computeHash(content string) string {
	hash := sha256.Sum256([]byte(content))
	return hex.EncodeToString(hash[:])
}

type CompressedPayload struct {
	Compressed bool   `json:"_compressed"`
	Data       string `json:"data"`
}

func decompressPayload(c *gin.Context) (*SyncRequest, error) {
	var raw map[string]interface{}
	if err := c.ShouldBindJSON(&raw); err != nil {
		return nil, err
	}

	if compressed, ok := raw["_compressed"].(bool); ok && compressed {
		dataStr, ok := raw["data"].(string)
		if !ok {
			return nil, nil
		}

		compressedData, err := hex.DecodeString(dataStr)
		if err != nil {
			compressedData, err = base64.StdEncoding.DecodeString(dataStr)
			if err != nil {
				return nil, err
			}
		}

		reader, err := gzip.NewReader(bytes.NewBuffer(compressedData))
		if err != nil {
			return nil, err
		}
		defer reader.Close()

		decompressed, err := io.ReadAll(reader)
		if err != nil {
			return nil, err
		}

		var req SyncRequest
		if err := json.Unmarshal(decompressed, &req); err != nil {
			return nil, err
		}
		return &req, nil
	}

	var req SyncRequest
	body, _ := json.Marshal(raw)
	json.Unmarshal(body, &req)
	return &req, nil
}

func getDeviceID(userID uint, deviceUUID string) (uint, error) {
	var device models.Device
	err := config.DB.Select("id").Where("user_id = ? AND device_uuid = ?", userID, deviceUUID).First(&device).Error
	if err != nil {
		return 0, err
	}
	return device.ID, nil
}

func CreateClipboardData(c *gin.Context) {
	userID := c.GetUint("userID")

	var req ClipboardDataRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	deviceID, err := getDeviceID(userID, req.DeviceUUID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	dataID := req.DataID
	if dataID == "" {
		dataID = uuid.New().String()
	}

	contentHash := req.ContentHash
	if contentHash == "" {
		contentHash = computeHash(req.Content)
	}

	clipboardData := models.ClipboardData{
		UserID:       userID,
		DeviceID:     deviceID,
		DataID:       dataID,
		DataType:     req.DataType,
		Content:      req.Content,
		ContentHash:  contentHash,
		ImagePath:    req.ImagePath,
		Tags:         req.Tags,
		IsSensitive:  req.IsSensitive,
		IsDeleted:    req.IsDeleted,
		ModifiedTime: req.ModifiedTime,
	}

	if err := config.DB.Create(&clipboardData).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create clipboard data"})
		return
	}

	config.DB.Model(&models.Device{}).Where("device_uuid = ?", req.DeviceUUID).Update("last_sync_time", time.Now())

	c.JSON(http.StatusCreated, gin.H{
		"message": "Clipboard data created successfully",
		"data":    clipboardData,
	})
}

func GetClipboardData(c *gin.Context) {
	userID := c.GetUint("userID")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	deviceID := c.Query("device_id")
	startTime := c.Query("start_time")
	endTime := c.Query("end_time")
	tag := c.Query("tag")

	offset := (page - 1) * pageSize

	query := config.DB.Model(&models.ClipboardData{}).Where("user_id = ? AND is_deleted = ?", userID, false)

	if deviceID != "" {
		query = query.Where("device_id = ?", deviceID)
	}
	if startTime != "" {
		query = query.Where("modified_time >= ?", startTime)
	}
	if endTime != "" {
		query = query.Where("modified_time <= ?", endTime)
	}
	if tag != "" {
		query = query.Where("tags LIKE ?", "%"+tag+"%")
	}

	var data []models.ClipboardData
	var total int64

	query.Count(&total)
	query.Preload("Device").Offset(offset).Limit(pageSize).Order("modified_time DESC").Find(&data)

	c.JSON(http.StatusOK, gin.H{
		"data":  data,
		"total": total,
		"page":  page,
		"page_size": pageSize,
	})
}

func SyncClipboardData(c *gin.Context) {
	userID := c.GetUint("userID")

	req, err := decompressPayload(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	deviceID, err := getDeviceID(userID, req.DeviceUUID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	conflicts := make([]string, 0)
	updated := make([]string, 0)
	created := make([]string, 0)

	tx := config.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback()

	for _, item := range req.Data {
		var existing models.ClipboardData
		err := tx.Where("user_id = ? AND data_id = ?", userID, item.DataID).First(&existing).Error

		if err != nil {
			contentHash := item.ContentHash
			if contentHash == "" {
				contentHash = computeHash(item.Content)
			}

			newData := models.ClipboardData{
				UserID:       userID,
				DeviceID:     deviceID,
				DataID:       item.DataID,
				DataType:     item.DataType,
				Content:      item.Content,
				ContentHash:  contentHash,
				ImagePath:    item.ImagePath,
				Tags:         item.Tags,
				IsSensitive:  item.IsSensitive,
				IsDeleted:    item.IsDeleted,
				Version:      1,
				ModifiedTime: item.ModifiedTime,
			}
			if err := tx.Create(&newData).Error; err != nil {
				continue
			}
			created = append(created, item.DataID)
		} else {
			if item.ModifiedTime.After(existing.ModifiedTime) {
				result := tx.Model(&existing).Where("version = ?", existing.Version).Updates(map[string]interface{}{
					"content":       item.Content,
					"content_hash":  computeHash(item.Content),
					"image_path":    item.ImagePath,
					"tags":          item.Tags,
					"is_sensitive":  item.IsSensitive,
					"is_deleted":    item.IsDeleted,
					"modified_time": item.ModifiedTime,
					"version":       existing.Version + 1,
				})
				
				if result.Error != nil {
					conflicts = append(conflicts, item.DataID)
					continue
				}
				
				if result.RowsAffected == 0 {
					var refreshed models.ClipboardData
					tx.Where("user_id = ? AND data_id = ?", userID, item.DataID).First(&refreshed)
					if item.ModifiedTime.After(refreshed.ModifiedTime) {
						tx.Model(&refreshed).Updates(map[string]interface{}{
							"content":       item.Content,
							"content_hash":  computeHash(item.Content),
							"image_path":    item.ImagePath,
							"tags":          item.Tags,
							"is_sensitive":  item.IsSensitive,
							"is_deleted":    item.IsDeleted,
							"modified_time": item.ModifiedTime,
							"version":       refreshed.Version + 1,
						})
						updated = append(updated, item.DataID)
					} else {
						conflicts = append(conflicts, item.DataID)
					}
				} else {
					updated = append(updated, item.DataID)
				}
			} else if item.ModifiedTime.Before(existing.ModifiedTime) {
				conflicts = append(conflicts, item.DataID)
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
		return
	}

	var serverData []models.ClipboardData
	config.DB.Where("user_id = ? AND modified_time > ?", userID, req.LastSyncTime).Find(&serverData)

	config.DB.Model(&models.Device{}).Where("device_uuid = ?", req.DeviceUUID).Update("last_sync_time", time.Now())

	c.JSON(http.StatusOK, gin.H{
		"message":    "Sync completed",
		"created":    created,
		"updated":    updated,
		"conflicts":  conflicts,
		"server_data": serverData,
	})
}

func DeleteClipboardData(c *gin.Context) {
	userID := c.GetUint("userID")
	dataID := c.Param("data_id")

	result := config.DB.Model(&models.ClipboardData{}).
		Where("user_id = ? AND data_id = ?", userID, dataID).
		Updates(map[string]interface{}{
			"is_deleted":    true,
			"modified_time": time.Now(),
		})

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete clipboard data"})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Clipboard data not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Clipboard data deleted successfully"})
}

func UpdateClipboardTags(c *gin.Context) {
	userID := c.GetUint("userID")
	dataID := c.Param("data_id")

	var req struct {
		Tags string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := config.DB.Model(&models.ClipboardData{}).
		Where("user_id = ? AND data_id = ?", userID, dataID).
		Updates(map[string]interface{}{
			"tags":          req.Tags,
			"modified_time": time.Now(),
		})

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update tags"})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Clipboard data not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Tags updated successfully"})
}

func GetAllTags(c *gin.Context) {
	userID := c.GetUint("userID")

	var dataList []models.ClipboardData
	config.DB.Select("tags").Where("user_id = ? AND is_deleted = ? AND tags != ?", userID, false, "").Find(&dataList)

	tagSet := make(map[string]bool)
	for _, data := range dataList {
		if data.Tags != "" {
			tags := strings.Split(data.Tags, ",")
			for _, tag := range tags {
				tag = strings.TrimSpace(tag)
				if tag != "" {
					tagSet[tag] = true
				}
			}
		}
	}

	tagList := make([]string, 0, len(tagSet))
	for tag := range tagSet {
		tagList = append(tagList, tag)
	}

	c.JSON(http.StatusOK, gin.H{"tags": tagList})
}
