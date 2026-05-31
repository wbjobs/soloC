package config

import (
	"os"
	"strconv"
)

type Config struct {
	RedisAddr     string
	RedisPassword string
	RedisDB       int
	PlayerPort    string
	RoomPort      string
	GamePort      string
	GatewayPort   string
	WSAddr        string
}

func LoadConfig() *Config {
	return &Config{
		RedisAddr:     getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		RedisDB:       getEnvInt("REDIS_DB", 0),
		PlayerPort:    getEnv("PLAYER_PORT", ":50051"),
		RoomPort:      getEnv("ROOM_PORT", ":50052"),
		GamePort:      getEnv("GAME_PORT", ":50053"),
		GatewayPort:   getEnv("GATEWAY_PORT", ":8080"),
		WSAddr:        getEnv("WS_ADDR", ":8081"),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
