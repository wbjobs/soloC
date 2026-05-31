package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"distributed-scheduler/common/logger"
	"distributed-scheduler/common/model"
	pb "distributed-scheduler/proto"
)

type TaskHandler func(ctx context.Context, payload string) error

type Worker struct {
	nodeID             string
	address            string
	maxConcurrentTasks int
	currentTasks       int
	supportedTaskTypes map[string]bool
	handlers           map[string]TaskHandler
	mu                 sync.RWMutex
	ctx                context.Context
	cancel             context.CancelFunc
	schedulerClient    pb.SchedulerServiceClient
}

func NewWorker(nodeID, address string, maxConcurrentTasks int, supportedTaskTypes []string) *Worker {
	ctx, cancel := context.WithCancel(context.Background())

	types := make(map[string]bool)
	for _, t := range supportedTaskTypes {
		types[t] = true
	}

	return &Worker{
		nodeID:             nodeID,
		address:            address,
		maxConcurrentTasks: maxConcurrentTasks,
		supportedTaskTypes: types,
		handlers:           make(map[string]TaskHandler),
		ctx:                ctx,
		cancel:             cancel,
	}
}

func (w *Worker) SetSchedulerClient(client pb.SchedulerServiceClient) {
	w.schedulerClient = client
}

func (w *Worker) RegisterHandler(taskType string, handler TaskHandler) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.handlers[taskType] = handler
	logger.Info("handler registered", "task_type", taskType)
}

func (w *Worker) GetNodeID() string {
	return w.nodeID
}

func (w *Worker) GetAddress() string {
	return w.address
}

func (w *Worker) GetCurrentTasks() int {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.currentTasks
}

func (w *Worker) CanAcceptTask() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.currentTasks < w.maxConcurrentTasks
}

func (w *Worker) GetStatus() model.ExecutorStatus {
	if w.CanAcceptTask() {
		return model.ExecutorStatusOnline
	}
	return model.ExecutorStatusBusy
}

func (w *Worker) ExecuteTask(ctx context.Context, task *pb.Task) (model.TaskStatus, string) {
	if !w.CanAcceptTask() {
		logger.Warn("worker is busy, rejecting task", "task_id", task.Id)
		return model.TaskStatusFailed, "worker is busy"
	}

	w.mu.Lock()
	w.currentTasks++
	w.mu.Unlock()

	defer func() {
		w.mu.Lock()
		w.currentTasks--
		w.mu.Unlock()
	}()

	startedAt := time.Now().Unix()
	logger.Info("executing task", "task_id", task.Id, "name", task.Name, "type", task.Type.String(), "retry_count", task.RetryCount)

	taskType := task.Type.String()

	w.mu.RLock()
	handler, exists := w.handlers[taskType]
	w.mu.RUnlock()

	if !exists {
		handler = w.defaultHandler
	}

	var finalStatus model.TaskStatus
	var finalMessage string

	execCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	err := handler(execCtx, task.Payload)
	cancel()

	if err != nil {
		finalStatus = model.TaskStatusFailed
		finalMessage = err.Error()
		logger.Error("task execution failed", "task_id", task.Id, "error", err.Error())
	} else {
		finalStatus = model.TaskStatusSuccess
		finalMessage = "task executed successfully"
		logger.Info("task execution completed successfully", "task_id", task.Id)
	}

	if w.schedulerClient != nil {
		reportCtx, cancelReport := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelReport()

		_, reportErr := w.schedulerClient.ReportTaskStatus(reportCtx, &pb.ReportTaskStatusRequest{
			TaskId:     task.Id,
			ExecutorId: w.nodeID,
			Status:     pb.TaskStatus(finalStatus),
			Message:    finalMessage,
			StartedAt:  startedAt,
			FinishedAt: time.Now().Unix(),
		})

		if reportErr != nil {
			logger.Error("failed to report task status", "task_id", task.Id, "error", reportErr.Error())
		}
	}

	return finalStatus, finalMessage
}

func (w *Worker) defaultHandler(ctx context.Context, payload string) error {
	if payload == "" {
		return nil
	}

	var data map[string]interface{}
	if err := json.Unmarshal([]byte(payload), &data); err != nil {
		logger.Info("executing task with payload", "payload", payload)
		return nil
	}

	logger.Info("executing task", "data", fmt.Sprintf("%+v", data))
	return nil
}

func (w *Worker) Stop() {
	w.cancel()
	logger.Info("worker stopped", "node_id", w.nodeID)
}
