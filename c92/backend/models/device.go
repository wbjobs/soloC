package models

import (
	"time"

	"gorm.io/gorm"
)

type Device struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	UserID        uint           `gorm:"not null;index" json:"user_id"`
	DeviceUUID    string         `gorm:"uniqueIndex;size:64;not null" json:"device_uuid"`
	DeviceName    string         `gorm:"size:100;not null" json:"device_name"`
	DeviceType    string         `gorm:"size:50" json:"device_type"`
	OS            string         `gorm:"size:50" json:"os"`
	LastSyncTime  time.Time      `json:"last_sync_time"`
	IsActive      bool           `gorm:"default:true" json:"is_active"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
	ClipboardData []ClipboardData `gorm:"foreignKey:DeviceID" json:"-"`
}
