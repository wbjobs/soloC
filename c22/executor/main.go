package main

import (
	"flag"
	"fmt"
	"os"

	"distributed-scheduler/common/config"
	"distributed-scheduler/common/etcdclient"
	"distributed-scheduler/common/logger"
	"distributed-scheduler/executor"
)

func main() {
	configPath := flag.String("config", "configs/executor.yaml", "path to config file")
	schedulerAddr := flag.String("scheduler", "", "scheduler address (e.g., localhost:50051)")
	flag.Parse()

	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		fmt.Printf("failed to load config: %v\n", err)
		os.Exit(1)
	}

	logger.Init(cfg.Logger.Level, cfg.Logger.Format)

	var etcdClient *etcdclient.Client
	if len(cfg.Etcd.Endpoints) > 0 {
		etcdClient, err = etcdclient.NewClient(&cfg.Etcd)
		if err != nil {
			logger.Fatal("failed to create etcd client", "error", err.Error())
		}
		defer etcdClient.Close()
		logger.Info("etcd client connected", "endpoints", cfg.Etcd.Endpoints)
	}

	execServer := executor.NewExecutorServer(&cfg.Executor, etcdClient)

	execServer.RegisterHandler("TIMED", func(ctx context.Context, payload string) error {
		logger.Info("executing timed task", "payload", payload)
		return nil
	})

	execServer.RegisterHandler("DELAYED", func(ctx context.Context, payload string) error {
		logger.Info("executing delayed task", "payload", payload)
		return nil
	})

	execServer.RegisterHandler("IMMEDIATE", func(ctx context.Context, payload string) error {
		logger.Info("executing immediate task", "payload", payload)
		return nil
	})

	if err := execServer.Start(*schedulerAddr); err != nil {
		logger.Fatal("executor server failed", "error", err.Error())
	}
}
