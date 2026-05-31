package models

import "time"

type AISPoint struct {
	MMSI    string    `json:"mmsi"`
	Lon     float64   `json:"lon"`
	Lat     float64   `json:"lat"`
	Speed   float64   `json:"speed"`
	Time    time.Time `json:"time"`
}

type CompressedPoint struct {
	MMSI        string    `json:"mmsi"`
	Lon         float64   `json:"lon"`
	Lat         float64   `json:"lat"`
	Speed       float64   `json:"speed"`
	Time        time.Time `json:"time"`
	IsCompressed bool     `json:"isCompressed"`
}

type TrajectoryUpdate struct {
	MMSI              string            `json:"mmsi"`
	Points            []CompressedPoint `json:"points"`
	CompressionRate   float64           `json:"compressionRate"`
	AverageDeviation  float64           `json:"averageDeviation"`
	Timestamp         time.Time         `json:"timestamp"`
}

type VesselPosition struct {
	MMSI  string    `json:"mmsi"`
	Lon   float64   `json:"lon"`
	Lat   float64   `json:"lat"`
	Speed float64   `json:"speed"`
	Time  time.Time `json:"time"`
}

type Stats struct {
	TotalOriginalPoints   int64   `json:"totalOriginalPoints"`
	TotalCompressedPoints int64   `json:"totalCompressedPoints"`
	CompressionRate       float64 `json:"compressionRate"`
	AverageDeviation      float64 `json:"averageDeviation"`
	VesselsCount          int64   `json:"vesselsCount"`
	Timestamp             time.Time `json:"timestamp"`
}

type AnomalyType string

const (
	AnomalySuddenStop     AnomalyType = "sudden_stop"
	AnomalySharpTurn      AnomalyType = "sharp_turn"
	AnomalySpeedChange    AnomalyType = "speed_change"
)

type AnomalyEvent struct {
	ID          string       `json:"id"`
	MMSI        string       `json:"mmsi"`
	Type        AnomalyType  `json:"type"`
	TypeLabel   string       `json:"typeLabel"`
	Description string       `json:"description"`
	Lon         float64      `json:"lon"`
	Lat         float64      `json:"lat"`
	Speed       float64      `json:"speed"`
	Value       float64      `json:"value"`
	Threshold   float64      `json:"threshold"`
	Time        time.Time    `json:"time"`
}

type AnomalyAlert struct {
	Type    string        `json:"type"`
	Events  []AnomalyEvent `json:"events"`
}
