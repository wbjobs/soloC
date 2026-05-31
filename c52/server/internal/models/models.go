package models

import (
	"time"
	"gorm.io/gorm"
)

type Node struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	NodeID       string         `gorm:"uniqueIndex;size:64" json:"node_id"`
	Hostname     string         `gorm:"size:128" json:"hostname"`
	NodeIP       string         `gorm:"size:64" json:"node_ip"`
	Status       string         `gorm:"size:32;default:offline" json:"status"`
	LastSeen     *time.Time     `json:"last_seen"`
	ConfigVersion int64         `gorm:"default:0" json:"config_version"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

type NodeConfig struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	NodeID    string         `gorm:"index;size:64" json:"node_id"`
	Version   int64          `gorm:"default:1" json:"version"`
	ConfigYAML string        `gorm:"type:text" json:"config_yaml"`
	IsActive  bool           `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}

type Heartbeat struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	NodeID        string    `gorm:"index;size:64" json:"node_id"`
	NodeIP        string    `gorm:"size:64" json:"node_ip"`
	Hostname      string    `gorm:"size:128" json:"hostname"`
	CPUUsage      float64   `json:"cpu_usage"`
	MemoryUsage   int64     `json:"memory_usage"`
	MemoryTotal   int64     `json:"memory_total"`
	DiskUsage     int64     `json:"disk_usage"`
	DiskTotal     int64     `json:"disk_total"`
	LoadAverage   float64   `json:"load_average"`
	NodeStatus    string    `gorm:"size:32" json:"node_status"`
	ContainersJSON string   `gorm:"type:text" json:"containers_json"`
	Timestamp     int64     `json:"timestamp"`
	CreatedAt     time.Time  `json:"created_at"`
}

type ContainerConfig struct {
	Image         string            `yaml:"image" json:"image"`
	Name          string            `yaml:"name" json:"name"`
	Env           map[string]string `yaml:"env,omitempty" json:"env,omitempty"`
	Ports         []string          `yaml:"ports,omitempty" json:"ports,omitempty"`
	Volumes       []string          `yaml:"volumes,omitempty" json:"volumes,omitempty"`
	CPULimit      float64           `yaml:"cpu_limit" json:"cpu_limit"`
	MemoryLimit   int64             `yaml:"memory_limit" json:"memory_limit"`
	RestartPolicy string            `yaml:"restart_policy" json:"restart_policy"`
}

type NodeConfigYAML struct {
	NodeID    string            `yaml:"node_id" json:"node_id"`
	Version   int64             `yaml:"version" json:"version"`
	Containers []ContainerConfig `yaml:"containers" json:"containers"`
	Metadata  map[string]string `yaml:"metadata,omitempty" json:"metadata,omitempty"`
}
