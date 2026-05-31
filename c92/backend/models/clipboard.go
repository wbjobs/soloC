package models

import (
	"time"

	"gorm.io/gorm"
)

type ClipboardData struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	UserID        uint           `gorm:"not null;index" json:"user_id"`
	DeviceID      uint           `gorm:"not null;index" json:"device_id"`
	DataID        string         `gorm:"uniqueIndex;size:64;not null" json:"data_id"`
	DataType      string         `gorm:"size:20;not null" json:"data_type"`
	Content       string         `gorm:"type:text" json:"content,omitempty"`
	ContentHash   string         `gorm:"size:64;not null" json:"content_hash"`
	ImagePath     string         `gorm:"size:255" json:"image_path,omitempty"`
	Tags          string         `gorm:"size:500" json:"tags,omitempty"`
	IsSensitive   bool           `gorm:"default:false" json:"is_sensitive"`
	IsDeleted     bool           `gorm:"default:false" json:"is_deleted"`
	Version       uint           `gorm:"default:1" json:"version"`
	ModifiedTime  time.Time      `gorm:"not null;index" json:"modified_time"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
	Device        Device         `gorm:"foreignKey:DeviceID" json:"device,omitempty"`
}
