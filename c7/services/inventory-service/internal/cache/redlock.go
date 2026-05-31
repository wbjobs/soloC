package cache

import (
	"context"
	"fmt"
	"time"

	"github.com/go-redsync/redsync/v4"
	"github.com/go-redsync/redsync/v4/redis/goredis/v9"
	"github.com/redis/go-redis/v9"
)

const (
	DefaultRetryDelay   = 50 * time.Millisecond
	DefaultRetryCount   = 20
	DefaultLockTTL      = 5 * time.Second
	DefaultDriftFactor  = 0.1
)

type Redlock struct {
	rs           *redsync.Redsync
	ctx          context.Context
	retryDelay   time.Duration
	retryCount   int
	lockTTL      time.Duration
	driftFactor  float64
}

type Lock struct {
	mutex    *redsync.Mutex
	resource string
}

type RedlockOption func(*Redlock)

func WithRetryDelay(d time.Duration) RedlockOption {
	return func(r *Redlock) {
		if d > 0 {
			r.retryDelay = d
		}
	}
}

func WithRetryCount(n int) RedlockOption {
	return func(r *Redlock) {
		if n > 0 {
			r.retryCount = n
		}
	}
}

func WithLockTTL(ttl time.Duration) RedlockOption {
	return func(r *Redlock) {
		if ttl > 0 {
			r.lockTTL = ttl
		}
	}
}

func WithDriftFactor(f float64) RedlockOption {
	return func(r *Redlock) {
		if f > 0 {
			r.driftFactor = f
		}
	}
}

func NewRedlock(addresses []string, opts ...RedlockOption) *Redlock {
	var pools []redsync.Pool
	for _, addr := range addresses {
		client := redis.NewClient(&redis.Options{
			Addr:     addr,
			Password: "",
			DB:       0,
		})
		pools = append(pools, goredis.NewPool(client))
	}

	r := &Redlock{
		rs:          redsync.New(pools...),
		ctx:         context.Background(),
		retryDelay:  DefaultRetryDelay,
		retryCount:  DefaultRetryCount,
		lockTTL:     DefaultLockTTL,
		driftFactor: DefaultDriftFactor,
	}

	for _, opt := range opts {
		opt(r)
	}

	return r
}

func (r *Redlock) Lock(resource string) (*Lock, error) {
	return r.LockWithTTL(resource, r.lockTTL)
}

func (r *Redlock) LockWithTTL(resource string, ttl time.Duration) (*Lock, error) {
	if ttl <= 0 {
		ttl = r.lockTTL
	}

	drift := time.Duration(int64(float64(ttl) * r.driftFactor))

	mutex := r.rs.NewMutex(
		resource,
		redsync.WithExpiry(ttl),
		redsync.WithRetryDelay(r.retryDelay),
		redsync.WithTries(r.retryCount),
		redsync.WithDriftFactor(r.driftFactor),
	)

	if err := mutex.Lock(); err != nil {
		return nil, fmt.Errorf("failed to acquire lock on %s: %w", resource, err)
	}

	_ = drift

	return &Lock{
		mutex:    mutex,
		resource: resource,
	}, nil
}

func (r *Redlock) Unlock(lock *Lock) error {
	if lock == nil || lock.mutex == nil {
		return nil
	}

	ok, err := lock.mutex.Unlock()
	if err != nil {
		return fmt.Errorf("failed to release lock on %s: %w", lock.resource, err)
	}
	if !ok {
		return fmt.Errorf("lock on %s has expired or does not exist", lock.resource)
	}

	return nil
}

func (r *Redlock) Extend(lock *Lock, ttl time.Duration) error {
	if lock == nil || lock.mutex == nil {
		return fmt.Errorf("invalid lock")
	}

	if ttl <= 0 {
		ttl = r.lockTTL
	}

	ok, err := lock.mutex.Extend()
	if err != nil {
		return fmt.Errorf("failed to extend lock on %s: %w", lock.resource, err)
	}
	if !ok {
		return fmt.Errorf("could not extend lock on %s", lock.resource)
	}

	return nil
}

func (r *Redlock) LockKey(productID string) string {
	return fmt.Sprintf("reserve:lock:%s", productID)
}
