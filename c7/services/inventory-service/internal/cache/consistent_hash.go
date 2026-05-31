package cache

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

type RedisShard struct {
	Client *redis.Client
	Address string
}

type ConsistentHash struct {
	replicas int
	ring       []uint32
	hashMap    map[uint32]*RedisShard
	shards     map[string]*RedisShard
	mu         sync.RWMutex
	ctx        context.Context
}

func hashKey(key string) uint32 {
	return crc32.ChecksumIEEE([]byte(key))
}

func NewConsistentHash(replicas int, addresses []string) *ConsistentHash {
	ch := &ConsistentHash{
		replicas: replicas,
		hashMap:  make(map[uint32]*RedisShard),
		shards:   make(map[string]*RedisShard),
		ctx:      context.Background(),
	}

	for _, addr := range addresses {
		client := redis.NewClient(&redis.Options{
			Addr:     addr,
			Password: "",
			DB:       0,
		})

		shard := &RedisShard{
			Client: client,
			Address: addr,
		}

		ch.shards[addr] = shard

		for i := 0; i < replicas; i++ {
			hash := hashKey(addr + strconv.Itoa(i))
			ch.ring = append(ch.ring, hash)
			ch.hashMap[hash] = shard
		}
	}

	sort.Slice(ch.ring, func(i, j int) bool {
		return ch.ring[i] < ch.ring[j]
	})

	return ch
}

func (ch *ConsistentHash) GetShard(key string) *RedisShard {
	ch.mu.RLock()
	defer ch.mu.RUnlock()

	if len(ch.ring) == 0 {
		return nil
	}

	hash := hashKey(key)

	idx := sort.Search(len(ch.ring), func(i int) bool {
		return ch.ring[i] >= hash
	})

	if idx == len(ch.ring) {
		idx = 0
	}

	return ch.hashMap[ch.ring[idx]]
}

func (ch *ConsistentHash) CacheKey(productID string) string {
	return fmt.Sprintf("inventory:%s", productID)
}

func (ch *ConsistentHash) Get(productID string) (string, error) {
	shard := ch.GetShard(productID)
	if shard == nil {
		return "", fmt.Errorf("no available shard")
	}

	key := ch.CacheKey(productID)
	return shard.Client.Get(ch.ctx, key).Result()
}

func (ch *ConsistentHash) Set(productID string, value string, ttl time.Duration) error {
	shard := ch.GetShard(productID)
	if shard == nil {
		return fmt.Errorf("no available shard")
	}

	key := ch.CacheKey(productID)
	return shard.Client.Set(ch.ctx, key, value, ttl).Err()
}

func (ch *ConsistentHash) Del(productID string) error {
	shard := ch.GetShard(productID)
	if shard == nil {
		return fmt.Errorf("no available shard")
	}

	key := ch.CacheKey(productID)
	return shard.Client.Del(ch.ctx, key).Err()
}

func (ch *ConsistentHash) GetClientForKey(productID string) *redis.Client {
	shard := ch.GetShard(productID)
	if shard == nil {
		return nil
	}
	return shard.Client
}
