package main

import (
	"context"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
)

type EtcdClient struct {
	client *clientv3.Client
	config *Config
}

func NewEtcdClient(endpoints []string) (*EtcdClient, error) {
	cli, err := clientv3.New(clientv3.Config{
		Endpoints:   endpoints,
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		return nil, err
	}
	return &EtcdClient{
		client: cli,
		config: LoadConfig(),
	}, nil
}

func (e *EtcdClient) Put(ctx context.Context, key, value string) error {
	_, err := e.client.Put(ctx, key, value)
	return err
}

func (e *EtcdClient) PutWithLease(ctx context.Context, key, value string, ttl int64) (clientv3.LeaseID, error) {
	resp, err := e.client.Grant(ctx, ttl)
	if err != nil {
		return 0, err
	}
	_, err = e.client.Put(ctx, key, value, clientv3.WithLease(resp.ID))
	return resp.ID, err
}

func (e *EtcdClient) Get(ctx context.Context, key string, opts ...clientv3.OpOption) (*clientv3.GetResponse, error) {
	return e.client.Get(ctx, key, opts...)
}

func (e *EtcdClient) Delete(ctx context.Context, key string, opts ...clientv3.OpOption) error {
	_, err := e.client.Delete(ctx, key, opts...)
	return err
}

func (e *EtcdClient) Watch(ctx context.Context, key string, opts ...clientv3.OpOption) clientv3.WatchChan {
	return e.client.Watch(ctx, key, opts...)
}

func (e *EtcdClient) KeepAlive(ctx context.Context, leaseID clientv3.LeaseID) (<-chan *clientv3.LeaseKeepAliveResponse, error) {
	return e.client.KeepAlive(ctx, leaseID)
}

func (e *EtcdClient) TxPutIfNotChanged(ctx context.Context, key, expectedValue, newValue string) (bool, error) {
	cmp := clientv3.Compare(clientv3.Value(key), "=", expectedValue)
	put := clientv3.OpPut(key, newValue)
	resp, err := e.client.Txn(ctx).If(cmp).Then(put).Commit()
	if err != nil {
		return false, err
	}
	return resp.Succeeded, nil
}

func (e *EtcdClient) TxPutIfPending(ctx context.Context, key, nodeID string, newValue string) (bool, error) {
	cmp := clientv3.Compare(clientv3.Value(key), "!=", "")
	cmpStatus := clientv3.Compare(clientv3.Value(key), "LIKE", "%\"status\":\"pending\"%")
	cmpNode := clientv3.Compare(clientv3.Value(key), "NOT LIKE", "%\"assigned_node\":\"%\"%")
	
	put := clientv3.OpPut(key, newValue)
	resp, err := e.client.Txn(ctx).If(cmp, cmpStatus, cmpNode).Then(put).Commit()
	if err != nil {
		return false, err
	}
	return resp.Succeeded, nil
}

func (e *EtcdClient) Close() error {
	return e.client.Close()
}
