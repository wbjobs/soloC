package service

import (
	"context"
	"math"
	"sort"
	"time"

	"github.com/sirupsen/logrus"

	"blockchain-monitor/storage"
)

type PredictionService struct {
	storage *storage.InfluxDBStorage
}

type PredictionPoint struct {
	Time              time.Time `json:"time"`
	BlockHeight       int64     `json:"block_height"`
	BlockGenerationRate float64  `json:"block_generation_rate"`
	TxRate            float64   `json:"tx_rate"`
	Confidence        float64   `json:"confidence"`
}

type PredictionResult struct {
	NodeID            string            `json:"node_id"`
	HistoricalPoints  []HistoricalDataPoint `json:"historical_points"`
	PredictedPoints   []PredictionPoint `json:"predicted_points"`
	PredictionSummary PredictionSummary `json:"summary"`
}

type HistoricalDataPoint struct {
	Time              time.Time `json:"time"`
	BlockHeight       int64     `json:"block_height"`
	BlockGenerationRate float64  `json:"block_generation_rate"`
	TxRate            float64   `json:"tx_rate"`
}

type PredictionSummary struct {
	AverageBlockRate24h   float64 `json:"average_block_rate_24h"`
	PredictedBlocksNext24h int64  `json:"predicted_blocks_next_24h"`
	Confidence            float64 `json:"confidence"`
	Trend                 string  `json:"trend"`
}

type LinearRegressionResult struct {
	Slope     float64
	Intercept float64
	RSquared  float64
}

func NewPredictionService(storage *storage.InfluxDBStorage) *PredictionService {
	return &PredictionService{
		storage: storage,
	}
}

func (s *PredictionService) PredictNext24Hours(
	ctx context.Context,
	nodeID string,
	predictionHours int,
) (*PredictionResult, error) {
	if predictionHours <= 0 {
		predictionHours = 24
	}

	historicalStartTime := time.Now().Add(-time.Duration(predictionHours) * time.Hour)
	endTime := time.Now()

	logrus.WithFields(logrus.Fields{
		"node_id": nodeID,
		"start":   historicalStartTime,
		"end":     endTime,
	}).Info("Predicting block generation rate")

	historicalPoints, err := s.storage.QueryHistoricalMetrics(ctx, nodeID, historicalStartTime, endTime)
	if err != nil {
		logrus.WithError(err).Error("Failed to get historical metrics")
		return nil, err
	}

	if len(historicalPoints) < 5 {
		logrus.WithField("points", len(historicalPoints)).Warn("Not enough historical data for prediction")
		return &PredictionResult{
			NodeID:          nodeID,
			HistoricalPoints: []HistoricalDataPoint{},
			PredictedPoints: []PredictionPoint{},
			PredictionSummary: PredictionSummary{
				Confidence: 0,
				Trend:      "insufficient_data",
			},
		}, nil
	}

	historicalData := s.convertToHistoricalData(historicalPoints)

	blockRateRegression := s.calculateBlockRateRegression(historicalData)
	txRateRegression := s.calculateTxRateRegression(historicalData)

	latestBlockHeight := historicalPoints[len(historicalPoints)-1].BlockHeight
	predictedPoints := s.generatePredictions(
		latestBlockHeight,
		blockRateRegression,
		txRateRegression,
		predictionHours,
	)

	summary := s.generateSummary(
		historicalData,
		blockRateRegression,
		txRateRegression,
		predictionHours,
	)

	return &PredictionResult{
		NodeID:            nodeID,
		HistoricalPoints:  historicalData,
		PredictedPoints:   predictedPoints,
		PredictionSummary: summary,
	}, nil
}

func (s *PredictionService) convertToHistoricalData(
	points []storage.HistoricalPoint,
) []HistoricalDataPoint {
	result := make([]HistoricalDataPoint, 0, len(points))
	
	sort.Slice(points, func(i, j int) bool {
		return points[i].Time.Before(points[j].Time)
	})

	for i := 1; i < len(points); i++ {
		prev := points[i-1]
		curr := points[i]

		timeDiff := curr.Time.Sub(prev.Time).Seconds()
		blockDiff := curr.BlockHeight - prev.BlockHeight

		var blockRate float64
		if timeDiff > 0 && blockDiff > 0 {
			blockRate = float64(blockDiff) / timeDiff * 60
		}

		result = append(result, HistoricalDataPoint{
			Time:                curr.Time,
			BlockHeight:         curr.BlockHeight,
			BlockGenerationRate: blockRate,
			TxRate:              curr.TxRate,
		})
	}

	return result
}

func (s *PredictionService) calculateBlockRateRegression(
	data []HistoricalDataPoint,
) LinearRegressionResult {
	x := make([]float64, len(data))
	y := make([]float64, len(data))

	baseTime := data[0].Time.Unix()
	for i, point := range data {
		x[i] = float64(point.Time.Unix() - baseTime)
		y[i] = point.BlockGenerationRate
	}

	return linearRegression(x, y)
}

func (s *PredictionService) calculateTxRateRegression(
	data []HistoricalDataPoint,
) LinearRegressionResult {
	x := make([]float64, len(data))
	y := make([]float64, len(data))

	baseTime := data[0].Time.Unix()
	for i, point := range data {
		x[i] = float64(point.Time.Unix() - baseTime)
		y[i] = point.TxRate
	}

	return linearRegression(x, y)
}

func (s *PredictionService) generatePredictions(
	currentBlockHeight int64,
	blockRateRegression LinearRegressionResult,
	txRateRegression LinearRegressionResult,
	predictionHours int,
) []PredictionPoint {
	result := []PredictionPoint{}
	now := time.Now()

	interval := 30 * time.Minute
	intervals := predictionHours * 2

	currentBlockHeightFloat := float64(currentBlockHeight)
	baseTime := now.Unix()

	for i := 1; i <= intervals; i++ {
		predictionTime := now.Add(time.Duration(i) * interval)
		hoursFromNow := float64(i) * 0.5

		x := float64(predictionTime.Unix() - baseTime)

		predictedBlockRate := blockRateRegression.Intercept + blockRateRegression.Slope*x
		if predictedBlockRate < 0 {
			predictedBlockRate = 0
		}

		predictedTxRate := txRateRegression.Intercept + txRateRegression.Slope*x
		if predictedTxRate < 0 {
			predictedTxRate = 0
		}

		blocksGenerated := predictedBlockRate * hoursFromNow * 60
		predictedBlockHeight := currentBlockHeightFloat + blocksGenerated

		confidence := calculateConfidence(blockRateRegression.RSquared, float64(i)/float64(intervals))

		result = append(result, PredictionPoint{
			Time:                predictionTime,
			BlockHeight:         int64(predictedBlockHeight),
			BlockGenerationRate: predictedBlockRate,
			TxRate:              predictedTxRate,
			Confidence:          confidence,
		})
	}

	return result
}

func (s *PredictionService) generateSummary(
	historicalData []HistoricalDataPoint,
	blockRateRegression LinearRegressionResult,
	txRateRegression LinearRegressionResult,
	predictionHours int,
) PredictionSummary {
	var totalBlockRate float64
	var validBlockRateCount int

	for _, point := range historicalData {
		if point.BlockGenerationRate > 0 {
			totalBlockRate += point.BlockGenerationRate
			validBlockRateCount++
		}
	}

	avgBlockRate := 0.0
	if validBlockRateCount > 0 {
		avgBlockRate = totalBlockRate / float64(validBlockRateCount)
	}

	confidence := 0.0
	if len(historicalData) >= 10 {
		confidence = blockRateRegression.RSquared
		if confidence < 0 {
			confidence = 0
		}
		if confidence > 1 {
			confidence = 1
		}
	}

	trend := "stable"
	if blockRateRegression.Slope > 0.01 {
		trend = "increasing"
	} else if blockRateRegression.Slope < -0.01 {
		trend = "decreasing"
	}

	predictedBlocks := int64(avgBlockRate * float64(predictionHours) * 60)

	return PredictionSummary{
		AverageBlockRate24h:    avgBlockRate,
		PredictedBlocksNext24h: predictedBlocks,
		Confidence:             confidence,
		Trend:                  trend,
	}
}

func linearRegression(x, y []float64) LinearRegressionResult {
	n := float64(len(x))

	if n == 0 {
		return LinearRegressionResult{Slope: 0, Intercept: 0, RSquared: 0}
	}

	var sumX, sumY, sumXY, sumX2, sumY2 float64

	for i := 0; i < len(x); i++ {
		sumX += x[i]
		sumY += y[i]
		sumXY += x[i] * y[i]
		sumX2 += x[i] * x[i]
		sumY2 += y[i] * y[i]
	}

	denominator := n*sumX2 - sumX*sumX
	if denominator == 0 {
		return LinearRegressionResult{Slope: 0, Intercept: sumY / n, RSquared: 0}
	}

	slope := (n*sumXY - sumX*sumY) / denominator
	intercept := (sumY - slope*sumX) / n

	var yMean float64
	if n > 0 {
		yMean = sumY / n
	}

	var ssTotal, ssResidual float64
	for i := 0; i < len(x); i++ {
		predicted := slope*x[i] + intercept
		ssTotal += (y[i] - yMean) * (y[i] - yMean)
		ssResidual += (y[i] - predicted) * (y[i] - predicted)
	}

	rSquared := 0.0
	if ssTotal > 0 {
		rSquared = 1 - (ssResidual / ssTotal)
	}

	return LinearRegressionResult{
		Slope:     slope,
		Intercept: intercept,
		RSquared:  rSquared,
	}
}

func calculateConfidence(rSquared, predictionProgress float64) float64 {
	baseConfidence := math.Max(0, rSquared)
	
	timeDecay := 1 - (predictionProgress * 0.5)
	if timeDecay < 0 {
		timeDecay = 0
	}

	confidence := baseConfidence * timeDecay
	
	if confidence > 1 {
		confidence = 1
	}
	if confidence < 0 {
		confidence = 0
	}

	return confidence
}
