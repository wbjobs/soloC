package main

import (
	"log"

	"cardgame/internal/config"
	"cardgame/internal/gateway"
)

func main() {
	cfg := config.LoadConfig()

	server, err := gateway.NewServer(cfg)
	if err != nil {
		log.Fatalf("Failed to create gateway server: %v", err)
	}

	log.Printf("Gateway server starting on port %s...", cfg.GatewayPort)
	if err := server.Start(cfg.GatewayPort); err != nil {
		log.Fatalf("Failed to start gateway server: %v", err)
	}
}
