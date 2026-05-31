package main

import (
	"log"
	"net"

	"cardgame/internal/config"
	"cardgame/internal/game"
	redis_client "cardgame/internal/redis"
	pb "cardgame/proto/game"

	"google.golang.org/grpc"
)

func main() {
	cfg := config.LoadConfig()

	redisClient := redis_client.NewClient(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	if err := redisClient.Ping(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisClient.Close()

	lis, err := net.Listen("tcp", cfg.GamePort)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	s := grpc.NewServer()
	pb.RegisterGameServiceServer(s, game.NewService(redisClient))

	log.Printf("Game Service starting on port %s...", cfg.GamePort)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
