package main

import (
	"time"
)

type Task struct {
	ID            string    `json:"id" gorm:"primaryKey;type:varchar(36)"`
	Name          string    `json:"name" gorm:"type:varchar(100);not null"`
	Type          string    `json:"type" gorm:"type:varchar(20);not null"`
	Command       string    `json:"command" gorm:"type:text;not null"`
	CronExpr      string    `json:"cron_expr,omitempty" gorm:"type:varchar(100)"`
	Status        string    `json:"status" gorm:"type:varchar(20);default:'pending'"`
	Priority      int       `json:"priority" gorm:"default:0"`
	MaxRetries    int       `json:"max_retries" gorm:"default:3"`
	RetryCount    int       `json:"retry_count" gorm:"default:0"`
	RetryDelay    int       `json:"retry_delay" gorm:"default:5"`
	Timeout       int       `json:"timeout" gorm:"default:3600"`
	Progress      int       `json:"progress" gorm:"default:0"`
	Dependencies  string    `json:"-" gorm:"type:text"`
	Deps          []string  `json:"dependencies,omitempty" gorm:"-"`
	AssignedNode  string    `json:"assigned_node,omitempty" gorm:"type:varchar(100)"`
	LastHeartbeat time.Time `json:"last_heartbeat,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	ScheduledAt   time.Time `json:"scheduled_at,omitempty"`
	StartedAt     time.Time `json:"started_at,omitempty"`
	CompletedAt   time.Time `json:"completed_at,omitempty"`
	Result        string    `json:"result,omitempty" gorm:"type:text"`
	Error         string    `json:"error,omitempty" gorm:"type:text"`
}

type TaskLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	TaskID    string    `json:"task_id" gorm:"type:varchar(36);index"`
	Message   string    `json:"message" gorm:"type:text"`
	Progress  int       `json:"progress"`
	NodeID    string    `json:"node_id,omitempty" gorm:"type:varchar(100)"`
	CreatedAt time.Time `json:"created_at"`
}

type Node struct {
	ID            string    `json:"id" gorm:"primaryKey;type:varchar(100)"`
	Address       string    `json:"address" gorm:"type:varchar(200)"`
	CPU           float64   `json:"cpu"`
	Memory        float64   `json:"memory"`
	Tasks         int       `json:"tasks"`
	Status        string    `json:"status" gorm:"type:varchar(20)"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
