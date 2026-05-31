package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
	"github.com/sirupsen/logrus"
)

type Config struct {
	GRPCPort string
	HTTPPort string

	InfluxDBURL    string
	InfluxDBToken  string
	InfluxDBOrg    string
	InfluxDBBucket string

	EmailEnabled    bool
	EmailSMTPHost   string
	EmailSMTPPort   int
	EmailUsername   string
	EmailPassword   string
	EmailFrom       string
	EmailTo         string

	SlackEnabled   bool
	SlackToken     string
	SlackChannel   string

	AlertCheckInterval int
	NodeCheckInterval  int
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		logrus.Warn("No .env file found, using environment variables")
	}

	emailPort, _ := strconv.Atoi(getEnv("EMAIL_SMTP_PORT", "587"))
	alertInterval, _ := strconv.Atoi(getEnv("ALERT_CHECK_INTERVAL", "30"))
	nodeInterval, _ := strconv.Atoi(getEnv("NODE_CHECK_INTERVAL", "10"))

	return &Config{
		GRPCPort: getEnv("GRPC_PORT", "50051"),
		HTTPPort: getEnv("HTTP_PORT", "8080"),

		InfluxDBURL:    getEnv("INFLUXDB_URL", "http://localhost:8086"),
		InfluxDBToken:  getEnv("INFLUXDB_TOKEN", "secret-token"),
		InfluxDBOrg:    getEnv("INFLUXDB_ORG", "blockchain-monitor"),
		InfluxDBBucket: getEnv("INFLUXDB_BUCKET", "node-metrics"),

		EmailEnabled:    getEnvBool("EMAIL_ENABLED", false),
		EmailSMTPHost:   getEnv("EMAIL_SMTP_HOST", ""),
		EmailSMTPPort:   emailPort,
		EmailUsername:   getEnv("EMAIL_USERNAME", ""),
		EmailPassword:   getEnv("EMAIL_PASSWORD", ""),
		EmailFrom:       getEnv("EMAIL_FROM", ""),
		EmailTo:         getEnv("EMAIL_TO", ""),

		SlackEnabled: getEnvBool("SLACK_ENABLED", false),
		SlackToken:   getEnv("SLACK_TOKEN", ""),
		SlackChannel: getEnv("SLACK_CHANNEL", "#alerts"),

		AlertCheckInterval: alertInterval,
		NodeCheckInterval:  nodeInterval,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		parsed, err := strconv.ParseBool(value)
		if err == nil {
			return parsed
		}
	}
	return defaultValue
}
