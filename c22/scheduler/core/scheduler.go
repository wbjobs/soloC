package core

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/robfig/cron/v3"
	"gorm.io/gorm"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"distributed-scheduler/common/etcdclient"
	"distributed-scheduler/common/logger"
	"distributed-scheduler/common/model"
	"distributed-scheduler/common/tracing"
	pb "distributed-scheduler/proto"
)

type Scheduler struct {
	db           *gorm.DB
	etcdClient   *etcdclient.Client
	cron         *cron.Cron
	mu           sync.RWMutex
	executors    map[string]*ExecutorConn
	cronEntries  map[string]cron.EntryID
	isLeader     bool
	ctx          context.Context
	cancel       context.CancelFunc
	loadBalancer *DynamicLoadBalancer
}

type ExecutorConn struct {
	ID       string
	Address  string
	Client   pb.ExecutorServiceClient
	LastSeen time.Time
	Status   model.ExecutorStatus
	Weight   int32
}

func NewScheduler(db *gorm.DB, etcdClient *etcdclient.Client, loadBalanceStrategy string) *Scheduler {
	ctx, cancel := context.WithCancel(context.Background())
	return &Scheduler{
		db:           db,
		etcdClient:   etcdClient,
		cron:         cron.New(),
		executors:    make(map[string]*ExecutorConn),
		cronEntries:  make(map[string]cron.EntryID),
		ctx:          ctx,
		cancel:       cancel,
		loadBalancer: NewDynamicLoadBalancer(loadBalanceStrategy),
	}
}

func (s *Scheduler) Start() {
	s.cron.Start()
	go s.watchExecutors()
	go s.scanDelayedTasks()
	go s.checkExpiredExecutors()
	go s.syncActiveExecutorsLoop()
	logger.Info("scheduler started", "load_balance_strategy", s.loadBalancer.GetStrategy().String())
}

func (s *Scheduler) Stop() {
	s.cancel()
	s.cron.Stop()
	logger.Info("scheduler stopped")
}

func (s *Scheduler) SetLoadBalanceStrategy(strategy string) {
	s.loadBalancer.SetStrategy(strategy)
}

func (s *Scheduler) CreateTask(ctx context.Context, req *pb.CreateTaskRequest) (*pb.Task, error) {
	ctx, span := tracing.StartSpan(ctx, "CreateTask")
	defer span.End()

	span.SetAttributes(
		attribute.String("task.name", req.Name),
		attribute.String("task.type", pb.TaskType_name[int32(req.Type)]),
		attribute.Int64("task.delay_seconds", req.DelaySeconds),
		attribute.String("task.cron_expression", req.CronExpression),
	)

	taskID := uuid.New().String()
	now := time.Now()

	span.SetAttributes(attribute.String("task.id", taskID))

	task := &model.Task{
		ID:                   taskID,
		Name:                 req.Name,
		Type:                 model.TaskType(req.Type),
		CronExpression:       req.CronExpression,
		DelaySeconds:         req.DelaySeconds,
		Payload:              req.Payload,
		MaxRetryCount:        req.MaxRetryCount,
		RetryIntervalSeconds: req.RetryIntervalSeconds,
		Status:               model.TaskStatusPending,
		RetryCount:           0,
		CreatedAt:            now,
		UpdatedAt:            now,
	}

	switch task.Type {
	case model.TaskTypeTimed:
		if req.CronExpression == "" {
			err := fmt.Errorf("cron expression is required for timed tasks")
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			return nil, err
		}
		entryID, err := s.cron.AddFunc(req.CronExpression, func() {
			s.dispatchTask(taskID)
		})
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			return nil, fmt.Errorf("invalid cron expression: %w", err)
		}
		s.mu.Lock()
		s.cronEntries[taskID] = entryID
		s.mu.Unlock()
		task.Status = model.TaskStatusScheduled

	case model.TaskTypeImmediate:
		task.ScheduledAt = now
	case model.TaskTypeDelayed:
		task.ScheduledAt = now.Add(time.Duration(req.DelaySeconds) * time.Second)
	}

	if err := s.db.WithContext(ctx).Create(task).Error; err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	if task.Type == model.TaskTypeImmediate {
		go s.dispatchTask(taskID)
	}

	span.SetStatus(codes.Ok, "success")
	return modelTaskToProto(task), nil
}

func (s *Scheduler) CancelTask(ctx context.Context, taskID string) error {
	ctx, span := tracing.StartSpan(ctx, "CancelTask")
	defer span.End()

	span.SetAttributes(attribute.String("task.id", taskID))

	var task model.Task
	if err := s.db.WithContext(ctx).First(&task, "id = ?", taskID).Error; err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	if task.Status == model.TaskStatusRunning || task.Status == model.TaskStatusSuccess || task.Status == model.TaskStatusFailed {
		err := fmt.Errorf("cannot cancel task in current status: %s", task.Status)
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	if task.Type == model.TaskTypeTimed {
		s.mu.Lock()
		if entryID, exists := s.cronEntries[taskID]; exists {
			s.cron.Remove(entryID)
			delete(s.cronEntries, taskID)
		}
		s.mu.Unlock()
	}

	task.Status = model.TaskStatusCancelled
	task.UpdatedAt = time.Now()
	if err := s.db.WithContext(ctx).Save(&task).Error; err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	span.SetStatus(codes.Ok, "success")
	return nil
}

func (s *Scheduler) GetTask(ctx context.Context, taskID string) (*pb.Task, error) {
	ctx, span := tracing.StartSpan(ctx, "GetTask")
	defer span.End()

	span.SetAttributes(attribute.String("task.id", taskID))

	var task model.Task
	if err := s.db.WithContext(ctx).First(&task, "id = ?", taskID).Error; err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	span.SetStatus(codes.Ok, "success")
	return modelTaskToProto(&task), nil
}

func (s *Scheduler) ListTasks(ctx context.Context, page, pageSize int, status model.TaskStatus) ([]*pb.Task, int64, error) {
	ctx, span := tracing.StartSpan(ctx, "ListTasks")
	defer span.End()

	span.SetAttributes(
		attribute.Int("page", page),
		attribute.Int("page_size", pageSize),
		attribute.Int("status", int(status)),
	)

	var tasks []model.Task
	var total int64

	query := s.db.WithContext(ctx).Model(&model.Task{})
	if status != model.TaskStatusUnknown {
		query = query.Where("status = ?", status)
	}

	if err := query.Count(&total).Error; err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if offset < 0 {
		offset = 0
	}

	if err := query.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&tasks).Error; err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, 0, err
	}

	pbTasks := make([]*pb.Task, len(tasks))
	for i, t := range tasks {
		pbTasks[i] = modelTaskToProto(&t)
	}

	span.SetStatus(codes.Ok, "success")
	return pbTasks, total, nil
}

func (s *Scheduler) ReportTaskStatus(ctx context.Context, req *pb.ReportTaskStatusRequest) error {
	ctx, span := tracing.StartSpan(ctx, "ReportTaskStatus")
	defer span.End()

	span.SetAttributes(
		attribute.String("task.id", req.TaskId),
		attribute.String("executor.id", req.ExecutorId),
		attribute.String("status", pb.TaskStatus_name[int32(req.Status)]),
	)

	var task model.Task
	if err := s.db.WithContext(ctx).First(&task, "id = ?", req.TaskId).Error; err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	now := time.Now()
	taskLog := &model.TaskLog{
		ID:         uuid.New().String(),
		TaskID:     req.TaskId,
		ExecutorID: req.ExecutorId,
		Status:     model.TaskStatus(req.Status),
		Message:    req.Message,
		RetryCount: task.RetryCount,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	if req.StartedAt > 0 {
		taskLog.StartedAt = time.Unix(req.StartedAt, 0)
	}
	if req.FinishedAt > 0 {
		taskLog.FinishedAt = time.Unix(req.FinishedAt, 0)
	}

	task.Status = model.TaskStatus(req.Status)
	task.ExecutorID = req.ExecutorId
	task.UpdatedAt = now

	if model.TaskStatus(req.Status) == model.TaskStatusFailed && task.RetryCount < task.MaxRetryCount {
		task.RetryCount++
		task.Status = model.TaskStatusScheduled
		task.ScheduledAt = now.Add(time.Duration(task.RetryIntervalSeconds) * time.Second)
		taskLog.Status = model.TaskStatusFailed
		logger.Info("task failed, scheduled for retry", "task_id", task.ID, "retry_count", task.RetryCount)
		span.SetAttributes(
			attribute.Int("task.retry_count", int(task.RetryCount)),
			attribute.Bool("task.will_retry", true),
		)
	} else {
		span.SetAttributes(attribute.Bool("task.will_retry", false))
	}

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&task).Error; err != nil {
			return err
		}
		return tx.Create(taskLog).Error
	})

	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	span.SetStatus(codes.Ok, "success")
	return nil
}

func (s *Scheduler) RegisterExecutor(executor *model.ExecutorInfo) error {
	ctx, span := tracing.StartSpan(context.Background(), "RegisterExecutor")
	defer span.End()

	span.SetAttributes(
		attribute.String("executor.id", executor.ID),
		attribute.String("executor.address", executor.Address),
		attribute.Int("executor.weight", int(executor.Weight)),
	)

	s.mu.Lock()
	defer s.mu.Unlock()

	var existing model.ExecutorInfo
	err := s.db.First(&existing, "id = ?", executor.ID).Error
	if err == gorm.ErrRecordNotFound {
		if err := s.db.Create(executor).Error; err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			return err
		}
	} else if err == nil {
		existing.Status = executor.Status
		existing.Address = executor.Address
		existing.LastHeartbeatAt = time.Now()
		existing.Weight = executor.Weight
		if err := s.db.Save(&existing).Error; err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			return err
		}
	}

	weight := executor.Weight
	if weight <= 0 {
		weight = 1
	}

	s.executors[executor.ID] = &ExecutorConn{
		ID:       executor.ID,
		Address:  executor.Address,
		LastSeen: time.Now(),
		Status:   executor.Status,
		Weight:   weight,
	}

	s.loadBalancer.UpdateExecutorWeight(executor.ID, weight)

	logger.Info("executor registered", "executor_id", executor.ID, "address", executor.Address, "weight", weight)
	span.SetStatus(codes.Ok, "success")
	return nil
}

func (s *Scheduler) Heartbeat(executorID string, status model.ExecutorStatus, currentTasks int32) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if conn, exists := s.executors[executorID]; exists {
		conn.LastSeen = time.Now()
		conn.Status = status
	}

	return s.db.Model(&model.ExecutorInfo{}).Where("id = ?", executorID).Updates(map[string]interface{}{
		"status":            status,
		"current_tasks":     currentTasks,
		"last_heartbeat_at": time.Now(),
	}).Error
}

func (s *Scheduler) dispatchTask(taskID string) {
	ctx := context.Background()
	ctx, span := tracing.StartSpan(ctx, "DispatchTask")
	defer span.End()

	span.SetAttributes(attribute.String("task.id", taskID))

	var task model.Task
	if err := s.db.First(&task, "id = ?", taskID).Error; err != nil {
		logger.Error("failed to get task for dispatch", "task_id", taskID, "error", err.Error())
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return
	}

	span.SetAttributes(
		attribute.String("task.name", task.Name),
		attribute.String("task.type", task.Type.String()),
		attribute.Int("task.retry_count", int(task.RetryCount)),
	)

	if task.Status == model.TaskStatusCancelled {
		logger.Warn("task cancelled, skipping dispatch", "task_id", taskID)
		span.SetStatus(codes.Ok, "task cancelled")
		return
	}

	executor, err := s.selectExecutor(&task)
	if err != nil {
		logger.Error("failed to select executor", "task_id", taskID, "error", err.Error())
		task.Status = model.TaskStatusFailed
		task.UpdatedAt = time.Now()
		s.db.Save(&task)
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return
	}

	span.SetAttributes(
		attribute.String("executor.id", executor.ID),
		attribute.String("executor.address", executor.Address),
		attribute.String("load_balance_strategy", s.loadBalancer.GetStrategy().String()),
	)

	task.Status = model.TaskStatusRunning
	task.ExecutorID = executor.ID
	task.UpdatedAt = time.Now()
	if err := s.db.Save(&task).Error; err != nil {
		logger.Error("failed to update task status", "task_id", taskID, "error", err.Error())
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return
	}

	logger.Info("dispatching task", "task_id", taskID, "executor_id", executor.ID)

	go func() {
		s.executeOnExecutor(executor, &task)
	}()

	span.SetStatus(codes.Ok, "dispatched")
}

func (s *Scheduler) selectExecutor(task *model.Task) (*ExecutorConn, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var available []*ExecutorConn
	for _, exec := range s.executors {
		if exec.Status == model.ExecutorStatusOnline {
			available = append(available, exec)
		}
	}

	if len(available) == 0 {
		return nil, fmt.Errorf("no available executors")
	}

	return s.loadBalancer.Select(available, task)
}

func (s *Scheduler) executeOnExecutor(executor *ExecutorConn, task *model.Task) {
	ctx := context.Background()
	ctx, span := tracing.StartSpan(ctx, "ExecuteOnExecutor")
	defer span.End()

	span.SetAttributes(
		attribute.String("task.id", task.ID),
		attribute.String("executor.id", executor.ID),
		attribute.String("executor.address", executor.Address),
	)

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	conn, err := getExecutorClient(executor.Address)
	if err != nil {
		logger.Error("failed to connect to executor", "executor_id", executor.ID, "error", err.Error())
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		s.ReportTaskStatus(ctx, &pb.ReportTaskStatusRequest{
			TaskId:     task.ID,
			ExecutorId: executor.ID,
			Status:     pb.TaskStatus_TASK_STATUS_FAILED,
			Message:    "failed to connect to executor: " + err.Error(),
		})
		return
	}
	defer conn.Close()

	client := pb.NewExecutorServiceClient(conn)
	resp, err := client.ExecuteTask(ctx, &pb.ExecuteTaskRequest{
		Task: modelTaskToProto(task),
	})

	if err != nil {
		logger.Error("failed to execute task on executor", "task_id", task.ID, "error", err.Error())
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		s.ReportTaskStatus(ctx, &pb.ReportTaskStatusRequest{
			TaskId:     task.ID,
			ExecutorId: executor.ID,
			Status:     pb.TaskStatus_TASK_STATUS_FAILED,
			Message:    "execute task failed: " + err.Error(),
		})
		return
	}

	span.SetAttributes(attribute.String("task.result_status", resp.Status.String()))
	logger.Info("task execution completed", "task_id", task.ID, "status", resp.Status.String())
	span.SetStatus(codes.Ok, "completed")
}

func (s *Scheduler) watchExecutors() {
	if s.etcdClient == nil {
		logger.Warn("etcd client is nil, skipping executor watch")
		return
	}

	s.etcdClient.Watch(s.ctx, "services/executor", func(key string, value []byte, isDelete bool) {
		if isDelete {
			executorID := s.extractExecutorID(key)
			if executorID != "" {
				s.removeExecutor(executorID)
				logger.Info("executor removed via etcd watch", "executor_id", executorID)
			} else {
				logger.Info("executor offline", "key", key)
			}
		} else {
			logger.Info("executor event", "key", key)
		}
	})
}

func (s *Scheduler) extractExecutorID(key string) string {
	parts := strings.Split(key, "/")
	if len(parts) >= 2 {
		return parts[len(parts)-1]
	}
	return ""
}

func (s *Scheduler) removeExecutor(executorID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.executors[executorID]; exists {
		delete(s.executors, executorID)
		logger.Warn("executor removed from scheduler", "executor_id", executorID)

		s.db.Model(&model.ExecutorInfo{}).Where("id = ?", executorID).Update("status", model.ExecutorStatusOffline)

		s.db.Model(&model.Task{}).Where("executor_id = ? AND status = ?", executorID, model.TaskStatusRunning).Updates(map[string]interface{}{
			"status":     model.TaskStatusFailed,
			"updated_at": time.Now(),
		})
	}
}

func (s *Scheduler) syncExecutorsFromEtcd() {
	if s.etcdClient == nil {
		return
	}

	services, err := s.etcdClient.DiscoverServices(s.ctx, "executor")
	if err != nil {
		logger.Warn("failed to discover services from etcd", "error", err.Error())
		return
	}

	activeExecutors := make(map[string]bool)
	for _, service := range services {
		if id, exists := service["id"]; exists {
			activeExecutors[id] = true
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for executorID := range s.executors {
		if !activeExecutors[executorID] {
			delete(s.executors, executorID)
			logger.Warn("executor removed during sync (not found in etcd)", "executor_id", executorID)

			s.db.Model(&model.ExecutorInfo{}).Where("id = ?", executorID).Update("status", model.ExecutorStatusOffline)
		}
	}
}

func (s *Scheduler) syncActiveExecutorsLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.syncExecutorsFromEtcd()
		}
	}
}

func (s *Scheduler) scanDelayedTasks() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			var tasks []model.Task
			now := time.Now()
			s.db.Where("status = ? AND type = ? AND scheduled_at <= ?",
				model.TaskStatusPending,
				model.TaskTypeDelayed,
				now,
			).Find(&tasks)

			for _, task := range tasks {
				go s.dispatchTask(task.ID)
			}

			s.db.Where("status = ? AND scheduled_at <= ?",
				model.TaskStatusScheduled,
				now,
			).Not("type = ?", model.TaskTypeTimed).Find(&tasks)

			for _, task := range tasks {
				go s.dispatchTask(task.ID)
			}
		}
	}
}

func (s *Scheduler) checkExpiredExecutors() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.mu.Lock()
			for id, exec := range s.executors {
				if time.Since(exec.LastSeen) > 60*time.Second {
					delete(s.executors, id)
					logger.Warn("executor removed due to timeout", "executor_id", id)

					s.db.Model(&model.ExecutorInfo{}).Where("id = ?", id).Update("status", model.ExecutorStatusOffline)
				}
			}
			s.mu.Unlock()
		}
	}
}

func modelTaskToProto(t *model.Task) *pb.Task {
	return &pb.Task{
		Id:                   t.ID,
		Name:                 t.Name,
		Type:                 pb.TaskType(t.Type),
		CronExpression:       t.CronExpression,
		DelaySeconds:         t.DelaySeconds,
		Payload:              t.Payload,
		MaxRetryCount:        t.MaxRetryCount,
		RetryIntervalSeconds: t.RetryIntervalSeconds,
		Status:               pb.TaskStatus(t.Status),
		RetryCount:           t.RetryCount,
		CreatedAt:            t.CreatedAt.Unix(),
		UpdatedAt:            t.UpdatedAt.Unix(),
		ScheduledAt:          t.ScheduledAt.Unix(),
		ExecutorId:           t.ExecutorID,
	}
}
