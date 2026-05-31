package nodes

import (
	"context"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"
	"github.com/sirupsen/logrus"

	pb "blockchain-monitor/api/gen/monitor"
)

type EthereumClient struct {
	info       *NodeInfo
	client       *ethclient.Client
	rpcClient    *rpc.Client
	lastBlockTime time.Time
	lastBlockNumber uint64
	isConnected   bool
	mu            sync.RWMutex
}

func NewEthereumClient(info *NodeInfo) *EthereumClient {
	return &EthereumClient{
		info: info,
	}
}

func (c *EthereumClient) Connect(ctx context.Context) error {
	start := time.Now()
	
	rpcClient, err := rpc.DialContext(ctx, c.info.Endpoint)
	if err != nil {
		return fmt.Errorf("failed to connect to ethereum RPC: %w", err)
	}

	client := ethclient.NewClient(rpcClient)
	
	_, err = client.ChainID(ctx)
	if err != nil {
		rpcClient.Close()
		return fmt.Errorf("failed to get chain ID: %w", err)
	}

	c.rpcClient = rpcClient
	c.client = client
	c.isConnected = true
	logrus.WithFields(logrus.Fields{
		"node_id":  c.info.ID,
		"endpoint": c.info.Endpoint,
		"latency":  time.Since(start),
	}).Info("Ethereum node connected")

	return nil
}

func (c *EthereumClient) Reconnect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.rpcClient != nil {
		c.rpcClient.Close()
	}

	c.rpcClient = nil
	c.client = nil
	c.isConnected = false

	logrus.WithFields(logrus.Fields{
		"node_id":  c.info.ID,
		"endpoint": c.info.Endpoint,
	}).Info("Attempting to reconnect Ethereum node...")

	return c.Connect(ctx)
}

func (c *EthereumClient) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.isConnected
}

func (c *EthereumClient) Disconnect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.rpcClient != nil {
		c.rpcClient.Close()
		c.rpcClient = nil
		c.client = nil
		c.isConnected = false
	}
	return nil
}

func (c *EthereumClient) GetStatus(ctx context.Context) (*NodeStatus, error) {
	status := &NodeStatus{
		Timestamp: time.Now(),
		Status:     pb.NodeStatus_ONLINE,
	}

	start := time.Now()

	blockNumber, err := c.client.BlockNumber(ctx)
	if err != nil {
		status.Status = pb.NodeStatus_ERROR
		status.ErrorMessage = err.Error()
		return status, err
	}

	latency := time.Since(start)
	status.Latency = latency
	status.BlockHeight = int64(blockNumber)

	var isSyncing, err := c.isSyncing(ctx)
	if err != nil {
		logrus.WithError(err).Warn("Failed to check sync status")
	}

	if isSyncing {
		status.Status = pb.NodeStatus_SYNCING
		progress, err := c.getSyncProgress(ctx)
		if err == nil {
			status.SyncProgress = progress
		}
	}

	peerCount, err := c.getPeerCount(ctx)
	if err == nil {
		status.PeerCount = peerCount
	}

	return status, nil
}

func (c *EthereumClient) GetMetrics(ctx context.Context) (*NodeMetrics, error) {
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

func (c *EthereumClient) GetNodeInfo() *NodeInfo {
	return c.info
}

func (c *EthereumClient) isSyncing(ctx context.Context) (bool, error) {
	var result interface{}
	err := c.rpcClient.CallContext(ctx, &result, "eth_syncing")
	if err != nil {
		return false, err
	}

	switch v := result.(type) {
	case bool:
		return v, nil
	case map[string]interface{}:
		return true, nil
	default:
		return false, nil
	}
}

func (c *EthereumClient) getSyncProgress(ctx context.Context) (float32, error) {
	var result map[string]interface{}
	err := c.rpcClient.CallContext(ctx, &result, "eth_syncing")
	if err != nil {
		return 0, err
	}

	if result == nil {
		return 100.0, nil
	}

	currentBlock := parseHexBig(result["currentBlock"])
	highestBlock := parseHexBig(result["highestBlock"])

	if highestBlock.Cmp(big.NewInt(0)) == 0 {
		return 0, nil
	}

	progress := new(big.Float).Quo(
		new(big.Float).SetInt(currentBlock),
		new(big.Float).SetInt(highestBlock),
	)
	progressFloat, _ := progress.Float64()
	return float32(progressFloat * 100), nil
}

func (c *EthereumClient) getPeerCount(ctx context.Context) (int64, error) {
	var result string
	err := c.rpcClient.CallContext(ctx, &result, "net_peerCount")
	if err != nil {
		return 0, err
	}

	peerCount := parseHexBig(result)
	return peerCount.Int64(), nil
}

func (c *EthereumClient) calculateTxRate(ctx context.Context, currentHeight int64) (float32, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()

	if c.lastBlockNumber > 0 && c.lastBlockNumber < uint64(currentHeight) {
		blockDiff := currentHeight - int64(c.lastBlockNumber)
		timeDiff := now.Sub(c.lastBlockTime).Seconds()

		if timeDiff > 0 {
			var totalTx int64 = 0
			for i := int64(1); i <= blockDiff && i <= 10; i++ {
				blockNumber := big.NewInt(currentHeight - i)
				block, err := c.client.BlockByNumber(ctx, blockNumber)
				if err != nil {
					continue
				}
				totalTx += int64(len(block.Transactions()))
			}

			txRate := float64(totalTx) / timeDiff
			return float32(txRate), nil
		}
	}

	c.lastBlockNumber = uint64(currentHeight)
	c.lastBlockTime = now

	return 0, nil
}

func parseHexBig(val interface{}) *big.Int {
	if val == nil {
		return big.NewInt(0)
	}

	var hexStr string
	switch v := val.(type) {
	case string:
		hexStr = v
	default:
		return big.NewInt(0)
	}

	n := new(big.Int)
	n.SetString(hexStr, 0)
	return n
}
