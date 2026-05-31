package controllers

import (
	"clipboard-sync/config"
	"clipboard-sync/models"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type RegisterDeviceRequest struct {
	DeviceName string `json:"device_name" binding:"required"`
	DeviceType string `json:"device_type"`
	OS         string `json:"os"`
}

func RegisterDevice(c *gin.Context) {
	userID := c.GetUint("userID")

	var req RegisterDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	device := models.Device{
		UserID:       userID,
		DeviceUUID:   uuid.New().String(),
		DeviceName:   req.DeviceName,
		DeviceType:   req.DeviceType,
		OS:           req.OS,
		LastSyncTime: time.Now(),
		IsActive:     true,
	}

	if err := config.DB.Create(&device).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register device"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":     "Device registered successfully",
		"device_uuid": device.DeviceUUID,
		"device":      device,
	})
}

func GetDevices(c *gin.Context) {
	userID := c.GetUint("userID")

	var devices []models.Device
	if err := config.DB.Where("user_id = ?", userID).Find(&devices).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get devices"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"devices": devices})
}

func UpdateDevice(c *gin.Context) {
	userID := c.GetUint("userID")
	deviceUUID := c.Param("uuid")

	var req struct {
		DeviceName string `json:"device_name"`
		IsActive   *bool  `json:"is_active"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var device models.Device
	if err := config.DB.Where("user_id = ? AND device_uuid = ?", userID, deviceUUID).First(&device).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	if req.DeviceName != "" {
		device.DeviceName = req.DeviceName
	}
	if req.IsActive != nil {
		device.IsActive = *req.IsActive
	}

	if err := config.DB.Save(&device).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update device"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Device updated successfully",
		"device":  device,
	})
}

func DeleteDevice(c *gin.Context) {
	userID := c.GetUint("userID")
	deviceUUID := c.Param("uuid")

	result := config.DB.Where("user_id = ? AND device_uuid = ?", userID, deviceUUID).Delete(&models.Device{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete device"})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Device deleted successfully"})
}
