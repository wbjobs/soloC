package executor

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"distributed-scheduler/common/config"
	"distributed-scheduler/common/etcdclient"
	"distributed-scheduler/common/logger"
	"distributed-scheduler/common/model"
	"distributed-scheduler/executor/worker"
	pb "distributed-scheduler/proto"
)

type ExecutorServer struct {
	pb.UnimplementedExecutorServiceServer
	worker     *worker.Worker
	etcdClient *etcdclient.Client
	config     *config.ExecutorConfig
	schedulerClient pb.SchedulerServiceClient
}

func NewExecutorServer(cfg *config.ExecutorConfig, etcdClient *etcdclient.Client) *ExecutorServer {
	w := worker.NewWorker(
		cfg.NodeID,
		cfg.Address,
		cfg.MaxConcurrentTasks,
		cfg.SupportedTaskTypes,
	)

	return &ExecutorServer{
		worker:     w,
		etcdClient: etcdClient,
		config:     cfg,
	}
}

func (s *ExecutorServer) ExecuteTask(ctx context.Context, req *pb.ExecuteTaskRequest) (*pb.ExecuteTaskResponse, error) {
	if req.Task == nil {
		return &pb.ExecuteTaskResponse{
			Success: false,
			Message: "task is required",
		}, nil
	}

	status, message := s.worker.ExecuteTask(ctx, req.Task)

	return &pb.ExecuteTaskResponse{
		Success: status == model.TaskStatusSuccess,
		Message: message,
		Status:  pb.TaskStatus(status),
	}, nil
}

func (s *ExecutorServer) Start(schedulerAddr string) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if schedulerAddr != "" {
		conn, err := grpc.Dial(schedulerAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err != nil {
			return fmt.Errorf("failed to connect to scheduler: %w", err)
		}
		defer conn.Close()
		s.schedulerClient = pb.NewSchedulerServiceClient(conn)
		s.worker.SetSchedulerClient(s.schedulerClient)
	}

	if err := s.registerToScheduler(ctx); err != nil {
		logger.Warn("failed to register to scheduler", "error", err.Error())
	}

	if s.etcdClient != nil {
		if err := s.registerToEtcd(ctx); err != nil {
			logger.Warn("failed to register to etcd", "error", err.Error())
		}
		go s.startHeartbeat(ctx)
	}

	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", s.config.GRPCPort))
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterExecutorServiceServer(grpcServer, s)

	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		logger.Info("shutting down executor...")
		cancel()
		grpcServer.GracefulStop()
		s.worker.Stop()
	}()

	logger.Info("executor started", "node_id", s.config.NodeID, "port", s.config.GRPCPort)
	return grpcServer.Serve(listener)
}

func (s *ExecutorServer) registerToScheduler(ctx context.Context) error {
	if s.schedulerClient == nil {
		return fmt.Errorf("scheduler client not set")
	}

	req := &pb.RegisterExecutorRequest{
		Executor: &pb.ExecutorInfo{
			Id:                 s.config.NodeID,
			Address:            s.config.Address,
			Status:             pb.ExecutorStatus_EXECUTOR_STATUS_ONLINE,
			MaxConcurrentTasks: int32(s.config.MaxConcurrentTasks),
			CurrentTasks:       0,
			SupportedTaskTypes: s.config.SupportedTaskTypes,
			LastHeartbeatAt:    time.Now().Unix(),
		},
	}

	resp, err := s.schedulerClient.RegisterExecutor(ctx, req)
	if err != nil {
		return err
	}

	if !resp.Success {
		return fmt.Errorf(resp.Message)
	}

	logger.Info("registered to scheduler successfully")
	return nil
}

func (s *ExecutorServer) registerToEtcd(ctx context.Context) error {
	ttl := int64(30)
	return s.etcdClient.RegisterService(
		ctx,
		"executor",
		s.config.NodeID,
		s.config.Address,
		ttl,
	)
}

func (s *ExecutorServer) startHeartbeat(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(s.config.HeartbeatInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if s.schedulerClient != nil {
				heartbeatCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
				_, err := s.schedulerClient.Heartbeat(heartbeatCtx, &pb.HeartbeatRequest{
					ExecutorId:   s.config.NodeID,
					Status:       pb.ExecutorStatus(s.worker.GetStatus()),
					CurrentTasks: int32(s.worker.GetCurrentTasks()),
				})
				cancel()
				if err != nil {
					logger.Warn("heartbeat failed", "error", err.Error())
				}
			}
		}
	}
}

func (s *ExecutorServer) RegisterHandler(taskType string, handler func(ctx context.Context, payload string) error) {
	s.worker.RegisterHandler(taskType, handler)
}
