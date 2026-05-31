package main

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
)

type Node struct {
	ID        string    `json:"id"`
	Address   string    `json:"address"`
	CPU       float64   `json:"cpu"`
	Memory    float64   `json:"memory"`
	Tasks     int       `json:"tasks"`
	Status    string    `json:"status"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
}

type NodeManager struct {
	etcdClient   *EtcdClient
	nodes        map[string]*Node
	mutex        sync.RWMutex
	config       *Config
	loadBalancer *LoadBalancer
}

func NewNodeManager(etcdClient *EtcdClient) *NodeManager {
	return &NodeManager{
		etcdClient:   etcdClient,
		nodes:        make(map[string]*Node),
		config:       LoadConfig(),
		loadBalancer: NewLoadBalancer(),
	}
}

func (nm *NodeManager) WatchNodes() {
	log.Println("Watching for node changes...")
	watchChan := nm.etcdClient.Watch(context.Background(), nm.config.NodePrefix, clientv3.WithPrefix())

	for watchResp := range watchChan {
		for _, event := range watchResp.Events {
			nodeID := string(event.Kv.Key)[len(nm.config.NodePrefix):]
			switch event.Type {
			case clientv3.EventTypePut:
				var node Node
				if err := json.Unmarshal(event.Kv.Value, &node); err == nil {
					nm.mutex.Lock()
					nm.nodes[nodeID] = &node
					nm.mutex.Unlock()
					nm.loadBalancer.UpdateNodeMetrics(&node)
					log.Printf("Node registered/updated: %s (CPU: %.1f%%, Mem: %.1f%%, Tasks: %d)", 
						nodeID, node.CPU, node.Memory, node.Tasks)
				}
			case clientv3.EventTypeDelete:
				nm.mutex.Lock()
				if node, exists := nm.nodes[nodeID]; exists {
					log.Printf("Node offline: %s", nodeID)
					go nm.handleNodeFailure(node)
				}
				delete(nm.nodes, nodeID)
				nm.loadBalancer.RemoveNode(nodeID)
				nm.mutex.Unlock()
			}
		}
	}
}

func (nm *NodeManager) handleNodeFailure(node *Node) {
	log.Printf("Handling failure for node: %s", node.ID)
	ctx := context.Background()

	resp, err := nm.etcdClient.Get(ctx, nm.config.TaskPrefix, clientv3.WithPrefix())
	if err != nil {
		log.Printf("Failed to get tasks: %v", err)
		return
	}

	for _, kv := range resp.Kvs {
		var task Task
		if err := json.Unmarshal(kv.Value, &task); err != nil {
			continue
		}
		if task.AssignedNode == node.ID && task.Status == "running" {
			taskLastHeartbeat := task.LastHeartbeat
			if taskLastHeartbeat.IsZero() {
				taskLastHeartbeat = task.StartedAt
			}

			taskTimeout := time.Duration(task.Timeout) * time.Second
			if taskTimeout == 0 {
				taskTimeout = 1 * time.Hour
			}

			heartbeatTimeout := 2 * time.Minute
			if taskTimeout < heartbeatTimeout {
				heartbeatTimeout = taskTimeout
			}

			timeSinceHeartbeat := time.Since(taskLastHeartbeat)
			if timeSinceHeartbeat > heartbeatTimeout {
				log.Printf("Reassigning task: %s from failed node: %s (last heartbeat: %v ago)", task.ID, node.ID, timeSinceHeartbeat)
				task.Status = "pending"
				task.AssignedNode = ""
				task.RetryCount++
				if task.RetryCount <= task.MaxRetries {
					taskData, _ := json.Marshal(task)
					nm.etcdClient.Put(ctx, string(kv.Key), string(taskData))
				} else {
					log.Printf("Task %s exceeded max retries, marking as failed", task.ID)
					task.Status = "failed"
					taskData, _ := json.Marshal(task)
					nm.etcdClient.Put(ctx, string(kv.Key), string(taskData))
				}
			} else {
				log.Printf("Task %s still has active heartbeat (%v ago), not reassigning", task.ID, timeSinceHeartbeat)
			}
		}
	}
}

func (nm *NodeManager) SelectNodeWithPriority(taskPriority int) *Node {
	nm.mutex.RLock()
	nodes := make([]*Node, 0, len(nm.nodes))
	for _, node := range nm.nodes {
		nodes = append(nodes, node)
	}
	nm.mutex.RUnlock()

	if len(nodes) == 0 {
		return nil
	}

	return nm.loadBalancer.SelectBestNode(nodes, taskPriority)
}

func (nm *NodeManager) SelectNode() *Node {
	return nm.SelectNodeWithPriority(0)
}

func (nm *NodeManager) GetLoadBalancerStats() map[string]interface{} {
	return nm.loadBalancer.GetLoadStats()
}

func (nm *NodeManager) GetAllNodes() []*Node {
	nm.mutex.RLock()
	defer nm.mutex.RUnlock()

	nodes := make([]*Node, 0, len(nm.nodes))
	for _, node := range nm.nodes {
		nodes = append(nodes, node)
	}
	return nodes
}

func (nm *NodeManager) CleanupOfflineNodes() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		nm.mutex.Lock()
		for id, node := range nm.nodes {
			if time.Since(node.LastHeartbeat) > time.Duration(nm.config.NodeTTL*2)*time.Second {
				log.Printf("Node %s heartbeat timeout, removing", id)
				delete(nm.nodes, id)
				go nm.handleNodeFailure(node)
			}
		}
		nm.mutex.Unlock()
	}
}
