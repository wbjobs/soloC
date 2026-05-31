package config

import (
	"os"
)

type Config struct {
	ServerPort string
	MySQLDSN   string
	RedisAddr  string
	RedisPass  string
	JWTSecret  string
}

func LoadConfig() *Config {
	return &Config{
		ServerPort: getEnv("SERVER_PORT", "8080"),
		MySQLDSN:   getEnv("MYSQL_DSN", "root:password@tcp(127.0.0.1:3306)/clipboard_sync?charset=utf8mb4&parseTime=True&loc=Local"),
		RedisAddr:  getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPass:  getEnv("REDIS_PASS", ""),
		JWTSecret:  getEnv("JWT_SECRET", "your-secret-key-here-change-in-production"),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}
