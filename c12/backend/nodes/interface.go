package nodes

import (
	"context"
	"time"

	pb "blockchain-monitor/api/gen/monitor"
)

type NodeClient interface {
	Connect(ctx context.Context) error
	Disconnect(ctx context.Context) error
	Reconnect(ctx context.Context) error
	IsConnected() bool
	GetStatus(ctx context.Context) (*NodeStatus, error)
	GetMetrics(ctx context.Context) (*NodeMetrics, error)
	GetNodeInfo() *NodeInfo
}

type NodeInfo struct {
	ID       string
	Type     pb.NodeType
	Name     string
	Endpoint string
	Username string
	Password string
}

type NodeStatus struct {
	Status       pb.NodeStatus
	BlockHeight  int64
	PeerCount    int64
	SyncProgress float32
	Latency      time.Duration
	ErrorMessage string
	Timestamp    time.Time
}

type NodeMetrics struct {
	NodeID       string
	BlockHeight  int64
	TxRate       float32
	PeerCount    int64
	SyncProgress float32
	Latency      float32
	Timestamp    time.Time
}
