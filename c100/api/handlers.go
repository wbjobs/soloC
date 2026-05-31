package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	clientv3 "go.etcd.io/etcd/client/v3"
)

type Handler struct {
	etcdClient *clientv3.Client
	config     *Config
}

func NewHandler(etcdClient *clientv3.Client, config *Config) *Handler {
	return &Handler{
		etcdClient: etcdClient,
		config:     config,
	}
}

type CreateTaskRequest struct {
	Name         string   `json:"name" binding:"required"`
	Type         string   `json:"type" binding:"required,oneof=once cron dependent"`
	Command      string   `json:"command" binding:"required"`
	CronExpr     string   `json:"cron_expr,omitempty"`
	Priority     int      `json:"priority"`
	MaxRetries   int      `json:"max_retries"`
	RetryDelay   int      `json:"retry_delay"`
	Timeout      int      `json:"timeout"`
	Dependencies []string `json:"dependencies,omitempty"`
}

func (h *Handler) CreateTask(c *gin.Context) {
	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	task := &Task{
		ID:         uuid.New().String(),
		Name:       req.Name,
		Type:       req.Type,
		Command:    req.Command,
		CronExpr:   req.CronExpr,
		Status:     "pending",
		Priority:   req.Priority,
		MaxRetries: req.MaxRetries,
		RetryDelay: req.RetryDelay,
		Timeout:    req.Timeout,
		Deps:       req.Dependencies,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	if task.MaxRetries == 0 {
		task.MaxRetries = 3
	}
	if task.RetryDelay == 0 {
		task.RetryDelay = 5
	}
	if task.Timeout == 0 {
		task.Timeout = 3600
	}

	if err := CreateTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create task"})
		return
	}

	taskData, _ := json.Marshal(task)
	taskKey := h.config.TaskPrefix + task.ID
	h.etcdClient.Put(context.Background(), taskKey, string(taskData))

	c.JSON(http.StatusCreated, task)
}

func (h *Handler) GetTask(c *gin.Context) {
	id := c.Param("id")

	task, err := GetTask(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	c.JSON(http.StatusOK, task)
}

func (h *Handler) ListTasks(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	tasks, total, err := ListTasks(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list tasks"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  tasks,
		"total": total,
		"page":  page,
		"size":  pageSize,
	})
}

func (h *Handler) UpdateTask(c *gin.Context) {
	id := c.Param("id")

	task, err := GetTask(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	task.Name = req.Name
	task.Type = req.Type
	task.Command = req.Command
	task.CronExpr = req.CronExpr
	task.Priority = req.Priority
	task.MaxRetries = req.MaxRetries
	task.RetryDelay = req.RetryDelay
	task.Timeout = req.Timeout
	task.Deps = req.Dependencies
	task.UpdatedAt = time.Now()

	if err := UpdateTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update task"})
		return
	}

	taskData, _ := json.Marshal(task)
	taskKey := h.config.TaskPrefix + task.ID
	h.etcdClient.Put(context.Background(), taskKey, string(taskData))

	c.JSON(http.StatusOK, task)
}

func (h *Handler) DeleteTask(c *gin.Context) {
	id := c.Param("id")

	if err := DeleteTask(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete task"})
		return
	}

	taskKey := h.config.TaskPrefix + id
	h.etcdClient.Delete(context.Background(), taskKey)

	c.JSON(http.StatusOK, gin.H{"message": "Task deleted successfully"})
}

func (h *Handler) GetTaskLogs(c *gin.Context) {
	taskID := c.Param("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	lastID, _ := strconv.ParseUint(c.DefaultQuery("last_id", "0"), 10, 32)

	logs, total, err := GetTaskLogs(taskID, page, pageSize, uint(lastID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get task logs"})
		return
	}

	nextLastID := uint(0)
	if len(logs) > 0 {
		nextLastID = logs[len(logs)-1].ID
	}

	c.JSON(http.StatusOK, gin.H{
		"data":      logs,
		"total":     total,
		"page":      page,
		"size":      pageSize,
		"last_id":   nextLastID,
		"has_more":  int64(page*pageSize) < total,
	})
}

func (h *Handler) ListNodes(c *gin.Context) {
	nodes, err := ListNodes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list nodes"})
		return
	}

	c.JSON(http.StatusOK, nodes)
}

func (h *Handler) GetNode(c *gin.Context) {
	id := c.Param("id")

	node, err := GetNode(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
		return
	}

	c.JSON(http.StatusOK, node)
}

func (h *Handler) GetDashboard(c *gin.Context) {
	data, err := GetDashboardData()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get dashboard data"})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *Handler) GetTaskStats(c *gin.Context) {
	stats, err := GetTaskStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get task stats"})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *Handler) GetNodeStats(c *gin.Context) {
	stats, err := GetNodeStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get node stats"})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *Handler) SyncTasksFromEtcd(c *gin.Context) {
	ctx := context.Background()
	resp, err := h.etcdClient.Get(ctx, h.config.TaskPrefix, clientv3.WithPrefix())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to sync tasks"})
		return
	}

	synced := 0
	for _, kv := range resp.Kvs {
		var task Task
		if err := json.Unmarshal(kv.Value, &task); err != nil {
			continue
		}

		existing, _ := GetTask(task.ID)
		if existing == nil {
			CreateTask(&task)
			synced++
		} else {
			UpdateTask(&task)
			synced++
		}
	}

	c.JSON(http.StatusOK, gin.H{"synced": synced})
}
