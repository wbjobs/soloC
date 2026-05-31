package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"ais-tracker-backend/config"
	"ais-tracker-backend/consumer"
	"ais-tracker-backend/database"
	"ais-tracker-backend/models"
	"ais-tracker-backend/producer"
	"ais-tracker-backend/websocket"
)

func main() {
	godotenv.Load()

	cfg := config.Load()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	db, err := database.New(cfg)
	if err != nil {
		log.Printf("Warning: Failed to connect to database: %v", err)
		log.Println("Continuing without database (in-memory mode)")
	} else {
		defer db.Close(ctx)
	}

	broadcast := make(chan *models.TrajectoryUpdate, 100)
	alarmChan := make(chan []models.AnomalyEvent, 50)

	wsServer := websocket.New(cfg, db, broadcast, alarmChan)
	go wsServer.Start(ctx)

	aisProducer, err := producer.New(cfg)
	if err != nil {
		log.Printf("Warning: Failed to create producer: %v", err)
	} else {
		go aisProducer.Start()
		defer aisProducer.Close()
	}

	aisConsumer, err := consumer.New(cfg, db, broadcast, alarmChan)
	if err != nil {
		log.Printf("Warning: Failed to create consumer: %v", err)
	} else {
		go aisConsumer.Start(ctx)
		defer aisConsumer.Close()
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	log.Println("AIS Tracker Backend started")
	log.Printf("  - WebSocket server: %s", cfg.WebSocketPort)
	log.Printf("  - Kafka brokers: %v", cfg.KafkaBrokers)
	log.Printf("  - Kafka topic: %s", cfg.KafkaTopic)
	log.Printf("  - Producer rate: %d/sec", cfg.ProducerRate)
	log.Printf("  - Max points per vessel: %d", cfg.MaxPointsPerVessel)
	log.Printf("  - Target compressed points: %d", cfg.TargetPoints)

	<-sigChan
	log.Println("Shutting down...")
}
