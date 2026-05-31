package model

import (
	"time"

	"gorm.io/gorm"
)

type TaskType int32

const (
	TaskTypeUnknown TaskType = 0
	TaskTypeTimed   TaskType = 1
	TaskTypeDelayed TaskType = 2
	TaskTypeImmediate TaskType = 3
)

type TaskStatus int32

const (
	TaskStatusUnknown   TaskStatus = 0
	TaskStatusPending   TaskStatus = 1
	TaskStatusScheduled TaskStatus = 2
	TaskStatusRunning   TaskStatus = 3
	TaskStatusSuccess   TaskStatus = 4
	TaskStatusFailed    TaskStatus = 5
	TaskStatusCancelled TaskStatus = 6
)

type ExecutorStatus int32

const (
	ExecutorStatusUnknown ExecutorStatus = 0
	ExecutorStatusOnline  ExecutorStatus = 1
	ExecutorStatusOffline ExecutorStatus = 2
	ExecutorStatusBusy    ExecutorStatus = 3
)

type Task struct {
	ID                   string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	Name                 string         `gorm:"type:varchar(255);not null" json:"name"`
	Type                 TaskType       `gorm:"type:int;not null" json:"type"`
	CronExpression       string         `gorm:"type:varchar(255)" json:"cron_expression"`
	DelaySeconds         int64          `gorm:"type:bigint" json:"delay_seconds"`
	Payload              string         `gorm:"type:text" json:"payload"`
	MaxRetryCount        int32          `gorm:"type:int;default:0" json:"max_retry_count"`
	RetryIntervalSeconds int32          `gorm:"type:int;default:10" json:"retry_interval_seconds"`
	Status               TaskStatus     `gorm:"type:int;default:1" json:"status"`
	RetryCount           int32          `gorm:"type:int;default:0" json:"retry_count"`
	ScheduledAt          time.Time      `json:"scheduled_at"`
	ExecutorID           string         `gorm:"type:varchar(64)" json:"executor_id"`
	CreatedAt            time.Time      `json:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at"`
	DeletedAt            gorm.DeletedAt `gorm:"index" json:"-"`
}

type TaskLog struct {
	ID         string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	TaskID     string         `gorm:"type:varchar(64);index;not null" json:"task_id"`
	ExecutorID string         `gorm:"type:varchar(64);index" json:"executor_id"`
	Status     TaskStatus     `gorm:"type:int;not null" json:"status"`
	Message    string         `gorm:"type:text" json:"message"`
	StartedAt  time.Time      `json:"started_at"`
	FinishedAt time.Time      `json:"finished_at"`
	RetryCount int32          `gorm:"type:int;default:0" json:"retry_count"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}

type ExecutorInfo struct {
	ID                   string         `gorm:"primaryKey;type:varchar(64)" json:"id"`
	Address              string         `gorm:"type:varchar(255);not null" json:"address"`
	Status               ExecutorStatus `gorm:"type:int;default:1" json:"status"`
	MaxConcurrentTasks   int32          `gorm:"type:int;default:10" json:"max_concurrent_tasks"`
	CurrentTasks         int32          `gorm:"type:int;default:0" json:"current_tasks"`
	SupportedTaskTypes   string         `gorm:"type:varchar(512)" json:"-"`
	Weight               int32          `gorm:"type:int;default:1" json:"weight"`
	LastHeartbeatAt      time.Time      `json:"last_heartbeat_at"`
	CreatedAt            time.Time      `json:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at"`
	DeletedAt            gorm.DeletedAt `gorm:"index" json:"-"`
}

func (t *Task) TableName() string {
	return "tasks"
}

func (t *TaskLog) TableName() string {
	return "task_logs"
}

func (e *ExecutorInfo) TableName() string {
	return "executors"
}

func (t TaskType) String() string {
	switch t {
	case TaskTypeTimed:
		return "TIMED"
	case TaskTypeDelayed:
		return "DELAYED"
	case TaskTypeImmediate:
		return "IMMEDIATE"
	default:
		return "UNKNOWN"
	}
}

func (s TaskStatus) String() string {
	switch s {
	case TaskStatusPending:
		return "PENDING"
	case TaskStatusScheduled:
		return "SCHEDULED"
	case TaskStatusRunning:
		return "RUNNING"
	case TaskStatusSuccess:
		return "SUCCESS"
	case TaskStatusFailed:
		return "FAILED"
	case TaskStatusCancelled:
		return "CANCELLED"
	default:
		return "UNKNOWN"
	}
}

func (s ExecutorStatus) String() string {
	switch s {
	case ExecutorStatusOnline:
		return "ONLINE"
	case ExecutorStatusOffline:
		return "OFFLINE"
	case ExecutorStatusBusy:
		return "BUSY"
	default:
		return "UNKNOWN"
	}
}
