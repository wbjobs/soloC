package anomaly

import (
	"fmt"
	"math"
	"time"

	"ais-tracker-backend/models"
)

type Detector struct {
	SpeedDropThreshold   float64
	TurnAngleThreshold   float64
	MinPointsForAnalysis int
	CooldownPeriod       time.Duration
}

func NewDetector() *Detector {
	return &Detector{
		SpeedDropThreshold:   0.7,
		TurnAngleThreshold:   60.0,
		MinPointsForAnalysis: 5,
		CooldownPeriod:       30 * time.Second,
	}
}

func (d *Detector) Detect(points []models.AISPoint, lastEventTime map[models.AnomalyType]time.Time) []models.AnomalyEvent {
	var events []models.AnomalyEvent
	now := time.Now()

	if len(points) < d.MinPointsForAnalysis {
		return events
	}

	if stopEvent := d.detectSuddenStop(points, lastEventTime, now); stopEvent != nil {
		events = append(events, *stopEvent)
	}

	if turnEvent := d.detectSharpTurn(points, lastEventTime, now); turnEvent != nil {
		events = append(events, *turnEvent)
	}

	return events
}

func (d *Detector) detectSuddenStop(points []models.AISPoint, lastEventTime map[models.AnomalyType]time.Time, now time.Time) *models.AnomalyEvent {
	n := len(points)
	if n < 3 {
		return nil
	}

	recentIdx := n - 1
	earlierIdx := n - 5
	if earlierIdx < 0 {
		earlierIdx = 0
	}

	recentPoint := points[recentIdx]
	earlierPoint := points[earlierIdx]

	if earlierPoint.Speed < 2.0 {
		return nil
	}

	speedDrop := 0.0
	if earlierPoint.Speed > 0 {
		speedDrop = (earlierPoint.Speed - recentPoint.Speed) / earlierPoint.Speed
	}

	if recentPoint.Speed < 1.0 && speedDrop > d.SpeedDropThreshold {
		lastTime, exists := lastEventTime[models.AnomalySuddenStop]
		if exists && now.Sub(lastTime) < d.CooldownPeriod {
			return nil
		}

		lastEventTime[models.AnomalySuddenStop] = now

		return &models.AnomalyEvent{
			ID:          generateEventID(),
			MMSI:        recentPoint.MMSI,
			Type:        models.AnomalySuddenStop,
			TypeLabel:   "突然停船",
			Description: "船舶速度从 " + formatSpeed(earlierPoint.Speed) + " 节骤降至 " + formatSpeed(recentPoint.Speed) + " 节",
			Lon:         recentPoint.Lon,
			Lat:         recentPoint.Lat,
			Speed:       recentPoint.Speed,
			Value:       speedDrop * 100,
			Threshold:   d.SpeedDropThreshold * 100,
			Time:        recentPoint.Time,
		}
	}

	return nil
}

func (d *Detector) detectSharpTurn(points []models.AISPoint, lastEventTime map[models.AnomalyType]time.Time, now time.Time) *models.AnomalyEvent {
	n := len(points)
	if n < 5 {
		return nil
	}

	recentIdx := n - 1
	middleIdx := n - 3
	earlierIdx := n - 5

	recentPoint := points[recentIdx]
	middlePoint := points[middleIdx]
	earlierPoint := points[earlierIdx]

	bearing1 := calculateBearing(
		earlierPoint.Lon, earlierPoint.Lat,
		middlePoint.Lon, middlePoint.Lat,
	)

	bearing2 := calculateBearing(
		middlePoint.Lon, middlePoint.Lat,
		recentPoint.Lon, recentPoint.Lat,
	)

	angleChange := calculateAngleDifference(bearing1, bearing2)

	if angleChange > d.TurnAngleThreshold {
		lastTime, exists := lastEventTime[models.AnomalySharpTurn]
		if exists && now.Sub(lastTime) < d.CooldownPeriod {
			return nil
		}

		lastEventTime[models.AnomalySharpTurn] = now

		direction := "右转"
		if bearing2 < bearing1 {
			direction = "左转"
		}

		return &models.AnomalyEvent{
			ID:          generateEventID(),
			MMSI:        recentPoint.MMSI,
			Type:        models.AnomalySharpTurn,
			TypeLabel:   "大角度转向",
			Description: "船舶在短时间内" + direction + formatAngle(angleChange) + "度",
			Lon:         recentPoint.Lon,
			Lat:         recentPoint.Lat,
			Speed:       recentPoint.Speed,
			Value:       angleChange,
			Threshold:   d.TurnAngleThreshold,
			Time:        recentPoint.Time,
		}
	}

	return nil
}

func calculateBearing(lon1, lat1, lon2, lat2 float64) float64 {
	dLon := (lon2 - lon1) * math.Pi / 180.0
	lat1Rad := lat1 * math.Pi / 180.0
	lat2Rad := lat2 * math.Pi / 180.0

	y := math.Sin(dLon) * math.Cos(lat2Rad)
	x := math.Cos(lat1Rad)*math.Sin(lat2Rad) - math.Sin(lat1Rad)*math.Cos(lat2Rad)*math.Cos(dLon)
	bearing := math.Atan2(y, x)
	bearing = bearing * 180.0 / math.Pi
	bearing = math.Mod(bearing+360.0, 360.0)

	return bearing
}

func calculateAngleDifference(bearing1, bearing2 float64) float64 {
	diff := math.Abs(bearing2 - bearing1)
	if diff > 180.0 {
		diff = 360.0 - diff
	}
	return diff
}

func formatSpeed(speed float64) string {
	return fmt.Sprintf("%.1f", speed)
}

func formatAngle(angle float64) string {
	return fmt.Sprintf("%.1f", angle)
}

func generateEventID() string {
	return "evt_" + time.Now().Format("20060102150405") + fmt.Sprintf("_%04d", time.Now().Nanosecond()/1000)
}
