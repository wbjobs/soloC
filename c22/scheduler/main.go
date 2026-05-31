package main

import (
	"context"
	"flag"
	"fmt"
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
	"distributed-scheduler/common/mysqlclient"
	"distributed-scheduler/common/tracing"
	"distributed-scheduler/scheduler/api"
	"distributed-scheduler/scheduler/server"
	pb "distributed-scheduler/proto"
)

func main() {
	configPath := flag.String("config", "configs/scheduler.yaml", "path to config file")
	flag.Parse()

	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		fmt.Printf("failed to load config: %v\n", err)
		os.Exit(1)
	}

	logger.Init(cfg.Logger.Level, cfg.Logger.Format)

	tracerProvider, err := tracing.Init(&cfg.Tracing)
	if err != nil {
		logger.Error("failed to init tracing", "error", err.Error())
	} else if tracerProvider != nil {
		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := tracing.Shutdown(ctx); err != nil {
				logger.Error("failed to shutdown tracer", "error", err.Error())
			}
		}()
	}

	var etcdClient *etcdclient.Client
	if len(cfg.Etcd.Endpoints) > 0 {
		etcdClient, err = etcdclient.NewClient(&cfg.Etcd)
		if err != nil {
			logger.Fatal("failed to create etcd client", "error", err.Error())
		}
		defer etcdClient.Close()
		logger.Info("etcd client connected", "endpoints", cfg.Etcd.Endpoints)
	}

	mysqlClient, err := mysqlclient.NewClient(&cfg.MySQL)
	if err != nil {
		logger.Fatal("failed to create mysql client", "error", err.Error())
	}
	defer mysqlClient.Close()

	if err := mysqlClient.AutoMigrate(&model.Task{}, &model.TaskLog{}, &model.ExecutorInfo{}); err != nil {
		logger.Fatal("failed to auto migrate database", "error", err.Error())
	}
	logger.Info("database migration completed")

	schedulerServer := server.NewSchedulerServer(mysqlClient.DB(), etcdClient, cfg.Scheduler.LoadBalanceStrategy)

	grpcAddr := fmt.Sprintf("localhost:%d", cfg.Scheduler.GRPCPort)
	conn, err := grpc.Dial(grpcAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		logger.Fatal("failed to create scheduler grpc client", "error", err.Error())
	}
	defer conn.Close()

	apiHandler := api.NewAPIHandler(mysqlClient.DB(), pb.NewSchedulerServiceClient(conn))

	go func() {
		if err := schedulerServer.Start(cfg.Scheduler.GRPCPort); err != nil {
			logger.Fatal("scheduler grpc server failed", "error", err.Error())
		}
	}()

	time.Sleep(500 * time.Millisecond)

	go func() {
		if err := api.SetupRouter(apiHandler, cfg.Scheduler.RESTPort); err != nil {
			logger.Fatal("rest api server failed", "error", err.Error())
		}
	}()

	logger.Info("scheduler is running",
		"grpc_port", cfg.Scheduler.GRPCPort,
		"rest_port", cfg.Scheduler.RESTPort,
		"load_balance_strategy", cfg.Scheduler.LoadBalanceStrategy,
		"tracing_enabled", cfg.Tracing.Enabled,
	)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.Info("shutting down scheduler...")
	schedulerServer.Stop()
}
