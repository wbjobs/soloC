package manager

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/sirupsen/logrus"

	pb "blockchain-monitor/api/gen/monitor"
	"blockchain-monitor/nodes"
)

type NodeManager struct {
	nodes   map[string]nodes.NodeClient
	status  map[string]*nodes.NodeStatus
	metrics map[string]*nodes.NodeMetrics
	mu      sync.RWMutex
}

func NewNodeManager() *NodeManager {
	return &NodeManager{
		nodes:   make(map[string]nodes.NodeClient),
		status:  make(map[string]*nodes.NodeStatus),
		metrics: make(map[string]*nodes.NodeMetrics),
	}
}

func (m *NodeManager) RegisterNode(nodeType pb.NodeType, name, endpoint, username, password string) (string, error) {
	nodeID := generateNodeID()

	var client nodes.NodeClient
	nodeInfo := &nodes.NodeInfo{
		ID:       nodeID,
		Type:     nodeType,
		Name:     name,
		Endpoint: endpoint,
		Username: username,
		Password: password,
	}

	switch nodeType {
	case pb.NodeType_ETHEREUM:
		client = nodes.NewEthereumClient(nodeInfo)
	case pb.NodeType_BITCOIN:
		client = nodes.NewBitcoinClient(nodeInfo)
	default:
		return "", ErrUnsupportedNodeType
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		return "", err
	}

	m.mu.Lock()
	m.nodes[nodeID] = client
	m.mu.Unlock()

	logrus.WithFields(logrus.Fields{
		"node_id":  nodeID,
		"name":     name,
		"type":     nodeType,
		"endpoint": endpoint,
	}).Info("Node registered successfully")

	return nodeID, nil
}

func (m *NodeManager) UnregisterNode(nodeID string) error {
	m.mu.RLock()
	client, exists := m.nodes[nodeID]
	m.mu.RUnlock()

	if !exists {
		return ErrNodeNotFound
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Disconnect(ctx); err != nil {
		logrus.WithError(err).Warn("Failed to disconnect node properly")
	}

	m.mu.Lock()
	delete(m.nodes, nodeID)
	delete(m.status, nodeID)
	delete(m.metrics, nodeID)
	m.mu.Unlock()

	logrus.WithField("node_id", nodeID).Info("Node unregistered")
	return nil
}

func (m *NodeManager) GetNode(nodeID string) (nodes.NodeClient, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	client, exists := m.nodes[nodeID]
	if !exists {
		return nil, ErrNodeNotFound
	}

	return client, nil
}

func (m *NodeManager) ListNodes() []nodes.NodeClient {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]nodes.NodeClient, 0, len(m.nodes))
	for _, client := range m.nodes {
		result = append(result, client)
	}

	return result
}

func (m *NodeManager) UpdateNodeStatus(nodeID string, status *nodes.NodeStatus) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.status[nodeID] = status
}

func (m *NodeManager) GetNodeStatus(nodeID string) (*nodes.NodeStatus, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	status, exists := m.status[nodeID]
	return status, exists
}

func (m *NodeManager) UpdateNodeMetrics(nodeID string, metrics *nodes.NodeMetrics) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.metrics[nodeID] = metrics
}

func (m *NodeManager) GetNodeMetrics(nodeID string) (*nodes.NodeMetrics, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	metrics, exists := m.metrics[nodeID]
	return metrics, exists
}

func (m *NodeManager) GetAllStatuses() map[string]*nodes.NodeStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]*nodes.NodeStatus)
	for k, v := range m.status {
		result[k] = v
	}

	return result
}

func generateNodeID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

var (
	ErrNodeNotFound         = &NodeManagerError{"node not found"}
	ErrUnsupportedNodeType = &NodeManagerError{"unsupported node type"}
)

type NodeManagerError struct {
	msg string
}

func (e *NodeManagerError) Error() string {
	return e.msg
}
