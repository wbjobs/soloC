package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"
	"github.com/sirupsen/logrus"

	"blockchain-monitor/config"
	"blockchain-monitor/nodes"
)

type InfluxDBStorage struct {
	client   influxdb2.Client
	writeAPI api.WriteAPIBlocking
	queryAPI api.QueryAPI
	org      string
	bucket   string
}

func NewInfluxDBStorage(cfg *config.Config) *InfluxDBStorage {
	client := influxdb2.NewClient(cfg.InfluxDBURL, cfg.InfluxDBToken)

	return &InfluxDBStorage{
		client:   client,
		writeAPI: client.WriteAPIBlocking(cfg.InfluxDBOrg, cfg.InfluxDBBucket),
		queryAPI: client.QueryAPI(cfg.InfluxDBOrg),
		org:      cfg.InfluxDBOrg,
		bucket:   cfg.InfluxDBBucket,
	}
}

func (s *InfluxDBStorage) WriteMetrics(ctx context.Context, metrics *nodes.NodeMetrics) error {
	point := influxdb2.NewPointWithMeasurement("node_metrics").
		AddTag("node_id", metrics.NodeID).
		AddField("block_height", metrics.BlockHeight).
		AddField("tx_rate", metrics.TxRate).
		AddField("peer_count", metrics.PeerCount).
		AddField("sync_progress", metrics.SyncProgress).
		AddField("latency_ms", metrics.Latency).
		SetTime(metrics.Timestamp)

	if err := s.writeAPI.WritePoint(ctx, point); err != nil {
		logrus.WithError(err).Error("Failed to write metrics to InfluxDB")
		return err
	}

	logrus.WithFields(logrus.Fields{
		"node_id":       metrics.NodeID,
		"block_height":  metrics.BlockHeight,
		"tx_rate":       metrics.TxRate,
	}).Debug("Metrics written to InfluxDB")

	return nil
}

func (s *InfluxDBStorage) WriteNodeStatus(ctx context.Context, nodeID string, status nodes.NodeStatus) error {
	point := influxdb2.NewPointWithMeasurement("node_status").
		AddTag("node_id", nodeID).
		AddTag("status", status.Status.String()).
		AddField("block_height", status.BlockHeight).
		AddField("peer_count", status.PeerCount).
		AddField("sync_progress", status.SyncProgress).
		AddField("latency_ms", status.Latency.Milliseconds()).
		AddField("error_message", status.ErrorMessage).
		SetTime(status.Timestamp)

	if err := s.writeAPI.WritePoint(ctx, point); err != nil {
		logrus.WithError(err).Error("Failed to write node status to InfluxDB")
		return err
	}

	return nil
}

func (s *InfluxDBStorage) Close() {
	s.client.Close()
}

func (s *InfluxDBStorage) GetOrg() string {
	return s.org
}

func (s *InfluxDBStorage) GetBucket() string {
	return s.bucket
}

type HistoricalPoint struct {
	Time        time.Time
	BlockHeight int64
	TxRate      float64
}

func (s *InfluxDBStorage) QueryHistoricalMetrics(
	ctx context.Context,
	nodeID string,
	startTime time.Time,
	endTime time.Time,
) ([]HistoricalPoint, error) {
	fluxQuery := fmt.Sprintf(`
		from(bucket: "%s")
			|> range(start: %d, stop: %d)
			|> filter(fn: (r) => r._measurement == "node_metrics" and r.node_id == "%s")
			|> filter(fn: (r) => r._field == "block_height" or r._field == "tx_rate")
			|> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
			|> yield(name: "metrics")
	`, s.bucket, startTime.Unix(), endTime.Unix(), nodeID)

	result, err := s.queryAPI.Query(ctx, fluxQuery)
	if err != nil {
		logrus.WithError(err).Error("Failed to query historical metrics")
		return nil, err
	}
	defer result.Close()

	var points []HistoricalPoint
	for result.Next() {
		record := result.Record()
		
		point := HistoricalPoint{
			Time: record.Time(),
		}
		
		if blockHeight, ok := record.ValueByKey("block_height").(int64); ok {
			point.BlockHeight = blockHeight
		} else if blockHeight, ok := record.ValueByKey("block_height").(float64); ok {
			point.BlockHeight = int64(blockHeight)
		}
		
		if txRate, ok := record.ValueByKey("tx_rate").(float64); ok {
			point.TxRate = txRate
		}
		
		if point.BlockHeight > 0 {
			points = append(points, point)
		}
	}

	if result.Err() != nil {
		logrus.WithError(result.Err()).Error("Error iterating query results")
		return nil, result.Err()
	}

	logrus.WithFields(logrus.Fields{
		"node_id":  nodeID,
		"points":   len(points),
		"start":    startTime,
		"end":      endTime,
	}).Debug("Historical metrics queried")

	return points, nil
}
