package consistent

import (
	"context"
	"fmt"
	"hash/crc32"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	DefaultVirtualNodes = 200
	HealthCheckInterval = 10 * time.Second
	ReadRepairThreshold = 3
)

type RedisShard struct {
	Client    *redis.Client
	Address   string
	Healthy   bool
	FailCount int
	mu        sync.RWMutex
}

func NewRedisShard(address string) *RedisShard {
	return &RedisShard{
		Client: redis.NewClient(&redis.Options{
			Addr:     address,
			Password: "",
			DB:       0,
		}),
		Address: address,
		Healthy: true,
	}
}

func (s *RedisShard) CheckHealth(ctx context.Context) bool {
	_, err := s.Client.Ping(ctx).Result()
	s.mu.Lock()
	defer s.mu.Unlock()

	if err != nil {
		s.FailCount++
		if s.FailCount >= ReadRepairThreshold {
			s.Healthy = false
		}
		return false
	}

	s.FailCount = 0
	s.Healthy = true
	return true
}

func (s *RedisShard) IsHealthy() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Healthy
}

func (s *RedisShard) MarkHealthy() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Healthy = true
	s.FailCount = 0
}

func (s *RedisShard) MarkUnhealthy() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.FailCount++
	if s.FailCount >= ReadRepairThreshold {
		s.Healthy = false
	}
}

type HashRing struct {
	virtualNodes int
	ring         []uint32
	hashMap      map[uint32]*RedisShard
	shards       map[string]*RedisShard
	mu           sync.RWMutex
	ctx          context.Context
	cancel       context.CancelFunc
}

type HashRingOption func(*HashRing)

func WithVirtualNodes(n int) HashRingOption {
	return func(h *HashRing) {
		if n > 0 {
			h.virtualNodes = n
		}
	}
}

func NewHashRing(addresses []string, opts ...HashRingOption) *HashRing {
	ctx, cancel := context.WithCancel(context.Background())

	h := &HashRing{
		virtualNodes: DefaultVirtualNodes,
		hashMap:      make(map[uint32]*RedisShard),
		shards:       make(map[string]*RedisShard),
		ctx:          ctx,
		cancel:       cancel,
	}

	for _, opt := range opts {
		opt(h)
	}

	for _, addr := range addresses {
		shard := NewRedisShard(addr)
		h.shards[addr] = shard
	}

	h.rebuildRing()

	go h.healthCheckLoop()

	return h
}

func (h *HashRing) Close() {
	if h.cancel != nil {
		h.cancel()
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for _, shard := range h.shards {
		shard.Client.Close()
	}
}

func hashKey(key string) uint32 {
	return crc32.ChecksumIEEE([]byte(key))
}

func (h *HashRing) rebuildRing() {
	h.ring = []uint32{}
	h.hashMap = make(map[uint32]*RedisShard)

	h.mu.RLock()
	shards := make([]*RedisShard, 0, len(h.shards))
	for _, shard := range h.shards {
		shards = append(shards, shard)
	}
	h.mu.RUnlock()

	for _, shard := range shards {
		for i := 0; i < h.virtualNodes; i++ {
			hash := hashKey(shard.Address + ":" + strconv.Itoa(i))
			h.ring = append(h.ring, hash)
			h.hashMap[hash] = shard
		}
	}

	sort.Slice(h.ring, func(i, j int) bool {
		return h.ring[i] < h.ring[j]
	})
}

func (h *HashRing) GetShard(key string) (*RedisShard, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if len(h.ring) == 0 {
		return nil, fmt.Errorf("no available shards")
	}

	hash := hashKey(key)

	idx := sort.Search(len(h.ring), func(i int) bool {
		return h.ring[i] >= hash
	})

	if idx == len(h.ring) {
		idx = 0
	}

	shard := h.hashMap[h.ring[idx]]
	if shard == nil {
		return nil, fmt.Errorf("no shard found for key: %s", key)
	}

	if !shard.IsHealthy() {
		nextShard := h.findNextHealthyShard(idx)
		if nextShard == nil {
			return nil, fmt.Errorf("all shards are unhealthy")
		}
		return nextShard, nil
	}

	return shard, nil
}

func (h *HashRing) findNextHealthyShard(startIdx int) *RedisShard {
	for i := 1; i < len(h.ring); i++ {
		idx := (startIdx + i) % len(h.ring)
		shard := h.hashMap[h.ring[idx]]
		if shard != nil && shard.IsHealthy() {
			return shard
		}
	}
	return nil
}

func (h *HashRing) AddShard(address string) {
	h.mu.Lock()
	shard := NewRedisShard(address)
	h.shards[address] = shard
	h.mu.Unlock()

	h.rebuildRing()
}

func (h *HashRing) RemoveShard(address string) {
	h.mu.Lock()
	if shard, ok := h.shards[address]; ok {
		shard.Client.Close()
		delete(h.shards, address)
	}
	h.mu.Unlock()

	h.rebuildRing()
}

func (h *HashRing) UpdateShards(addresses []string) {
	currentAddrs := make(map[string]bool)
	for addr := range h.shards {
		currentAddrs[addr] = true
	}

	newAddrs := make(map[string]bool)
	for _, addr := range addresses {
		newAddrs[addr] = true
	}

	for addr := range currentAddrs {
		if !newAddrs[addr] {
			h.RemoveShard(addr)
		}
	}

	for addr := range newAddrs {
		if !currentAddrs[addr] {
			h.AddShard(addr)
		}
	}
}

func (h *HashRing) healthCheckLoop() {
	ticker := time.NewTicker(HealthCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-h.ctx.Done():
			return
		case <-ticker.C:
			h.checkAllShards()
		}
	}
}

func (h *HashRing) checkAllShards() {
	h.mu.RLock()
	shards := make([]*RedisShard, 0, len(h.shards))
	for _, shard := range h.shards {
		shards = append(shards, shard)
	}
	h.mu.RUnlock()

	needsRebuild := false
	for _, shard := range shards {
		wasHealthy := shard.IsHealthy()
		shard.CheckHealth(h.ctx)
		isHealthy := shard.IsHealthy()

		if wasHealthy != isHealthy {
			needsRebuild = true
		}
	}

	if needsRebuild {
		h.rebuildRing()
	}
}

func (h *HashRing) ReadRepair(key string, shard *RedisShard, err error) (*RedisShard, error) {
	if err == nil {
		shard.MarkHealthy()
		return shard, nil
	}

	shard.MarkUnhealthy()

	hash := hashKey(key)
	idx := sort.Search(len(h.ring), func(i int) bool {
		return h.ring[i] >= hash
	})
	if idx == len(h.ring) {
		idx = 0
	}

	nextShard := h.findNextHealthyShard(idx)
	if nextShard == nil {
		return nil, fmt.Errorf("read repair failed: all shards unhealthy, last error: %v", err)
	}

	return nextShard, nil
}

func (h *HashRing) Get(key string) (string, error) {
	shard, err := h.GetShard(key)
	if err != nil {
		return "", err
	}

	val, err := shard.Client.Get(h.ctx, key).Result()
	if err != nil {
		repairShard, repairErr := h.ReadRepair(key, shard, err)
		if repairErr != nil {
			return "", repairErr
		}
		return repairShard.Client.Get(h.ctx, key).Result()
	}

	return val, nil
}

func (h *HashRing) Set(key string, value string, ttl time.Duration) error {
	shard, err := h.GetShard(key)
	if err != nil {
		return err
	}

	return shard.Client.Set(h.ctx, key, value, ttl).Err()
}

func (h *HashRing) Del(key string) error {
	shard, err := h.GetShard(key)
	if err != nil {
		return err
	}

	return shard.Client.Del(h.ctx, key).Err()
}

func (h *HashRing) GetClientForKey(key string) (*redis.Client, error) {
	shard, err := h.GetShard(key)
	if err != nil {
		return nil, err
	}
	return shard.Client, nil
}

func (h *HashRing) GetAllHealthyShards() []*RedisShard {
	h.mu.RLock()
	defer h.mu.RUnlock()

	shards := make([]*RedisShard, 0, len(h.shards))
	for _, shard := range h.shards {
		if shard.IsHealthy() {
			shards = append(shards, shard)
		}
	}
	return shards
}

func (h *HashRing) GetShardCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.shards)
}
