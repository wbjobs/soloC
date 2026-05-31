package storage

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
)

type RedisClient struct {
	client       *redis.Client
	key          string
	ctx          context.Context
	writeChan    chan []byte
	wg           sync.WaitGroup
	stopChan     chan struct{}
	maxRetries   int
	retryDelay   time.Duration
}

func NewRedisClient(addr, password string, db int, key string) *RedisClient {
	client := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		PoolSize:     100,
		MinIdleConns: 10,
		MaxRetries:   3,
		PoolTimeout:  4 * time.Second,
		ReadTimeout:  2 * time.Second,
		WriteTimeout: 2 * time.Second,
		DialTimeout:  5 * time.Second,
		IdleTimeout:  5 * time.Minute,
	})

	ctx := context.Background()

	if err := client.Ping(ctx).Err(); err != nil {
		log.Printf("Redis ping warning: %v", err)
	}

	rc := &RedisClient{
		client:     client,
		key:        key,
		ctx:        ctx,
		writeChan:  make(chan []byte, 10000),
		stopChan:   make(chan struct{}),
		maxRetries: 3,
		retryDelay: 100 * time.Millisecond,
	}

	rc.wg.Add(1)
	go rc.writeWorker()

	return rc
}

func (rc *RedisClient) writeWorker() {
	defer rc.wg.Done()

	for {
		select {
		case data := <-rc.writeChan:
			if err := rc.lPushWithRetry(data); err != nil {
				log.Printf("Redis LPush failed after retries: %v", err)
			}
		case <-rc.stopChan:
			for {
				select {
				case data := <-rc.writeChan:
					rc.lPushWithRetry(data)
				default:
					return
				}
			}
		}
	}
}

func (rc *RedisClient) lPushWithRetry(data []byte) error {
	var lastErr error
	for i := 0; i < rc.maxRetries; i++ {
		err := rc.client.LPush(rc.ctx, rc.key, data).Err()
		if err == nil {
			return nil
		}
		lastErr = err
		log.Printf("Redis LPush attempt %d failed: %v", i+1, err)
		time.Sleep(rc.retryDelay * time.Duration(i+1))
	}
	return lastErr
}

func (rc *RedisClient) Process(data []byte) error {
	select {
	case rc.writeChan <- data:
		return nil
	default:
		return fmt.Errorf("Redis write channel full, dropping log")
	}
}

func (rc *RedisClient) LPush(data []byte) error {
	return rc.Process(data)
}

func (rc *RedisClient) BPop() ([]byte, error) {
	result, err := rc.client.BRPop(rc.ctx, 0, rc.key)
	if err != nil {
		return nil, err
	}
	if len(result) < 2 {
		return nil, nil
	}
	return []byte(result[1]), nil
}

func (rc *RedisClient) LRange(start, stop int64) ([]string, error) {
	return rc.client.LRange(rc.ctx, rc.key, start, stop).Result()
}

func (rc *RedisClient) LLen() (int64, error) {
	return rc.client.LLen(rc.ctx, rc.key).Result()
}

func (rc *RedisClient) Close() error {
	close(rc.stopChan)
	rc.wg.Wait()
	return rc.client.Close()
}

func (rc *RedisClient) GetClient() *redis.Client {
	return rc.client
}
