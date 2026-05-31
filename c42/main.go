package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"log-cleaner/config"
	"log-cleaner/engine"
	"log-cleaner/httpserver"
	"log-cleaner/storage"
	"log-cleaner/tcpserver"
)

func main() {
	if _, err := config.LoadConfig("config.yaml"); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	cfg := config.GetConfig()

	ruleEngine := engine.GetRuleEngine()
	_ = ruleEngine

	redisClient := storage.NewRedisClient(
		cfg.RedisAddr,
		cfg.RedisPassword,
		cfg.RedisDB,
		cfg.RedisKey,
	)
	defer redisClient.Close()

	esClient := storage.NewESClient(
		cfg.Elasticsearch.Addresses,
		cfg.Elasticsearch.Username,
		cfg.Elasticsearch.Password,
		cfg.Elasticsearch.Index,
	)

	tcpServer := tcpserver.NewServer()
	tcpServer.AddProcessor(redisClient)
	tcpServer.AddProcessor(esClient)

	if err := tcpServer.Start(cfg.TCPPort); err != nil {
		log.Fatalf("Failed to start TCP server: %v", err)
	}
	defer tcpServer.Stop()

	httpServer := httpserver.NewServer(cfg.HTTPPort)
	go func() {
		if err := httpServer.Start(); err != nil {
			log.Fatalf("Failed to start HTTP server: %v", err)
		}
	}()

	log.Println("Log Cleaner Service started successfully")

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Log Cleaner Service...")
}
