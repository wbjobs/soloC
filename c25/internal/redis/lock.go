package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
)

const (
	defaultLockTTL     = 10 * time.Second
	defaultRetryCount  = 3
	defaultRetryDelay  = 100 * time.Millisecond
	lockReleaseScript  = `
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("del", KEYS[1])
		else
			return 0
		end
	`
)

type DistributedLock struct {
	redisClient *redis.Client
	key         string
	value       string
	ttl         time.Duration
	isAcquired  bool
}

func (c *Client) NewLock(key string) *DistributedLock {
	return &DistributedLock{
		redisClient: c.rdb,
		key:         key,
		value:       uuid.New().String(),
		ttl:         defaultLockTTL,
		isAcquired:  false,
	}
}

func (l *DistributedLock) WithTTL(ttl time.Duration) *DistributedLock {
	l.ttl = ttl
	return l
}

func (l *DistributedLock) TryAcquire() (bool, error) {
	if l.isAcquired {
		return true, nil
	}

	ok, err := l.redisClient.SetNX(context.Background(), l.key, l.value, l.ttl).Result()
	if err != nil {
		return false, err
	}

	l.isAcquired = ok
	return ok, nil
}

func (l *DistributedLock) Acquire() error {
	for i := 0; i < defaultRetryCount; i++ {
		ok, err := l.TryAcquire()
		if err != nil {
			return err
		}
		if ok {
			return nil
		}
		if i < defaultRetryCount-1 {
			time.Sleep(defaultRetryDelay)
		}
	}
	return fmt.Errorf("failed to acquire lock: %s", l.key)
}

func (l *DistributedLock) Release() error {
	if !l.isAcquired {
		return nil
	}

	_, err := l.redisClient.Eval(context.Background(), lockReleaseScript, []string{l.key}, l.value).Result()
	if err != nil {
		return err
	}

	l.isAcquired = false
	return nil
}

func (l *DistributedLock) Refresh() error {
	if !l.isAcquired {
		return fmt.Errorf("lock not acquired")
	}

	script := `
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("pexpire", KEYS[1], ARGV[2])
		else
			return 0
		end
	`

	ttlMs := int64(l.ttl / time.Millisecond)
	result, err := l.redisClient.Eval(context.Background(), script, []string{l.key}, l.value, ttlMs).Result()
	if err != nil {
		return err
	}

	if result.(int64) == 0 {
		l.isAcquired = false
		return fmt.Errorf("lock expired or not owned")
	}

	return nil
}

func (l *DistributedLock) AcquireWithAutoRefresh(stopRefresh chan struct{}) error {
	err := l.Acquire()
	if err != nil {
		return err
	}

	go func() {
		ticker := time.NewTicker(l.ttl / 2)
		defer ticker.Stop()

		for {
			select {
			case <-stopRefresh:
				return
			case <-ticker.C:
				if !l.isAcquired {
					return
				}
				if err := l.Refresh(); err != nil {
					return
				}
			}
		}
	}()

	return nil
}

func (c *Client) WithLock(key string, ttl time.Duration, fn func() error) error {
	lock := c.NewLock(key).WithTTL(ttl)

	err := lock.Acquire()
	if err != nil {
		return err
	}
	defer lock.Release()

	return fn()
}

func (c *Client) TryWithLock(key string, ttl time.Duration, fn func() error) (bool, error) {
	lock := c.NewLock(key).WithTTL(ttl)

	ok, err := lock.TryAcquire()
	if err != nil {
		return false, err
	}
	if !ok {
		return false, nil
	}
	defer lock.Release()

	return true, fn()
}
