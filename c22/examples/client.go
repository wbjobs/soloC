package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type CreateTaskRequest struct {
	Name                 string `json:"name"`
	Type                 int32  `json:"type"`
	CronExpression       string `json:"cron_expression,omitempty"`
	DelaySeconds         int64  `json:"delay_seconds,omitempty"`
	Payload              string `json:"payload"`
	MaxRetryCount        int32  `json:"max_retry_count"`
	RetryIntervalSeconds int32  `json:"retry_interval_seconds"`
}

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Total   int         `json:"total,omitempty"`
}

const baseURL = "http://localhost:8080/api/v1"

func main() {
	fmt.Println("=== Distributed Scheduler Demo ===")
	fmt.Println()

	fmt.Println("1. Health Check")
	healthCheck()
	fmt.Println()

	time.Sleep(1 * time.Second)

	fmt.Println("2. Create Immediate Task")
	createImmediateTask()
	fmt.Println()

	time.Sleep(1 * time.Second)

	fmt.Println("3. Create Delayed Task")
	createDelayedTask()
	fmt.Println()

	time.Sleep(1 * time.Second)

	fmt.Println("4. Create Timed (Cron) Task")
	createTimedTask()
	fmt.Println()

	time.Sleep(1 * time.Second)

	fmt.Println("5. List All Tasks")
	listTasks()
	fmt.Println()

	time.Sleep(1 * time.Second)

	fmt.Println("6. List Executors")
	listExecutors()
	fmt.Println()

	fmt.Println("=== Demo Completed ===")
}

func healthCheck() {
	resp, err := http.Get(baseURL + "/health")
	if err != nil {
		fmt.Println("  Error:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println("  Status:", resp.Status)
	fmt.Println("  Response:", string(body))
}

func createImmediateTask() {
	req := CreateTaskRequest{
		Name:                 "Immediate Task Demo",
		Type:                 3,
		Payload:              `{"action": "print", "message": "Hello from immediate task!"}`,
		MaxRetryCount:        3,
		RetryIntervalSeconds: 5,
	}

	sendCreateTask(req)
}

func createDelayedTask() {
	req := CreateTaskRequest{
		Name:                 "Delayed Task Demo",
		Type:                 2,
		DelaySeconds:         10,
		Payload:              `{"action": "print", "message": "Hello from delayed task after 10s!"}`,
		MaxRetryCount:        3,
		RetryIntervalSeconds: 5,
	}

	sendCreateTask(req)
}

func createTimedTask() {
	req := CreateTaskRequest{
		Name:                 "Timed Task Demo",
		Type:                 1,
		CronExpression:       "0 * * * * *",
		Payload:              `{"action": "print", "message": "Hello from cron task!"}`,
		MaxRetryCount:        0,
		RetryIntervalSeconds: 0,
	}

	sendCreateTask(req)
}

func sendCreateTask(req CreateTaskRequest) {
	body, _ := json.Marshal(req)

	resp, err := http.Post(baseURL+"/tasks", "application/json", bytes.NewReader(body))
	if err != nil {
		fmt.Println("  Error:", err)
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	fmt.Println("  Status:", resp.Status)
	fmt.Println("  Response:", string(respBody))
}

func listTasks() {
	resp, err := http.Get(baseURL + "/tasks")
	if err != nil {
		fmt.Println("  Error:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println("  Status:", resp.Status)

	var apiResp APIResponse
	json.Unmarshal(body, &apiResp)
	fmt.Printf("  Total: %d\n", apiResp.Total)
	if apiResp.Data != nil {
		dataJSON, _ := json.MarshalIndent(apiResp.Data, "  ", "  ")
		fmt.Println("  Tasks:", string(dataJSON))
	}
}

func listExecutors() {
	resp, err := http.Get(baseURL + "/executors")
	if err != nil {
		fmt.Println("  Error:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println("  Status:", resp.Status)

	var apiResp APIResponse
	json.Unmarshal(body, &apiResp)
	fmt.Printf("  Total: %d\n", apiResp.Total)
	if apiResp.Data != nil {
		dataJSON, _ := json.MarshalIndent(apiResp.Data, "  ", "  ")
		fmt.Println("  Executors:", string(dataJSON))
	}
}
