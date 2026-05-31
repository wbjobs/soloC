package main

import (
	"log"
	"net/http"

	"cardgame/internal/config"
	redis_client "cardgame/internal/redis"
	"cardgame/internal/websocket"
)

func main() {
	cfg := config.LoadConfig()

	redisClient := redis_client.NewClient(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	if err := redisClient.Ping(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisClient.Close()

	wsServer := websocket.NewServer(redisClient)

	http.HandleFunc("/ws", wsServer.HandleWebSocket)

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	log.Printf("WebSocket Service starting on %s...", cfg.WSAddr)
	if err := http.ListenAndServe(cfg.WSAddr, nil); err != nil {
		log.Fatalf("Failed to start WebSocket server: %v", err)
	}
}
