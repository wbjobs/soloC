package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
)

type Synchronizer struct {
	etcdClient  *clientv3.Client
	config      *Config
	alertService *AlertService
}

func NewSynchronizer(etcdClient *clientv3.Client, config *Config) *Synchronizer {
	return &Synchronizer{
		etcdClient:   etcdClient,
		config:       config,
		alertService: NewAlertService(),
	}
}

func (s *Synchronizer) Start() {
	go s.syncTasksLoop()
	go s.syncNodesLoop()
	go s.watchTaskLogs()
	log.Println("Synchronizer started")
}

func (s *Synchronizer) syncTasksLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		s.syncTasks()
	}
}

func (s *Synchronizer) syncTasks() {
	ctx := context.Background()
	resp, err := s.etcdClient.Get(ctx, s.config.TaskPrefix, clientv3.WithPrefix())
	if err != nil {
		log.Printf("Failed to get tasks from etcd: %v", err)
		return
	}

	for _, kv := range resp.Kvs {
		var task Task
		if err := json.Unmarshal(kv.Value, &task); err != nil {
			log.Printf("Failed to unmarshal task: %v", err)
			continue
		}

		existing, err := GetTask(task.ID)
		if err != nil {
			if err := CreateTask(&task); err != nil {
				log.Printf("Failed to create task in DB: %v", err)
			}
		} else {
			oldStatus := existing.Status
			oldRetryCount := existing.RetryCount

			existing.Status = task.Status
			existing.Progress = task.Progress
			existing.AssignedNode = task.AssignedNode
			existing.RetryCount = task.RetryCount
			existing.Result = task.Result
			existing.Error = task.Error
			existing.StartedAt = task.StartedAt
			existing.CompletedAt = task.CompletedAt
			existing.LastHeartbeat = task.LastHeartbeat
			existing.UpdatedAt = time.Now()

			if err := UpdateTask(existing); err != nil {
				log.Printf("Failed to update task in DB: %v", err)
			}

			s.checkAndSendAlert(existing, oldStatus, oldRetryCount)
		}
	}
}

func (s *Synchronizer) checkAndSendAlert(task *Task, oldStatus string, oldRetryCount int) {
	if task.Status == "failed" && oldStatus != "failed" {
		go s.alertService.SendTaskAlert(task, "FAILURE", task.Error)
	} else if task.Status == "running" && !task.CompletedAt.IsZero() {
		elapsed := time.Since(task.StartedAt)
		timeout := time.Duration(task.Timeout) * time.Second
		if timeout > 0 && elapsed > timeout && oldStatus == "running" {
			go s.alertService.SendTaskAlert(task, "TIMEOUT", 
				fmt.Sprintf("Task exceeded timeout of %d seconds", task.Timeout))
		}
	} else if task.RetryCount > oldRetryCount && task.Status == "pending" {
		go s.alertService.SendTaskAlert(task, "RETRY", 
			fmt.Sprintf("Task retrying (attempt %d/%d)", task.RetryCount, task.MaxRetries))
	}
}

func (s *Synchronizer) syncNodesLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		s.syncNodes()
	}
}

func (s *Synchronizer) syncNodes() {
	ctx := context.Background()
	resp, err := s.etcdClient.Get(ctx, s.config.NodePrefix, clientv3.WithPrefix())
	if err != nil {
		log.Printf("Failed to get nodes from etcd: %v", err)
		return
	}

	for _, kv := range resp.Kvs {
		var node Node
		if err := json.Unmarshal(kv.Value, &node); err != nil {
			log.Printf("Failed to unmarshal node: %v", err)
			continue
		}

		existing, err := GetNode(node.ID)
		if err != nil {
			node.CreatedAt = time.Now()
			node.UpdatedAt = time.Now()
			if err := CreateNode(&node); err != nil {
				log.Printf("Failed to create node in DB: %v", err)
			}
		} else {
			existing.Address = node.Address
			existing.CPU = node.CPU
			existing.Memory = node.Memory
			existing.Tasks = node.Tasks
			existing.Status = node.Status
			existing.LastHeartbeat = node.LastHeartbeat
			existing.UpdatedAt = time.Now()

			if err := UpdateNode(existing); err != nil {
				log.Printf("Failed to update node in DB: %v", err)
			}
		}
	}
}

func (s *Synchronizer) watchTaskLogs() {
	log.Println("Watching for task logs...")
	watchChan := s.etcdClient.Watch(context.Background(), s.config.LogPrefix, clientv3.WithPrefix())

	for watchResp := range watchChan {
		for _, event := range watchResp.Events {
			if event.Type == clientv3.EventTypePut {
				var logEntry TaskLog
				if err := json.Unmarshal(event.Kv.Value, &logEntry); err != nil {
					continue
				}
				if err := CreateTaskLog(&logEntry); err != nil {
					log.Printf("Failed to create task log: %v", err)
				}
			}
		}
	}
}
