package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"distributed-scheduler/common/logger"
	"distributed-scheduler/common/model"
	pb "distributed-scheduler/proto"
)

type APIHandler struct {
	db       *gorm.DB
	scheduler pb.SchedulerServiceClient
}

func NewAPIHandler(db *gorm.DB, scheduler pb.SchedulerServiceClient) *APIHandler {
	return &APIHandler{
		db:       db,
		scheduler: scheduler,
	}
}

type CreateTaskRequest struct {
	Name                 string `json:"name" binding:"required"`
	Type                 int32  `json:"type" binding:"required"`
	CronExpression       string `json:"cron_expression"`
	DelaySeconds         int64  `json:"delay_seconds"`
	Payload              string `json:"payload"`
	MaxRetryCount        int32  `json:"max_retry_count"`
	RetryIntervalSeconds int32  `json:"retry_interval_seconds"`
}

func (h *APIHandler) CreateTask(c *gin.Context) {
	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "invalid request: " + err.Error(),
		})
		return
	}

	grpcReq := &pb.CreateTaskRequest{
		Name:                 req.Name,
		Type:                 pb.TaskType(req.Type),
		CronExpression:       req.CronExpression,
		DelaySeconds:         req.DelaySeconds,
		Payload:              req.Payload,
		MaxRetryCount:        req.MaxRetryCount,
		RetryIntervalSeconds: req.RetryIntervalSeconds,
	}

	resp, err := h.scheduler.CreateTask(c, grpcReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": resp.Success,
		"message": resp.Message,
		"data":    resp.Task,
	})
}

func (h *APIHandler) CancelTask(c *gin.Context) {
	taskID := c.Param("id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "task id is required",
		})
		return
	}

	resp, err := h.scheduler.CancelTask(c, &pb.CancelTaskRequest{TaskId: taskID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": resp.Success,
		"message": resp.Message,
	})
}

func (h *APIHandler) GetTask(c *gin.Context) {
	taskID := c.Param("id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "task id is required",
		})
		return
	}

	resp, err := h.scheduler.GetTask(c, &pb.GetTaskRequest{TaskId: taskID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if !resp.Success {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": resp.Message,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "success",
		"data":    resp.Task,
	})
}

func (h *APIHandler) ListTasks(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	statusStr := c.DefaultQuery("status", "0")
	status, _ := strconv.Atoi(statusStr)

	resp, err := h.scheduler.ListTasks(c, &pb.ListTasksRequest{
		Page:     int32(page),
		PageSize: int32(pageSize),
		Status:   pb.TaskStatus(status),
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "success",
		"data":    resp.Tasks,
		"total":   resp.Total,
		"page":    page,
		"page_size": pageSize,
	})
}

func (h *APIHandler) GetTaskLogs(c *gin.Context) {
	taskID := c.Param("id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "task id is required",
		})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	var logs []model.TaskLog
	var total int64

	query := h.db.Model(&model.TaskLog{}).Where("task_id = ?", taskID)

	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	offset := (page - 1) * pageSize
	if offset < 0 {
		offset = 0
	}

	if err := query.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	type TaskLogResponse struct {
		ID         string    `json:"id"`
		TaskID     string    `json:"task_id"`
		ExecutorID string    `json:"executor_id"`
		Status     string    `json:"status"`
		Message    string    `json:"message"`
		StartedAt  time.Time `json:"started_at"`
		FinishedAt time.Time `json:"finished_at"`
		RetryCount int32     `json:"retry_count"`
		CreatedAt  time.Time `json:"created_at"`
	}

	respLogs := make([]TaskLogResponse, len(logs))
	for i, log := range logs {
		respLogs[i] = TaskLogResponse{
			ID:         log.ID,
			TaskID:     log.TaskID,
			ExecutorID: log.ExecutorID,
			Status:     log.Status.String(),
			Message:    log.Message,
			StartedAt:  log.StartedAt,
			FinishedAt: log.FinishedAt,
			RetryCount: log.RetryCount,
			CreatedAt:  log.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"message":   "success",
		"data":      respLogs,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func (h *APIHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "ok",
		"time":    time.Now().Format(time.RFC3339),
	})
}

func (h *APIHandler) ListExecutors(c *gin.Context) {
	var executors []model.ExecutorInfo
	var total int64

	query := h.db.Model(&model.ExecutorInfo{})

	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	if err := query.Order("created_at DESC").Find(&executors).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	type ExecutorResponse struct {
		ID                 string    `json:"id"`
		Address            string    `json:"address"`
		Status             string    `json:"status"`
		MaxConcurrentTasks int32     `json:"max_concurrent_tasks"`
		CurrentTasks       int32     `json:"current_tasks"`
		LastHeartbeatAt    time.Time `json:"last_heartbeat_at"`
		CreatedAt          time.Time `json:"created_at"`
	}

	respExecutors := make([]ExecutorResponse, len(executors))
	for i, exec := range executors {
		respExecutors[i] = ExecutorResponse{
			ID:                 exec.ID,
			Address:            exec.Address,
			Status:             exec.Status.String(),
			MaxConcurrentTasks: exec.MaxConcurrentTasks,
			CurrentTasks:       exec.CurrentTasks,
			LastHeartbeatAt:    exec.LastHeartbeatAt,
			CreatedAt:          exec.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "success",
		"data":    respExecutors,
		"total":   total,
	})
}

func SetupRouter(handler *APIHandler, port int) error {
	r := gin.Default()

	api := r.Group("/api/v1")
	{
		api.GET("/health", handler.Health)

		tasks := api.Group("/tasks")
		{
			tasks.POST("", handler.CreateTask)
			tasks.GET("", handler.ListTasks)
			tasks.GET("/:id", handler.GetTask)
			tasks.POST("/:id/cancel", handler.CancelTask)
			tasks.GET("/:id/logs", handler.GetTaskLogs)
		}

		executors := api.Group("/executors")
		{
			executors.GET("", handler.ListExecutors)
		}
	}

	logger.Info("rest api server started", "port", port)
	return r.Run(fmt.Sprintf(":%d", port))
}
