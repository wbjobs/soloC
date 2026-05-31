package main

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	clientv3 "go.etcd.io/etcd/client/v3"
)

type TaskType string
type TaskStatus string

const (
	TaskTypeOnce     TaskType = "once"
	TaskTypeCron     TaskType = "cron"
	TaskTypeDependent TaskType = "dependent"

	TaskStatusPending   TaskStatus = "pending"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusFailed    TaskStatus = "failed"
	TaskStatusPaused    TaskStatus = "paused"
)

type Task struct {
	ID            string      `json:"id"`
	Name          string      `json:"name"`
	Type          TaskType    `json:"type"`
	Command       string      `json:"command"`
	CronExpr      string      `json:"cron_expr,omitempty"`
	Status        TaskStatus  `json:"status"`
	Priority      int         `json:"priority"`
	MaxRetries    int         `json:"max_retries"`
	RetryCount    int         `json:"retry_count"`
	RetryDelay    int         `json:"retry_delay"`
	Timeout       int         `json:"timeout"`
	Progress      int         `json:"progress"`
	Dependencies  []string    `json:"dependencies,omitempty"`
	AssignedNode  string      `json:"assigned_node,omitempty"`
	LastHeartbeat time.Time   `json:"last_heartbeat,omitempty"`
	CreatedAt     time.Time   `json:"created_at"`
	UpdatedAt     time.Time   `json:"updated_at"`
	ScheduledAt   time.Time   `json:"scheduled_at,omitempty"`
	StartedAt     time.Time   `json:"started_at,omitempty"`
	CompletedAt   time.Time   `json:"completed_at,omitempty"`
	Result        string      `json:"result,omitempty"`
	Error         string      `json:"error,omitempty"`
}

type TaskManager struct {
	etcdClient *EtcdClient
	tasks      map[string]*Task
	mutex      sync.RWMutex
	config     *Config
}

func NewTaskManager(etcdClient *EtcdClient) *TaskManager {
	return &TaskManager{
		etcdClient: etcdClient,
		tasks:      make(map[string]*Task),
		config:     LoadConfig(),
	}
}

func (tm *TaskManager) CreateTask(ctx context.Context, task *Task) error {
	task.ID = uuid.New().String()
	task.Status = TaskStatusPending
	task.CreatedAt = time.Now()
	task.UpdatedAt = time.Now()

	taskData, err := json.Marshal(task)
	if err != nil {
		return err
	}

	key := tm.config.TaskPrefix + task.ID
	return tm.etcdClient.Put(ctx, key, string(taskData))
}

func (tm *TaskManager) UpdateTask(ctx context.Context, task *Task) error {
	task.UpdatedAt = time.Now()
	taskData, err := json.Marshal(task)
	if err != nil {
		return err
	}

	key := tm.config.TaskPrefix + task.ID
	return tm.etcdClient.Put(ctx, key, string(taskData))
}

func (tm *TaskManager) GetTask(ctx context.Context, taskID string) (*Task, error) {
	key := tm.config.TaskPrefix + taskID
	resp, err := tm.etcdClient.Get(ctx, key)
	if err != nil {
		return nil, err
	}

	if len(resp.Kvs) == 0 {
		return nil, nil
	}

	var task Task
	if err := json.Unmarshal(resp.Kvs[0].Value, &task); err != nil {
		return nil, err
	}

	return &task, nil
}

func (tm *TaskManager) WatchTasks() {
	log.Println("Watching for task changes...")
	watchChan := tm.etcdClient.Watch(context.Background(), tm.config.TaskPrefix, clientv3.WithPrefix())

	for watchResp := range watchChan {
		for _, event := range watchResp.Events {
			taskID := string(event.Kv.Key)[len(tm.config.TaskPrefix):]
			switch event.Type {
			case clientv3.EventTypePut:
				var task Task
				if err := json.Unmarshal(event.Kv.Value, &task); err == nil {
					tm.mutex.Lock()
					tm.tasks[taskID] = &task
					tm.mutex.Unlock()
				}
			case clientv3.EventTypeDelete:
				tm.mutex.Lock()
				delete(tm.tasks, taskID)
				tm.mutex.Unlock()
			}
		}
	}
}

func (tm *TaskManager) GetPendingTasks() []*Task {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	pending := make([]*Task, 0)
	for _, task := range tm.tasks {
		if task.Status == TaskStatusPending {
			pending = append(pending, task)
		}
	}
	return pending
}

func (tm *TaskManager) CheckDependencies(task *Task) bool {
	if len(task.Dependencies) == 0 {
		return true
	}

	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	for _, depID := range task.Dependencies {
		depTask, exists := tm.tasks[depID]
		if !exists || depTask.Status != TaskStatusCompleted {
			return false
		}
	}
	return true
}

func (tm *TaskManager) LogProgress(ctx context.Context, taskID, logMessage string, progress int) error {
	logEntry := map[string]interface{}{
		"task_id":   taskID,
		"message":   logMessage,
		"progress":  progress,
		"timestamp": time.Now(),
	}
	
	logData, _ := json.Marshal(logEntry)
	logKey := tm.config.LogPrefix + taskID + "/" + uuid.New().String()
	
	return tm.etcdClient.Put(ctx, logKey, string(logData))
}
