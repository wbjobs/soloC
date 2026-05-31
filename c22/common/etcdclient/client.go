package etcdclient

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.etcd.io/etcd/client/v3"

	"distributed-scheduler/common/config"
	"distributed-scheduler/common/logger"
)

type WatchHandler func(key string, value []byte, isDelete bool)

type Client struct {
	client *clientv3.Client
	config *config.EtcdConfig
	mu     sync.RWMutex
	leases map[int64]clientv3.LeaseID
}

func NewClient(cfg *config.EtcdConfig) (*Client, error) {
	if cfg == nil || len(cfg.Endpoints) == 0 {
		return nil, fmt.Errorf("etcd config is invalid")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.DialTimeout)*time.Second)
	defer cancel()

	cli, err := clientv3.New(clientv3.Config{
		Endpoints:   cfg.Endpoints,
		DialTimeout: time.Duration(cfg.DialTimeout) * time.Second,
		Context:     ctx,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to etcd: %w", err)
	}

	return &Client{
		client: cli,
		config: cfg,
		leases: make(map[int64]clientv3.LeaseID),
	}, nil
}

func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.client.Close()
}

func (c *Client) Put(ctx context.Context, key string, value interface{}, ttlSeconds int64) error {
	fullKey := c.buildKey(key)
	var valStr string

	switch v := value.(type) {
	case string:
		valStr = v
	case []byte:
		valStr = string(v)
	default:
		data, err := json.Marshal(value)
		if err != nil {
			return fmt.Errorf("failed to marshal value: %w", err)
		}
		valStr = string(data)
	}

	if ttlSeconds > 0 {
		lease, err := c.client.Grant(ctx, ttlSeconds)
		if err != nil {
			return fmt.Errorf("failed to grant lease: %w", err)
		}
		_, err = c.client.Put(ctx, fullKey, valStr, clientv3.WithLease(lease.ID))
		if err != nil {
			return fmt.Errorf("failed to put with lease: %w", err)
		}
		return nil
	}

	_, err := c.client.Put(ctx, fullKey, valStr)
	return err
}

func (c *Client) Get(ctx context.Context, key string) ([]byte, error) {
	fullKey := c.buildKey(key)
	resp, err := c.client.Get(ctx, fullKey)
	if err != nil {
		return nil, fmt.Errorf("failed to get key %s: %w", fullKey, err)
	}
	if len(resp.Kvs) == 0 {
		return nil, fmt.Errorf("key not found: %s", fullKey)
	}
	return resp.Kvs[0].Value, nil
}

func (c *Client) GetWithPrefix(ctx context.Context, prefix string) (map[string][]byte, error) {
	fullPrefix := c.buildKey(prefix)
	resp, err := c.client.Get(ctx, fullPrefix, clientv3.WithPrefix())
	if err != nil {
		return nil, fmt.Errorf("failed to get with prefix %s: %w", fullPrefix, err)
	}

	result := make(map[string][]byte)
	for _, kv := range resp.Kvs {
		result[string(kv.Key)] = kv.Value
	}
	return result, nil
}

func (c *Client) Delete(ctx context.Context, key string) error {
	fullKey := c.buildKey(key)
	_, err := c.client.Delete(ctx, fullKey)
	return err
}

func (c *Client) DeleteWithPrefix(ctx context.Context, prefix string) error {
	fullPrefix := c.buildKey(prefix)
	_, err := c.client.Delete(ctx, fullPrefix, clientv3.WithPrefix())
	return err
}

func (c *Client) Watch(ctx context.Context, prefix string, handler WatchHandler) error {
	fullPrefix := c.buildKey(prefix)
	watchChan := c.client.Watch(ctx, fullPrefix, clientv3.WithPrefix())

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case resp, ok := <-watchChan:
				if !ok {
					return
				}
				for _, event := range resp.Events {
					key := string(event.Kv.Key)
					isDelete := event.Type == clientv3.EventTypeDelete
					var value []byte
					if !isDelete {
						value = event.Kv.Value
					}
					handler(key, value, isDelete)
				}
			}
		}
	}()

	return nil
}

func (c *Client) RegisterService(ctx context.Context, serviceName, nodeID, address string, ttlSeconds int64) error {
	key := fmt.Sprintf("services/%s/%s", serviceName, nodeID)
	value := map[string]string{
		"id":      nodeID,
		"address": address,
		"time":    time.Now().Format(time.RFC3339),
	}

	data, err := json.Marshal(value)
	if err != nil {
		return err
	}

	lease, err := c.client.Grant(ctx, ttlSeconds)
	if err != nil {
		return err
	}

	_, err = c.client.Put(ctx, c.buildKey(key), string(data), clientv3.WithLease(lease.ID))
	if err != nil {
		return err
	}

	c.mu.Lock()
	c.leases[lease.ID] = lease.ID
	c.mu.Unlock()

	go c.keepAlive(ctx, lease.ID)
	return nil
}

func (c *Client) keepAlive(ctx context.Context, leaseID clientv3.LeaseID) {
	ch, err := c.client.KeepAlive(ctx, leaseID)
	if err != nil {
		logger.Error("failed to keep alive lease", "error", err.Error())
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case resp, ok := <-ch:
			if !ok {
				return
			}
			if resp == nil {
				logger.Warn("keep alive response is nil")
				return
			}
		}
	}
}

func (c *Client) DiscoverServices(ctx context.Context, serviceName string) ([]map[string]string, error) {
	prefix := fmt.Sprintf("services/%s/", serviceName)
	data, err := c.GetWithPrefix(ctx, prefix)
	if err != nil {
		return nil, err
	}

	var services []map[string]string
	for _, value := range data {
		var info map[string]string
		if err := json.Unmarshal(value, &info); err == nil {
			services = append(services, info)
		}
	}
	return services, nil
}

func (c *Client) ElectLeader(ctx context.Context, electionKey, nodeID string, ttlSeconds int64) (bool, error) {
	key := fmt.Sprintf("election/%s", electionKey)
	fullKey := c.buildKey(key)

	lease, err := c.client.Grant(ctx, ttlSeconds)
	if err != nil {
		return false, err
	}

	txn := c.client.Txn(ctx).
		If(clientv3.Compare(clientv3.CreateRevision(fullKey), "=", 0)).
		Then(clientv3.OpPut(fullKey, nodeID, clientv3.WithLease(lease.ID))).
		Else(clientv3.OpGet(fullKey))

	resp, err := txn.Commit()
	if err != nil {
		return false, err
	}

	if resp.Succeeded {
		go c.keepAlive(ctx, lease.ID)
		return true, nil
	}

	currentLeader := string(resp.Responses[0].GetResponseRange().Kvs[0].Value)
	return currentLeader == nodeID, nil
}

func (c *Client) buildKey(key string) string {
	if strings.HasPrefix(key, c.config.Prefix) {
		return key
	}
	if strings.HasPrefix(key, "/") {
		return c.config.Prefix + key
	}
	return c.config.Prefix + "/" + key
}
