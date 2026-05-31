package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	log.Println("Starting Distributed Task Scheduler...")

	config := LoadConfig()

	etcdClient, err := NewEtcdClient(config.EtcdEndpoints)
	if err != nil {
		log.Fatalf("Failed to connect to etcd: %v", err)
	}
	defer etcdClient.Close()

	nodeManager := NewNodeManager(etcdClient)
	go nodeManager.WatchNodes()

	taskManager := NewTaskManager(etcdClient)
	go taskManager.WatchTasks()

	scheduler := NewScheduler(etcdClient, nodeManager, taskManager)
	go scheduler.Start()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down scheduler...")
	scheduler.Stop()
}
