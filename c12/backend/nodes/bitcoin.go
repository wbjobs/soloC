package nodes

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/btcsuite/btcd/btcjson"
	"github.com/btcsuite/btcd/chaincfg/chainhash"
	"github.com/btcsuite/btcd/rpcclient"
	"github.com/sirupsen/logrus"

	pb "blockchain-monitor/api/gen/monitor"
)

type BitcoinClient struct {
	info             *NodeInfo
	client           *rpcclient.Client
	lastBlockTime    time.Time
	lastBlockNumber  int64
	isConnected      bool
	mu               sync.RWMutex
}

func NewBitcoinClient(info *NodeInfo) *BitcoinClient {
	return &BitcoinClient{
		info: info,
	}
}

func (c *BitcoinClient) Connect(ctx context.Context) error {
	start := time.Now()

	connCfg := &rpcclient.ConnConfig{
		Host:         c.info.Endpoint,
		User:         c.info.Username,
		Pass:         c.info.Password,
		HTTPPostMode: true,
		DisableTLS:   true,
	}

	client, err := rpcclient.New(connCfg, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to bitcoin RPC: %w", err)
	}

	_, err = client.GetBlockCount()
	if err != nil {
		client.Shutdown()
		return fmt.Errorf("failed to get block count: %w", err)
	}

	c.client = client
	c.isConnected = true
	logrus.WithFields(logrus.Fields{
		"node_id":  c.info.ID,
		"endpoint": c.info.Endpoint,
		"latency":  time.Since(start),
	}).Info("Bitcoin node connected")

	return nil
}

func (c *BitcoinClient) Reconnect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.client != nil {
		c.client.Shutdown()
	}

	c.client = nil
	c.isConnected = false

	logrus.WithFields(logrus.Fields{
		"node_id":  c.info.ID,
		"endpoint": c.info.Endpoint,
	}).Info("Attempting to reconnect Bitcoin node...")

	return c.Connect(ctx)
}

func (c *BitcoinClient) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.isConnected
}

func (c *BitcoinClient) Disconnect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.client != nil {
		c.client.Shutdown()
		c.client = nil
		c.isConnected = false
	}
	return nil
}

func (c *BitcoinClient) GetStatus(ctx context.Context) (*NodeStatus, error) {
	status := &NodeStatus{
		Timestamp: time.Now(),
		Status:     pb.NodeStatus_ONLINE,
	}

	start := time.Now()

	blockCount, err := c.client.GetBlockCount()
	if err != nil {
		status.Status = pb.NodeStatus_ERROR
		status.ErrorMessage = err.Error()
		return status, err
	}

	latency := time.Since(start)
	status.Latency = latency
	status.BlockHeight = blockCount

	blockchainInfo, err := c.client.GetBlockChainInfo()
	if err == nil {
		switch blockchainInfo.InitialBlockDownload {
		case true:
			status.Status = pb.NodeStatus_SYNCING
			if blockchainInfo.Headers > 0 {
				progress := float32(blockchainInfo.Blocks) / float32(blockchainInfo.Headers) * 100
				status.SyncProgress = progress
			}
		}
	}

	peerInfo, err := c.client.GetPeerInfo()
	if err == nil {
		status.PeerCount = int64(len(peerInfo))
	}

	return status, nil
}

func (c *BitcoinClient) GetMetrics(ctx context.Context) (*NodeMetrics, error) {
	metrics := &NodeMetrics{
		NodeID:    c.info.ID,
		Timestamp: time.Now(),
	}

	status, err := c.GetStatus(ctx)
	if err != nil {
		return nil, err
	}

	metrics.BlockHeight = status.BlockHeight
	metrics.PeerCount = status.PeerCount
	metrics.SyncProgress = status.SyncProgress
	metrics.Latency = float32(status.Latency.Milliseconds())

	txRate, err := c.calculateTxRate(ctx, status.BlockHeight)
	if err == nil {
		metrics.TxRate = txRate
	}

	return metrics, nil
}

func (c *BitcoinClient) GetNodeInfo() *NodeInfo {
	return c.info
}

func (c *BitcoinClient) calculateTxRate(ctx context.Context, currentHeight int64) (float32, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()

	if c.lastBlockNumber > 0 && c.lastBlockNumber < currentHeight {
		blockDiff := currentHeight - c.lastBlockNumber
		timeDiff := now.Sub(c.lastBlockTime).Seconds()

		if timeDiff > 0 {
			var totalTx int64 = 0
			for i := int64(1); i <= blockDiff && i <= 10; i++ {
				blockHash, err := c.client.GetBlockHash(currentHeight - i)
				if err != nil {
					continue
				}

				block, err := c.client.GetBlock(blockHash)
				if err != nil {
					continue
				}

				totalTx += int64(len(block.Transactions))
			}

			txRate := float64(totalTx) / timeDiff
			return float32(txRate), nil
		}
	}

	c.lastBlockNumber = currentHeight
	c.lastBlockTime = now

	return 0, nil
}

func (c *BitcoinClient) GetBlockchainInfo() (*btcjson.GetBlockChainInfoResult, error) {
	return c.client.GetBlockChainInfo()
}

func (c *BitcoinClient) GetBlock(hash *chainhash.Hash) (*btcjson.GetBlockResult, error) {
	return c.client.GetBlock(hash)
}
