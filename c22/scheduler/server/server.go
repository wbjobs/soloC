package server

import (
	"context"
	"fmt"
	"net"
	"time"

	"google.golang.org/grpc"
	"gorm.io/gorm"

	"distributed-scheduler/common/etcdclient"
	"distributed-scheduler/common/logger"
	"distributed-scheduler/common/model"
	"distributed-scheduler/scheduler/core"
	pb "distributed-scheduler/proto"
)

type SchedulerServer struct {
	pb.UnimplementedSchedulerServiceServer
	scheduler *core.Scheduler
	db        *gorm.DB
}

func NewSchedulerServer(db *gorm.DB, etcdClient *etcdclient.Client, loadBalanceStrategy string) *SchedulerServer {
	return &SchedulerServer{
		scheduler: core.NewScheduler(db, etcdClient, loadBalanceStrategy),
		db:        db,
	}
}

func (s *SchedulerServer) Start(port int) error {
	s.scheduler.Start()

	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterSchedulerServiceServer(grpcServer, s)

	logger.Info("scheduler grpc server started", "port", port)
	return grpcServer.Serve(listener)
}

func (s *SchedulerServer) Stop() {
	s.scheduler.Stop()
}

func (s *SchedulerServer) CreateTask(ctx context.Context, req *pb.CreateTaskRequest) (*pb.CreateTaskResponse, error) {
	task, err := s.scheduler.CreateTask(ctx, req)
	if err != nil {
		logger.Error("failed to create task", "error", err.Error())
		return &pb.CreateTaskResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	logger.Info("task created", "task_id", task.Id, "name", task.Name)
	return &pb.CreateTaskResponse{
		Success: true,
		Message: "task created successfully",
		Task:    task,
	}, nil
}

func (s *SchedulerServer) CancelTask(ctx context.Context, req *pb.CancelTaskRequest) (*pb.CancelTaskResponse, error) {
	err := s.scheduler.CancelTask(ctx, req.TaskId)
	if err != nil {
		logger.Error("failed to cancel task", "task_id", req.TaskId, "error", err.Error())
		return &pb.CancelTaskResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	logger.Info("task cancelled", "task_id", req.TaskId)
	return &pb.CancelTaskResponse{
		Success: true,
		Message: "task cancelled successfully",
	}, nil
}

func (s *SchedulerServer) GetTask(ctx context.Context, req *pb.GetTaskRequest) (*pb.GetTaskResponse, error) {
	task, err := s.scheduler.GetTask(ctx, req.TaskId)
	if err != nil {
		logger.Error("failed to get task", "task_id", req.TaskId, "error", err.Error())
		return &pb.GetTaskResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &pb.GetTaskResponse{
		Success: true,
		Message: "success",
		Task:    task,
	}, nil
}

func (s *SchedulerServer) ListTasks(ctx context.Context, req *pb.ListTasksRequest) (*pb.ListTasksResponse, error) {
	page := int(req.Page)
	if page <= 0 {
		page = 1
	}
	pageSize := int(req.PageSize)
	if pageSize <= 0 {
		pageSize = 20
	}

	tasks, total, err := s.scheduler.ListTasks(ctx, page, pageSize, model.TaskStatus(req.Status))
	if err != nil {
		logger.Error("failed to list tasks", "error", err.Error())
		return &pb.ListTasksResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &pb.ListTasksResponse{
		Success: true,
		Message: "success",
		Tasks:   tasks,
		Total:   int32(total),
	}, nil
}

func (s *SchedulerServer) ReportTaskStatus(ctx context.Context, req *pb.ReportTaskStatusRequest) (*pb.ReportTaskStatusResponse, error) {
	err := s.scheduler.ReportTaskStatus(ctx, req)
	if err != nil {
		logger.Error("failed to report task status", "task_id", req.TaskId, "error", err.Error())
		return &pb.ReportTaskStatusResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	logger.Info("task status reported", "task_id", req.TaskId, "status", req.Status.String())
	return &pb.ReportTaskStatusResponse{
		Success: true,
		Message: "status reported successfully",
	}, nil
}

func (s *SchedulerServer) RegisterExecutor(ctx context.Context, req *pb.RegisterExecutorRequest) (*pb.RegisterExecutorResponse, error) {
	if req.Executor == nil {
		return &pb.RegisterExecutorResponse{
			Success: false,
			Message: "executor info is required",
		}, nil
	}

	executor := &model.ExecutorInfo{
		ID:                 req.Executor.Id,
		Address:            req.Executor.Address,
		Status:             model.ExecutorStatus(req.Executor.Status),
		MaxConcurrentTasks: req.Executor.MaxConcurrentTasks,
		CurrentTasks:       req.Executor.CurrentTasks,
		LastHeartbeatAt:    time.Now(),
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	if len(req.Executor.SupportedTaskTypes) > 0 {
		executor.SupportedTaskTypes = ""
		for _, t := range req.Executor.SupportedTaskTypes {
			if executor.SupportedTaskTypes != "" {
				executor.SupportedTaskTypes += ","
			}
			executor.SupportedTaskTypes += t
		}
	}

	err := s.scheduler.RegisterExecutor(executor)
	if err != nil {
		logger.Error("failed to register executor", "executor_id", executor.ID, "error", err.Error())
		return &pb.RegisterExecutorResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	logger.Info("executor registered", "executor_id", executor.ID, "address", executor.Address)
	return &pb.RegisterExecutorResponse{
		Success: true,
		Message: "executor registered successfully",
	}, nil
}

func (s *SchedulerServer) Heartbeat(ctx context.Context, req *pb.HeartbeatRequest) (*pb.HeartbeatResponse, error) {
	err := s.scheduler.Heartbeat(req.ExecutorId, model.ExecutorStatus(req.Status), req.CurrentTasks)
	if err != nil {
		logger.Error("failed to process heartbeat", "executor_id", req.ExecutorId, "error", err.Error())
		return &pb.HeartbeatResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &pb.HeartbeatResponse{
		Success: true,
		Message: "heartbeat received",
	}, nil
}

func (s *SchedulerServer) GetTaskLogs(ctx context.Context, req *pb.GetTaskLogsRequest) (*pb.GetTaskLogsResponse, error) {
	page := int(req.Page)
	if page <= 0 {
		page = 1
	}
	pageSize := int(req.PageSize)
	if pageSize <= 0 {
		pageSize = 20
	}

	var logs []model.TaskLog
	var total int64

	query := s.db.WithContext(ctx).Model(&model.TaskLog{}).Where("task_id = ?", req.TaskId)

	if err := query.Count(&total).Error; err != nil {
		return &pb.GetTaskLogsResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	offset := (page - 1) * pageSize
	if offset < 0 {
		offset = 0
	}

	if err := query.Offset(offset).Limit(pageSize).Order("created_at DESC").Find(&logs).Error; err != nil {
		return &pb.GetTaskLogsResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	pbLogs := make([]*pb.TaskLog, len(logs))
	for i, log := range logs {
		pbLogs[i] = &pb.TaskLog{
			Id:         log.ID,
			TaskId:     log.TaskID,
			ExecutorId: log.ExecutorID,
			Status:     pb.TaskStatus(log.Status),
			Message:    log.Message,
			StartedAt:  log.StartedAt.Unix(),
			FinishedAt: log.FinishedAt.Unix(),
			RetryCount: log.RetryCount,
		}
	}

	return &pb.GetTaskLogsResponse{
		Success: true,
		Message: "success",
		Logs:    pbLogs,
		Total:   int32(total),
	}, nil
}
