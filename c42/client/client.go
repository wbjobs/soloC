package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"time"
)

type LogEntry struct {
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	Service   string    `json:"service"`
	Timestamp time.Time `json:"timestamp"`
	TempData  string    `json:"temp_data,omitempty"`
}

func main() {
	conn, err := net.Dial("tcp", "localhost:9000")
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	logs := []LogEntry{
		{
			Level:     "2",
			Message:   "User logged in user_id=abc123",
			Service:   "auth-service",
			Timestamp: time.Now(),
			TempData:  "temporary_data",
		},
		{
			Level:     "4",
			Message:   "Database connection failed user_id=xyz789",
			Service:   "db-service",
			Timestamp: time.Now(),
		},
		{
			Level:     "1",
			Message:   "Processing request user_id=123abc",
			Service:   "api-service",
			Timestamp: time.Now(),
			TempData:  "test_data",
		},
		{
			Level:     "3",
			Message:   "High memory usage detected",
			Service:   "monitoring-service",
			Timestamp: time.Now(),
		},
	}

	for _, logEntry := range logs {
		data, err := json.Marshal(logEntry)
		if err != nil {
			log.Printf("JSON marshal error: %v", err)
			continue
		}

		_, err = conn.Write(append(data, '\n'))
		if err != nil {
			log.Printf("Write error: %v", err)
			continue
		}

		fmt.Printf("Sent: %s\n", string(data))
		time.Sleep(100 * time.Millisecond)
	}

	fmt.Println("All logs sent successfully")
}
