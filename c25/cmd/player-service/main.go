package main

import (
	"log"
	"net"

	"cardgame/internal/config"
	"cardgame/internal/player"
	redis_client "cardgame/internal/redis"
	pb "cardgame/proto/player"

	"google.golang.org/grpc"
)

func main() {
	cfg := config.LoadConfig()

	redisClient := redis_client.NewClient(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	if err := redisClient.Ping(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisClient.Close()

	lis, err := net.Listen("tcp", cfg.PlayerPort)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	s := grpc.NewServer()
	pb.RegisterPlayerServiceServer(s, player.NewService(redisClient))

	log.Printf("Player Service starting on port %s...", cfg.PlayerPort)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
