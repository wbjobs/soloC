package main

import (
	"context"
	"encoding/json"
	"log"
	"sort"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
)

type Scheduler struct {
	etcdClient  *EtcdClient
	nodeManager *NodeManager
	taskManager *TaskManager
	cron        *cron.Cron
	running     bool
	mutex       sync.Mutex
	config      *Config
}

func NewScheduler(etcdClient *EtcdClient, nodeManager *NodeManager, taskManager *TaskManager) *Scheduler {
	return &Scheduler{
		etcdClient:  etcdClient,
		nodeManager: nodeManager,
		taskManager: taskManager,
		cron:        cron.New(cron.WithSeconds()),
		config:      LoadConfig(),
	}
}

func (s *Scheduler) Start() {
	s.mutex.Lock()
	s.running = true
	s.mutex.Unlock()

	log.Println("Scheduler started")
	s.cron.Start()

	go s.scheduleLoop()
	go s.checkCronTasks()
}

func (s *Scheduler) Stop() {
	s.mutex.Lock()
	s.running = false
	s.mutex.Unlock()

	s.cron.Stop()
	log.Println("Scheduler stopped")
}

func (s *Scheduler) scheduleLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		s.mutex.Lock()
		if !s.running {
			s.mutex.Unlock()
			return
		}
		s.mutex.Unlock()

		s.assignPendingTasks()
	}
}

func (s *Scheduler) assignPendingTasks() {
	ctx := context.Background()
	
	pendingTasks := s.taskManager.GetPendingTasks()
	if len(pendingTasks) == 0 {
		return
	}

	sort.Slice(pendingTasks, func(i, j int) bool {
		return pendingTasks[i].Priority > pendingTasks[j].Priority
	})

	for _, task := range pendingTasks {
		if !s.taskManager.CheckDependencies(task) {
			continue
		}

		if task.Type == TaskTypeCron && !task.ScheduledAt.IsZero() && task.ScheduledAt.After(time.Now()) {
			continue
		}

		node := s.nodeManager.SelectNodeWithPriority(task.Priority)
		if node == nil {
			log.Printf("No available nodes for task: %s", task.ID)
			continue
		}

		log.Printf("Selected node %s for task %s (priority: %d)", node.ID, task.ID, task.Priority)

		taskKey := s.config.TaskPrefix + task.ID
		
		originalTaskData, _ := json.Marshal(task)
		
		task.AssignedNode = node.ID
		task.Status = TaskStatusRunning
		task.StartedAt = time.Now()
		task.UpdatedAt = time.Now()

		newTaskData, err := json.Marshal(task)
		if err != nil {
			log.Printf("Failed to marshal task %s: %v", task.ID, err)
			continue
		}

		success, err := s.etcdClient.TxPutIfNotChanged(ctx, taskKey, string(originalTaskData), string(newTaskData))
		if err != nil {
			log.Printf("Failed to assign task %s: %v", task.ID, err)
			continue
		}

		if success {
			log.Printf("Successfully assigned task %s to node %s", task.ID, node.ID)
		} else {
			log.Printf("Task %s already assigned by another scheduler or state changed", task.ID)
		}
	}
}

func (s *Scheduler) checkCronTasks() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		s.mutex.Lock()
		if !s.running {
			s.mutex.Unlock()
			return
		}
		s.mutex.Unlock()

		ctx := context.Background()
		resp, err := s.etcdClient.Get(ctx, s.config.TaskPrefix, clientv3.WithPrefix())
		if err != nil {
			log.Printf("Failed to get tasks: %v", err)
			continue
		}

		for _, kv := range resp.Kvs {
			var task Task
			if err := json.Unmarshal(kv.Value, &task); err != nil {
				continue
			}

			if task.Type == TaskTypeCron && task.Status == TaskStatusPending {
				schedule, err := cron.ParseStandard(task.CronExpr)
				if err != nil {
					log.Printf("Invalid cron expression for task %s: %v", task.ID, err)
					continue
				}

				nextRun := schedule.Next(time.Now())
				if task.ScheduledAt.IsZero() || task.ScheduledAt.Before(time.Now()) {
					task.ScheduledAt = nextRun
					s.taskManager.UpdateTask(ctx, &task)
				}
			}
		}
	}
}
