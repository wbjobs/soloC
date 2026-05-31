package core

import (
	"fmt"
	"sync"
	"sync/atomic"

	"distributed-scheduler/common/logger"
	"distributed-scheduler/common/model"
)

type LoadBalanceStrategy int32

const (
	StrategyRoundRobin LoadBalanceStrategy = iota
	StrategyWeighted
)

func ParseStrategy(strategy string) LoadBalanceStrategy {
	switch strategy {
	case "weighted":
		return StrategyWeighted
	case "round_robin":
		fallthrough
	default:
		return StrategyRoundRobin
	}
}

func (s LoadBalanceStrategy) String() string {
	switch s {
	case StrategyWeighted:
		return "weighted"
	case StrategyRoundRobin:
		return "round_robin"
	default:
		return "round_robin"
	}
}

type LoadBalancer interface {
	Select(executors []*ExecutorConn, task *model.Task) (*ExecutorConn, error)
	UpdateExecutorWeight(executorID string, weight int32)
}

type RoundRobinBalancer struct {
	counter uint64
	mu      sync.Mutex
}

func NewRoundRobinBalancer() *RoundRobinBalancer {
	return &RoundRobinBalancer{}
}

func (b *RoundRobinBalancer) Select(executors []*ExecutorConn, task *model.Task) (*ExecutorConn, error) {
	if len(executors) == 0 {
		return nil, fmt.Errorf("no available executors")
	}

	b.mu.Lock()
	idx := atomic.AddUint64(&b.counter, 1) % uint64(len(executors))
	b.mu.Unlock()

	return executors[idx], nil
}

func (b *RoundRobinBalancer) UpdateExecutorWeight(executorID string, weight int32) {
}

type WeightedBalancer struct {
	weights map[string]int32
	mu      sync.RWMutex
}

func NewWeightedBalancer() *WeightedBalancer {
	return &WeightedBalancer{
		weights: make(map[string]int32),
	}
}

func (b *WeightedBalancer) Select(executors []*ExecutorConn, task *model.Task) (*ExecutorConn, error) {
	if len(executors) == 0 {
		return nil, fmt.Errorf("no available executors")
	}

	b.mu.RLock()
	defer b.mu.RUnlock()

	var totalWeight int32
	for _, exec := range executors {
		weight := b.getWeight(exec.ID)
		if weight <= 0 {
			weight = 1
		}
		totalWeight += weight
	}

	if totalWeight <= 0 {
		return executors[0], nil
	}

	var randomValue int32 = int32(atomic.AddUint64(&globalCounter, 1)) % totalWeight

	currentWeight := int32(0)
	for _, exec := range executors {
		weight := b.getWeight(exec.ID)
		if weight <= 0 {
			weight = 1
		}
		currentWeight += weight
		if randomValue < currentWeight {
			return exec, nil
		}
	}

	return executors[len(executors)-1], nil
}

func (b *WeightedBalancer) getWeight(executorID string) int32 {
	if weight, exists := b.weights[executorID]; exists {
		return weight
	}
	return 1
}

func (b *WeightedBalancer) UpdateExecutorWeight(executorID string, weight int32) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if weight <= 0 {
		weight = 1
	}
	b.weights[executorID] = weight
	logger.Info("executor weight updated", "executor_id", executorID, "weight", weight)
}

var globalCounter uint64

type DynamicLoadBalancer struct {
	strategy   LoadBalanceStrategy
	roundRobin  *RoundRobinBalancer
	weighted    *WeightedBalancer
}

func NewDynamicLoadBalancer(strategy string) *DynamicLoadBalancer {
	return &DynamicLoadBalancer{
		strategy:   ParseStrategy(strategy),
		roundRobin:  NewRoundRobinBalancer(),
		weighted:    NewWeightedBalancer(),
	}
}

func (b *DynamicLoadBalancer) SetStrategy(strategy string) {
	b.strategy = ParseStrategy(strategy)
	logger.Info("load balance strategy changed", "strategy", b.strategy.String())
}

func (b *DynamicLoadBalancer) GetStrategy() LoadBalanceStrategy {
	return b.strategy
}

func (b *DynamicLoadBalancer) Select(executors []*ExecutorConn, task *model.Task) (*ExecutorConn, error) {
	switch b.strategy {
	case StrategyWeighted:
		return b.weighted.Select(executors, task)
	case StrategyRoundRobin:
		fallthrough
	default:
		return b.roundRobin.Select(executors, task)
	}
}

func (b *DynamicLoadBalancer) UpdateExecutorWeight(executorID string, weight int32) {
	b.weighted.UpdateExecutorWeight(executorID, weight)
}
