package consumer

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/Shopify/sarama"
	"ais-tracker-backend/algorithms"
	"ais-tracker-backend/anomaly"
	"ais-tracker-backend/config"
	"ais-tracker-backend/database"
	"ais-tracker-backend/models"
)

type VesselState struct {
	points        []models.AISPoint
	lastEventTime map[models.AnomalyType]time.Time
	mu            sync.Mutex
}

type AISConsumer struct {
	config       *config.Config
	consumer     sarama.ConsumerGroup
	db           *database.Database
	vesselStates map[string]*VesselState
	mu           sync.Mutex
	broadcast    chan *models.TrajectoryUpdate
	alarmChan    chan []models.AnomalyEvent
	detector     *anomaly.Detector
}

func New(cfg *config.Config, db *database.Database, broadcast chan *models.TrajectoryUpdate, alarmChan chan []models.AnomalyEvent) (*AISConsumer, error) {
	config := sarama.NewConfig()
	config.Consumer.Return.Errors = true
	config.Consumer.Offsets.Initial = sarama.OffsetNewest

	consumer, err := sarama.NewConsumerGroup(cfg.KafkaBrokers, "ais-tracker-group", config)
	if err != nil {
		return nil, err
	}

	return &AISConsumer{
		config:       cfg,
		consumer:     consumer,
		db:           db,
		vesselStates: make(map[string]*VesselState),
		broadcast:    broadcast,
		alarmChan:    alarmChan,
		detector:     anomaly.NewDetector(),
	}, nil
}

func (c *AISConsumer) Start(ctx context.Context) {
	go c.consumeMessages(ctx)
	go c.processPeriodically(ctx)
}

func (c *AISConsumer) consumeMessages(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
			handler := &ConsumerHandler{consumer: c}
			if err := c.consumer.Consume(ctx, []string{c.config.KafkaTopic}, handler); err != nil {
				log.Printf("Error from consumer: %v", err)
				time.Sleep(1 * time.Second)
			}
		}
	}
}

type ConsumerHandler struct {
	consumer *AISConsumer
}

func (h *ConsumerHandler) Setup(_ sarama.ConsumerGroupSession) error {
	return nil
}

func (h *ConsumerHandler) Cleanup(_ sarama.ConsumerGroupSession) error {
	return nil
}

func (h *ConsumerHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for message := range claim.Messages() {
		var point models.AISPoint
		if err := json.Unmarshal(message.Value, &point); err != nil {
			log.Printf("Failed to unmarshal message: %v", err)
			continue
		}

		h.consumer.addPoint(point)

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		h.consumer.db.SaveRawPoint(ctx, &point)
		cancel()

		session.MarkMessage(message, "")
	}
	return nil
}

func (c *AISConsumer) addPoint(point models.AISPoint) {
	c.mu.Lock()
	state, exists := c.vesselStates[point.MMSI]
	if !exists {
		state = &VesselState{
			points:        make([]models.AISPoint, 0, c.config.MaxPointsPerVessel),
			lastEventTime: make(map[models.AnomalyType]time.Time),
		}
		c.vesselStates[point.MMSI] = state
	}
	c.mu.Unlock()

	state.mu.Lock()
	defer state.mu.Unlock()

	state.points = append(state.points, point)
	if len(state.points) > c.config.MaxPointsPerVessel {
		state.points = state.points[len(state.points)-c.config.MaxPointsPerVessel:]
	}
}

func (c *AISConsumer) processPeriodically(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.processAllVessels(ctx)
		}
	}
}

func (c *AISConsumer) processAllVessels(ctx context.Context) {
	c.mu.Lock()
	vessels := make([]string, 0, len(c.vesselStates))
	for mmsi := range c.vesselStates {
		vessels = append(vessels, mmsi)
	}
	c.mu.Unlock()

	var allEvents []models.AnomalyEvent

	for _, mmsi := range vessels {
		events := c.processVessel(ctx, mmsi)
		if len(events) > 0 {
			allEvents = append(allEvents, events...)
		}
	}

	if len(allEvents) > 0 {
		select {
		case c.alarmChan <- allEvents:
		default:
		}

		for _, event := range allEvents {
			log.Printf("ANOMALY [%s] %s: %s", event.MMSI, event.TypeLabel, event.Description)
		}
	}
}

func (c *AISConsumer) processVessel(ctx context.Context, mmsi string) []models.AnomalyEvent {
	c.mu.Lock()
	state, exists := c.vesselStates[mmsi]
	c.mu.Unlock()

	if !exists {
		return nil
	}

	state.mu.Lock()
	if len(state.points) < 10 {
		state.mu.Unlock()
		return nil
	}

	points := make([]models.AISPoint, len(state.points))
	copy(points, state.points)
	lastEventTime := make(map[models.AnomalyType]time.Time)
	for k, v := range state.lastEventTime {
		lastEventTime[k] = v
	}
	state.mu.Unlock()

	events := c.detector.Detect(points, lastEventTime)

	if len(events) > 0 {
		state.mu.Lock()
		for k, v := range lastEventTime {
			state.lastEventTime[k] = v
		}
		state.mu.Unlock()
	}

	originalPoints := make([]algorithms.Point, len(points))
	for i, p := range points {
		originalPoints[i] = algorithms.Point{Lon: p.Lon, Lat: p.Lat}
	}

	epsilon := algorithms.OptimizeEpsilon(originalPoints, c.config.TargetPoints)
	compressedIndices := algorithms.DouglasPeucker(originalPoints, epsilon)

	compressedPoints := make([]models.CompressedPoint, len(compressedIndices))
	for i, idx := range compressedIndices {
		compressedPoints[i] = models.CompressedPoint{
			MMSI:         points[idx].MMSI,
			Lon:          points[idx].Lon,
			Lat:          points[idx].Lat,
			Speed:        points[idx].Speed,
			Time:         points[idx].Time,
			IsCompressed: true,
		}
	}

	avgDeviation := algorithms.CalculateAverageDeviation(originalPoints, compressedIndices)
	compressionRate := float64(len(compressedIndices)) / float64(len(points))

	if err := c.db.SaveCompressedPoints(ctx, compressedPoints); err != nil {
		log.Printf("Failed to save compressed points: %v", err)
	}

	if err := c.db.SaveStats(ctx, mmsi, len(points), len(compressedIndices), compressionRate, avgDeviation); err != nil {
		log.Printf("Failed to save stats: %v", err)
	}

	update := &models.TrajectoryUpdate{
		MMSI:             mmsi,
		Points:           compressedPoints,
		CompressionRate:  compressionRate,
		AverageDeviation: avgDeviation,
		Timestamp:        time.Now(),
	}

	select {
	case c.broadcast <- update:
	default:
	}

	return events
}

func (c *AISConsumer) Close() {
	if c.consumer != nil {
		c.consumer.Close()
	}
}
