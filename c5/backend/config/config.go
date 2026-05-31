package config

import (
	"os"
	"strconv"
)

type Config struct {
	KafkaBrokers    []string
	KafkaTopic      string
	DBHost          string
	DBPort          int
	DBUser          string
	DBPassword      string
	DBName          string
	WebSocketPort   string
	ProducerRate    int
	MaxPointsPerVessel int
	TargetPoints    int
	Epsilon         float64
}

func Load() *Config {
	dbPort, _ := strconv.Atoi(getEnv("DB_PORT", "5432"))
	producerRate, _ := strconv.Atoi(getEnv("PRODUCER_RATE", "1000"))
	maxPoints, _ := strconv.Atoi(getEnv("MAX_POINTS_PER_VESSEL", "500"))
	targetPoints, _ := strconv.Atoi(getEnv("TARGET_POINTS", "50"))
	epsilon, _ := strconv.ParseFloat(getEnv("EPSILON", "0.0001"), 64)

	return &Config{
		KafkaBrokers:    splitEnv(getEnv("KAFKA_BROKERS", "localhost:9092"), ","),
		KafkaTopic:      getEnv("KAFKA_TOPIC", "ais-data"),
		DBHost:          getEnv("DB_HOST", "localhost"),
		DBPort:          dbPort,
		DBUser:          getEnv("DB_USER", "postgres"),
		DBPassword:      getEnv("DB_PASSWORD", "postgres"),
		DBName:          getEnv("DB_NAME", "ais_db"),
		WebSocketPort:   getEnv("WS_PORT", ":8080"),
		ProducerRate:    producerRate,
		MaxPointsPerVessel: maxPoints,
		TargetPoints:    targetPoints,
		Epsilon:         epsilon,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func splitEnv(value string, separator string) []string {
	var result []string
	current := ""
	for _, char := range value {
		if string(char) == separator {
			result = append(result, current)
			current = ""
		} else {
			current += string(char)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}
