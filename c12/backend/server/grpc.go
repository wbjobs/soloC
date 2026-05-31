package server

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/sirupsen/logrus"

	pb "blockchain-monitor/api/gen/monitor"
	"blockchain-monitor/manager"
	"blockchain-monitor/nodes"
)

type MonitorServer struct {
	pb.UnimplementedMonitorServiceServer
	nodeManager *manager.NodeManager
	streamClients map[string]chan *pb.MetricsData
	mu            sync.RWMutex
}

func NewMonitorServer(nodeManager *manager.NodeManager) *MonitorServer {
	return &MonitorServer{
		nodeManager:   nodeManager,
		streamClients: make(map[string]chan *pb.MetricsData),
	}
}

func (s *MonitorServer) RegisterNode(
	ctx context.Context,
	req *pb.RegisterNodeRequest,
) (*pb.RegisterNodeResponse, error) {
	logrus.WithFields(logrus.Fields{
		"name":     req.Name,
		"type":     req.Type,
		"endpoint": req.Endpoint,
	}).Info("Registering new node")

	nodeID, err := s.nodeManager.RegisterNode(
		req.Type,
		req.Name,
		req.Endpoint,
		req.Username,
		req.Password,
	)

	if err != nil {
		logrus.WithError(err).Error("Failed to register node")
		return &pb.RegisterNodeResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &pb.RegisterNodeResponse{
		Success: true,
		NodeId:  nodeID,
		Message: "Node registered successfully",
	}, nil
}

func (s *MonitorServer) UnregisterNode(
	ctx context.Context,
	req *pb.UnregisterNodeRequest,
) (*pb.UnregisterNodeResponse, error) {
	logrus.WithField("node_id", req.NodeId).Info("Unregistering node")

	err := s.nodeManager.UnregisterNode(req.NodeId)
	if err != nil {
		logrus.WithError(err).Error("Failed to unregister node")
		return &pb.UnregisterNodeResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &pb.UnregisterNodeResponse{
		Success: true,
		Message: "Node unregistered successfully",
	}, nil
}

func (s *MonitorServer) GetNodeStatus(
	ctx context.Context,
	req *pb.GetNodeStatusRequest,
) (*pb.GetNodeStatusResponse, error) {
	node, err := s.nodeManager.GetNode(req.NodeId)
	if err != nil {
		return nil, err
	}

	nodeInfo := node.GetNodeInfo()
	status, exists := s.nodeManager.GetNodeStatus(req.NodeId)

	pbStatus := pb.NodeStatus_OFFLINE
	blockHeight := int64(0)
	txRate := float32(0)
	lastChecked := int64(0)

	if exists {
		pbStatus = status.Status
		blockHeight = status.BlockHeight
		lastChecked = status.Timestamp.Unix()

		metrics, metricsExists := s.nodeManager.GetNodeMetrics(req.NodeId)
		if metricsExists {
			txRate = metrics.TxRate
		}
	}

	return &pb.GetNodeStatusResponse{
		Node: &pb.NodeInfo{
			Id:         nodeInfo.ID,
			Type:       nodeInfo.Type,
			Name:       nodeInfo.Name,
			Endpoint:   nodeInfo.Endpoint,
			Status:     pbStatus,
			BlockHeight: blockHeight,
			TxRate:     txRate,
			LastChecked: lastChecked,
		},
	}, nil
}

func (s *MonitorServer) ListNodes(
	ctx context.Context,
	req *pb.ListNodesRequest,
) (*pb.ListNodesResponse, error) {
	nodes := s.nodeManager.ListNodes()
	pbNodes := make([]*pb.NodeInfo, 0, len(nodes))

	for _, node := range nodes {
		nodeInfo := node.GetNodeInfo()
		status, exists := s.nodeManager.GetNodeStatus(nodeInfo.ID)

		pbStatus := pb.NodeStatus_OFFLINE
		blockHeight := int64(0)
		txRate := float32(0)
		lastChecked := int64(0)

		if exists {
			pbStatus = status.Status
			blockHeight = status.BlockHeight
			lastChecked = status.Timestamp.Unix()

			metrics, metricsExists := s.nodeManager.GetNodeMetrics(nodeInfo.ID)
			if metricsExists {
				txRate = metrics.TxRate
			}
		}

		pbNodes = append(pbNodes, &pb.NodeInfo{
			Id:         nodeInfo.ID,
			Type:       nodeInfo.Type,
			Name:       nodeInfo.Name,
			Endpoint:   nodeInfo.Endpoint,
			Status:     pbStatus,
			BlockHeight: blockHeight,
			TxRate:     txRate,
			LastChecked: lastChecked,
		})
	}

	return &pb.ListNodesResponse{
		Nodes: pbNodes,
	}, nil
}

func (s *MonitorServer) StreamMetrics(
	req *pb.StreamMetricsRequest,
	stream pb.MonitorService_StreamMetricsServer,
) error {
	ctx := stream.Context()
	clientID := generateClientID()
	metricsChan := make(chan *pb.MetricsData, 100)

	s.mu.Lock()
	s.streamClients[clientID] = metricsChan
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.streamClients, clientID)
		close(metricsChan)
		s.mu.Unlock()
	}()

	go s.pushMetricsToClients(req.NodeIds, metricsChan)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case metrics, ok := <-metricsChan:
			if !ok {
				return nil
			}
			if err := stream.Send(metrics); err != nil {
				return err
			}
		}
	}
}

func (s *MonitorServer) pushMetricsToClients(nodeIDs []string, ch chan<- *pb.MetricsData) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		metricsList := s.getMetricsForNodes(nodeIDs)
		for _, metrics := range metricsList {
			select {
			case ch <- metrics:
			default:
				logrus.Warn("Metrics channel full, dropping metrics")
			}
		}
	}
}

func (s *MonitorServer) getMetricsForNodes(nodeIDs []string) []*pb.MetricsData {
	result := []*pb.MetricsData{}

	if len(nodeIDs) == 0 {
		nodes := s.nodeManager.ListNodes()
		for _, node := range nodes {
			if metrics, exists := s.nodeManager.GetNodeMetrics(node.GetNodeInfo().ID); exists {
				result = append(result, convertMetricsToProto(metrics))
			}
		}
	} else {
		for _, nodeID := range nodeIDs {
			if metrics, exists := s.nodeManager.GetNodeMetrics(nodeID); exists {
				result = append(result, convertMetricsToProto(metrics))
			}
		}
	}

	return result
}

func convertMetricsToProto(metrics *nodes.NodeMetrics) *pb.MetricsData {
	return &pb.MetricsData{
		NodeId:      metrics.NodeID,
		Timestamp:    metrics.Timestamp.Unix(),
		BlockHeight: metrics.BlockHeight,
		TxRate:      metrics.TxRate,
		PeerCount:   metrics.PeerCount,
		SyncProgress: metrics.SyncProgress,
		LatencyMs:   metrics.Latency,
	}
}

func generateClientID() string {
	return fmt.Sprintf("client_%d", time.Now().UnixNano())
}
