package service

import (
	"context"
	"sync"
	"time"

	"github.com/sirupsen/logrus"

	pb "blockchain-monitor/api/gen/monitor"
	"blockchain-monitor/config"
	"blockchain-monitor/manager"
	"blockchain-monitor/nodes"
	"blockchain-monitor/storage"
)

type DataCollector struct {
	nodeManager *manager.NodeManager
	storage     *storage.InfluxDBStorage
	alertService *AlertService
	interval    time.Duration
	stopChan    chan struct{}
	running     bool
	mu          sync.Mutex
}

func NewDataCollector(
	nodeManager *manager.NodeManager,
	storage *storage.InfluxDBStorage,
	alertService *AlertService,
	cfg *config.Config,
) *DataCollector {
	return &DataCollector{
		nodeManager:  nodeManager,
		storage:      storage,
		alertService: alertService,
		interval:     time.Duration(cfg.NodeCheckInterval) * time.Second,
		stopChan:     make(chan struct{}),
	}
}

func (c *DataCollector) Start() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.running {
		logrus.Warn("DataCollector already running")
		return
	}

	c.running = true
	go c.collectLoop()

	logrus.WithField("interval", c.interval).Info("Data collector started")
}

func (c *DataCollector) Stop() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.running {
		return
	}

	close(c.stopChan)
	c.running = false
	logrus.Info("Data collector stopped")
}

func (c *DataCollector) collectLoop() {
	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	for {
		select {
		case <-c.stopChan:
			return
		case <-ticker.C:
			c.collectAllNodes()
		}
	}
}

func (c *DataCollector) collectAllNodes() {
	nodeClients := c.nodeManager.ListNodes()

	if len(nodeClients) == 0 {
		return
	}

	var wg sync.WaitGroup
	for _, client := range nodeClients {
		wg.Add(1)
		go func(nc nodes.NodeClient) {
			defer wg.Done()
			c.collectNodeData(nc)
		}(client)
	}

	wg.Wait()
}

func (c *DataCollector) collectNodeData(client nodes.NodeClient) {
	nodeInfo := client.GetNodeInfo()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	logrus.WithField("node_id", nodeInfo.ID).Debug("Collecting node data")

	status, err := client.GetStatus(ctx)
	if err != nil {
		logrus.WithFields(logrus.Fields{
			"node_id": nodeInfo.ID,
			"error":   err,
		}).Warn("Failed to get node status")

		reconnectCtx, reconnectCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer reconnectCancel()

		logrus.WithField("node_id", nodeInfo.ID).Info("Attempting automatic reconnection...")
		if reconnectErr := client.Reconnect(reconnectCtx); reconnectErr != nil {
			logrus.WithFields(logrus.Fields{
				"node_id": nodeInfo.ID,
				"error":   reconnectErr,
			}).Warn("Reconnection attempt failed")
		} else {
			logrus.WithField("node_id", nodeInfo.ID).Info("Reconnection successful")
			status, err = client.GetStatus(ctx)
			if err != nil {
				logrus.WithFields(logrus.Fields{
					"node_id": nodeInfo.ID,
					"error":   err,
				}).Warn("Still failed to get status after reconnection")
			} else {
				c.nodeManager.UpdateNodeStatus(nodeInfo.ID, status)
			}
		}

		if err != nil {
			offlineStatus := &nodes.NodeStatus{
				Status:       pb.NodeStatus_OFFLINE,
				ErrorMessage: err.Error(),
				Timestamp:    time.Now(),
			}
			c.nodeManager.UpdateNodeStatus(nodeInfo.ID, offlineStatus)

			if c.alertService != nil {
				c.alertService.CheckAndAlert(nodeInfo, offlineStatus)
			}
			return
		}
	}

	c.nodeManager.UpdateNodeStatus(nodeInfo.ID, status)

	if c.storage != nil {
		if err := c.storage.WriteNodeStatus(ctx, nodeInfo.ID, *status); err != nil {
			logrus.WithError(err).Warn("Failed to write node status")
		}
	}

	metrics, err := client.GetMetrics(ctx)
	if err != nil {
		logrus.WithFields(logrus.Fields{
			"node_id": nodeInfo.ID,
			"error":   err,
		}).Warn("Failed to get node metrics")
		return
	}

	c.nodeManager.UpdateNodeMetrics(nodeInfo.ID, metrics)

	if c.storage != nil {
		if err := c.storage.WriteMetrics(ctx, metrics); err != nil {
			logrus.WithError(err).Warn("Failed to write metrics")
		}
	}

	if c.alertService != nil {
		c.alertService.CheckAndAlert(nodeInfo, status)
	}

	logrus.WithFields(logrus.Fields{
		"node_id":      nodeInfo.ID,
		"block_height": status.BlockHeight,
		"tx_rate":      metrics.TxRate,
		"status":       status.Status,
	}).Debug("Node data collected")
}
