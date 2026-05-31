package producer

import (
	"encoding/json"
	"log"
	"math/rand"
	"sync"
	"time"

	"github.com/Shopify/sarama"
	"ais-tracker-backend/config"
	"ais-tracker-backend/models"
)

type VesselState struct {
	lon, lat float64
	speed    float64
	heading  float64
}

type AISProducer struct {
	config     *config.Config
	producer   sarama.SyncProducer
	vessels    map[string]*VesselState
	mu         sync.Mutex
	vesselMMSIs []string
}

func New(cfg *config.Config) (*AISProducer, error) {
	config := sarama.NewConfig()
	config.Producer.Return.Successes = true
	config.Producer.Return.Errors = true

	producer, err := sarama.NewSyncProducer(cfg.KafkaBrokers, config)
	if err != nil {
		return nil, err
	}

	return &AISProducer{
		config:     cfg,
		producer:   producer,
		vessels:    make(map[string]*VesselState),
		vesselMMSIs: generateMMSIs(50),
	}, nil
}

func generateMMSIs(count int) []string {
	mmsis := make([]string, count)
	for i := 0; i < count; i++ {
		mmsis[i] = string([]rune{'4', '1', '2'}) + string([]rune{
			rune('0' + (i / 10000) % 10),
			rune('0' + (i / 1000) % 10),
			rune('0' + (i / 100) % 10),
			rune('0' + (i / 10) % 10),
			rune('0' + i % 10),
		})
	}
	return mmsis
}

func (p *AISProducer) Start() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		p.produceBatch()
	}
}

func (p *AISProducer) produceBatch() {
	for i := 0; i < p.config.ProducerRate; i++ {
		mmsi := p.vesselMMSIs[rand.Intn(len(p.vesselMMSIs))]
		point := p.generatePoint(mmsi)

		data, err := json.Marshal(point)
		if err != nil {
			log.Printf("Failed to marshal AIS point: %v", err)
			continue
		}

		msg := &sarama.ProducerMessage{
			Topic: p.config.KafkaTopic,
			Key:   sarama.StringEncoder(mmsi),
			Value: sarama.StringEncoder(data),
		}

		_, _, err = p.producer.SendMessage(msg)
		if err != nil {
			log.Printf("Failed to send message: %v", err)
		}
	}
	log.Printf("Produced %d messages", p.config.ProducerRate)
}

func (p *AISProducer) generatePoint(mmsi string) models.AISPoint {
	p.mu.Lock()
	defer p.mu.Unlock()

	state, exists := p.vessels[mmsi]
	if !exists {
		state = &VesselState{
			lon:     121.4737 + (rand.Float64()-0.5)*2.0,
			lat:     31.2304 + (rand.Float64()-0.5)*2.0,
			speed:   5 + rand.Float64()*20,
			heading: rand.Float64() * 360,
		}
		p.vessels[mmsi] = state
	}

	state.heading += (rand.Float64() - 0.5) * 5
	if state.heading < 0 {
		state.heading += 360
	}
	if state.heading >= 360 {
		state.heading -= 360
	}

	speedChange := (rand.Float64() - 0.5) * 2
	state.speed += speedChange
	if state.speed < 0 {
		state.speed = 0
	}
	if state.speed > 30 {
		state.speed = 30
	}

	headingRad := state.heading * 3.14159 / 180.0
	distance := state.speed * 0.0002778
	state.lon += distance * (1 / 111.32) * mathCos(headingRad)
	state.lat += distance * (1 / 110.54) * mathSin(headingRad)

	return models.AISPoint{
		MMSI:  mmsi,
		Lon:   state.lon,
		Lat:   state.lat,
		Speed: state.speed,
		Time:  time.Now(),
	}
}

func mathCos(x float64) float64 {
	c := 1.0
	term := 1.0
	for i := 1; i <= 10; i++ {
		term = -term * x * x / float64((2*i-1)*(2*i))
		c += term
	}
	return c
}

func mathSin(x float64) float64 {
	s := x
	term := x
	for i := 1; i <= 10; i++ {
		term = -term * x * x / float64((2*i)*(2*i+1))
		s += term
	}
	return s
}

func (p *AISProducer) Close() {
	if p.producer != nil {
		p.producer.Close()
	}
}
