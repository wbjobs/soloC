package main

import (
	"math"
	"sort"
	"sync"
	"time"
)

type LoadMetric struct {
	CPUWeight     float64
	MemoryWeight  float64
	TaskWeight    float64
	QueueWeight   float64
}

type NodeLoad struct {
	NodeID       string
	CurrentLoad  float64
	PredictedLoad float64
	TaskCount    int
	CPUUsage     float64
	MemoryUsage  float64
	LastUpdate   time.Time
	TaskHistory  []float64
}

type LoadBalancer struct {
	nodeLoads  map[string]*NodeLoad
	metrics    LoadMetric
	mutex      sync.RWMutex
	historySize int
}

func NewLoadBalancer() *LoadBalancer {
	return &LoadBalancer{
		nodeLoads:  make(map[string]*NodeLoad),
		metrics: LoadMetric{
			CPUWeight:    0.35,
			MemoryWeight: 0.35,
			TaskWeight:   0.20,
			QueueWeight:  0.10,
		},
		historySize: 10,
	}
}

func (lb *LoadBalancer) UpdateNodeMetrics(node *Node) {
	lb.mutex.Lock()
	defer lb.mutex.Unlock()

	load, exists := lb.nodeLoads[node.ID]
	if !exists {
		load = &NodeLoad{
			NodeID:      node.ID,
			TaskHistory: make([]float64, 0, lb.historySize),
		}
		lb.nodeLoads[node.ID] = load
	}

	load.CPUUsage = node.CPU
	load.MemoryUsage = node.Memory
	load.TaskCount = node.Tasks
	load.LastUpdate = time.Now()

	load.CurrentLoad = lb.calculateLoad(node.CPU, node.Memory, node.Tasks, 0)
	load.TaskHistory = append(load.TaskHistory, load.CurrentLoad)
	if len(load.TaskHistory) > lb.historySize {
		load.TaskHistory = load.TaskHistory[1:]
	}

	load.PredictedLoad = lb.predictLoad(load)
}

func (lb *LoadBalancer) calculateLoad(cpu, memory float64, taskCount int, queueSize int) float64 {
	load := cpu*lb.metrics.CPUWeight +
		memory*lb.metrics.MemoryWeight +
		math.Min(float64(taskCount)*10, 100)*lb.metrics.TaskWeight +
		math.Min(float64(queueSize)*5, 50)*lb.metrics.QueueWeight

	return math.Min(load, 100)
}

func (lb *LoadBalancer) predictLoad(load *NodeLoad) float64 {
	if len(load.TaskHistory) < 3 {
		return load.CurrentLoad
	}

	alpha := 0.3
	ema := load.TaskHistory[0]
	for i := 1; i < len(load.TaskHistory); i++ {
		ema = alpha*load.TaskHistory[i] + (1-alpha)*ema
	}

	return ema
}

func (lb *LoadBalancer) SelectBestNode(nodes []*Node, taskPriority int) *Node {
	if len(nodes) == 0 {
		return nil
	}

	lb.mutex.RLock()
	defer lb.mutex.RUnlock()

	type scoredNode struct {
		node  *Node
		score float64
	}

	scoredNodes := make([]scoredNode, 0, len(nodes))
	now := time.Now()

	for _, node := range nodes {
		if node.Status != "online" {
			continue
		}

		if nodeLoad, exists := lb.nodeLoads[node.ID]; exists {
			if now.Sub(nodeLoad.LastUpdate) > 2*time.Minute {
				continue
			}

			baseScore := 100 - nodeLoad.PredictedLoad
			priorityBonus := float64(taskPriority) * 2
			stabilityBonus := lb.calculateStabilityBonus(nodeLoad)

			finalScore := baseScore + priorityBonus + stabilityBonus

			scoredNodes = append(scoredNodes, scoredNode{
				node:  node,
				score: finalScore,
			})
		} else {
			score := 100 - lb.calculateLoad(node.CPU, node.Memory, node.Tasks, 0)
			scoredNodes = append(scoredNodes, scoredNode{
				node:  node,
				score: score,
			})
		}
	}

	if len(scoredNodes) == 0 {
		return nil
	}

	sort.Slice(scoredNodes, func(i, j int) bool {
		return scoredNodes[i].score > scoredNodes[j].score
	})

	threshold := 5.0
	bestScore := scoredNodes[0].score
	candidates := make([]*Node, 0)
	for _, sn := range scoredNodes {
		if bestScore-sn.score < threshold {
			candidates = append(candidates, sn.node)
		} else {
			break
		}
	}

	if len(candidates) > 1 {
		minTasks := math.MaxInt32
		var best *Node
		for _, n := range candidates {
			if n.Tasks < minTasks {
				minTasks = n.Tasks
				best = n
			}
		}
		return best
	}

	return scoredNodes[0].node
}

func (lb *LoadBalancer) calculateStabilityBonus(load *NodeLoad) float64 {
	if len(load.TaskHistory) < 3 {
		return 0
	}

	mean := 0.0
	for _, v := range load.TaskHistory {
		mean += v
	}
	mean /= float64(len(load.TaskHistory))

	variance := 0.0
	for _, v := range load.TaskHistory {
		variance += (v - mean) * (v - mean)
	}
	variance /= float64(len(load.TaskHistory))

	stdev := math.Sqrt(variance)
	bonus := math.Max(0, 15-stdev)

	return bonus
}

func (lb *LoadBalancer) GetNodeLoad(nodeID string) (float64, bool) {
	lb.mutex.RLock()
	defer lb.mutex.RUnlock()

	load, exists := lb.nodeLoads[nodeID]
	if !exists {
		return 0, false
	}
	return load.PredictedLoad, true
}

func (lb *LoadBalancer) GetAllNodeLoads() map[string]float64 {
	lb.mutex.RLock()
	defer lb.mutex.RUnlock()

	result := make(map[string]float64)
	for id, load := range lb.nodeLoads {
		result[id] = load.PredictedLoad
	}
	return result
}

func (lb *LoadBalancer) RemoveNode(nodeID string) {
	lb.mutex.Lock()
	defer lb.mutex.Unlock()

	delete(lb.nodeLoads, nodeID)
}

func (lb *LoadBalancer) GetLoadStats() map[string]interface{} {
	lb.mutex.RLock()
	defer lb.mutex.RUnlock()

	totalLoad := 0.0
	maxLoad := 0.0
	minLoad := 100.0
	onlineNodes := 0

	for _, load := range lb.nodeLoads {
		totalLoad += load.PredictedLoad
		if load.PredictedLoad > maxLoad {
			maxLoad = load.PredictedLoad
		}
		if load.PredictedLoad < minLoad {
			minLoad = load.PredictedLoad
		}
		onlineNodes++
	}

	avgLoad := 0.0
	if onlineNodes > 0 {
		avgLoad = totalLoad / float64(onlineNodes)
	}

	loadBalance := 0.0
	if onlineNodes > 1 && maxLoad > 0 {
		loadBalance = 100 * (1 - (maxLoad - minLoad) / maxLoad)
	}

	return map[string]interface{}{
		"online_nodes":   onlineNodes,
		"average_load":   avgLoad,
		"max_load":       maxLoad,
		"min_load":       minLoad,
		"load_balance":   loadBalance,
		"total_load":     totalLoad,
	}
}
