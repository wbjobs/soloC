package main

import (
	"math"
	"time"
)

type TaskStats struct {
	Total        int64   `json:"total"`
	Pending      int64   `json:"pending"`
	Running      int64   `json:"running"`
	Completed    int64   `json:"completed"`
	Failed       int64   `json:"failed"`
	SuccessRate  float64 `json:"success_rate"`
	AvgDuration  float64 `json:"avg_duration_seconds"`
	MaxDuration  float64 `json:"max_duration_seconds"`
	MinDuration  float64 `json:"min_duration_seconds"`
	TodayTotal   int64   `json:"today_total"`
	TodayFailed  int64   `json:"today_failed"`
}

type NodeStats struct {
	TotalNodes    int     `json:"total_nodes"`
	OnlineNodes   int     `json:"online_nodes"`
	OfflineNodes  int     `json:"offline_nodes"`
	AvgCPU        float64 `json:"avg_cpu"`
	AvgMemory     float64 `json:"avg_memory"`
	TotalTasks    int     `json:"total_tasks"`
	MaxCPU        float64 `json:"max_cpu"`
	MinCPU        float64 `json:"min_cpu"`
	MaxMemory     float64 `json:"max_memory"`
	MinMemory     float64 `json:"min_memory"`
}

type TimeSeriesPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
	Label     string    `json:"label,omitempty"`
}

type DashboardData struct {
	Tasks        TaskStats                 `json:"tasks"`
	Nodes        NodeStats                 `json:"nodes"`
	RecentTasks  []Task                    `json:"recent_tasks"`
	ActiveTasks  []Task                    `json:"active_tasks"`
	TaskTrends   []TimeSeriesPoint         `json:"task_trends"`
	NodeLoads    map[string]float64        `json:"node_loads"`
	TopFailures  []map[string]interface{}  `json:"top_failures"`
}

func GetTaskStats() (TaskStats, error) {
	var stats TaskStats
	var tasks []Task

	DB.Find(&tasks)

	stats.Total = int64(len(tasks))

	var totalDuration, maxDuration, minDuration float64
	minDuration = math.MaxFloat64
	completedCount := 0
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	for _, task := range tasks {
		switch task.Status {
		case "pending":
			stats.Pending++
		case "running":
			stats.Running++
		case "completed":
			stats.Completed++
			if !task.StartedAt.IsZero() && !task.CompletedAt.IsZero() {
				duration := task.CompletedAt.Sub(task.StartedAt).Seconds()
				totalDuration += duration
				if duration > maxDuration {
					maxDuration = duration
				}
				if duration < minDuration {
					minDuration = duration
				}
				completedCount++
			}
		case "failed":
			stats.Failed++
		}

		if task.CreatedAt.After(todayStart) {
			stats.TodayTotal++
			if task.Status == "failed" {
				stats.TodayFailed++
			}
		}
	}

	if stats.Completed > 0 && completedCount > 0 {
		stats.SuccessRate = float64(stats.Completed) / float64(stats.Completed+stats.Failed) * 100
		stats.AvgDuration = totalDuration / float64(completedCount)
		stats.MaxDuration = maxDuration
		if minDuration != math.MaxFloat64 {
			stats.MinDuration = minDuration
		}
	}

	return stats, nil
}

func GetNodeStats() (NodeStats, error) {
	var stats NodeStats
	var nodes []Node

	DB.Find(&nodes)

	stats.TotalNodes = len(nodes)

	var totalCPU, totalMemory float64
	stats.MaxCPU = 0
	stats.MinCPU = 100
	stats.MaxMemory = 0
	stats.MinMemory = 100

	for _, node := range nodes {
		if node.Status == "online" {
			stats.OnlineNodes++
		} else {
			stats.OfflineNodes++
		}

		totalCPU += node.CPU
		totalMemory += node.Memory
		stats.TotalTasks += node.Tasks

		if node.CPU > stats.MaxCPU {
			stats.MaxCPU = node.CPU
		}
		if node.CPU < stats.MinCPU {
			stats.MinCPU = node.CPU
		}
		if node.Memory > stats.MaxMemory {
			stats.MaxMemory = node.Memory
		}
		if node.Memory < stats.MinMemory {
			stats.MinMemory = node.Memory
		}
	}

	if stats.OnlineNodes > 0 {
		stats.AvgCPU = totalCPU / float64(stats.OnlineNodes)
		stats.AvgMemory = totalMemory / float64(stats.OnlineNodes)
	}

	return stats, nil
}

func GetRecentTasks(limit int) ([]Task, error) {
	var tasks []Task
	err := DB.Order("created_at DESC").Limit(limit).Find(&tasks).Error
	return tasks, err
}

func GetActiveTasks() ([]Task, error) {
	var tasks []Task
	err := DB.Where("status = ?", "running").Order("started_at DESC").Find(&tasks).Error
	return tasks, err
}

func GetTaskTrends(hours int) ([]TimeSeriesPoint, error) {
	points := make([]TimeSeriesPoint, hours)
	now := time.Now()

	for i := hours - 1; i >= 0; i-- {
		startTime := now.Add(time.Duration(-i) * time.Hour)
		endTime := startTime.Add(time.Hour)

		var count int64
		DB.Model(&Task{}).Where("created_at >= ? AND created_at < ?", startTime, endTime).Count(&count)

		points[hours-1-i] = TimeSeriesPoint{
			Timestamp: startTime,
			Value:     float64(count),
			Label:     startTime.Format("15:00"),
		}
	}

	return points, nil
}

func GetNodeLoads() map[string]float64 {
	var nodes []Node
	DB.Find(&nodes)

	loads := make(map[string]float64)
	for _, node := range nodes {
		load := node.CPU*0.5 + node.Memory*0.3 + float64(node.Tasks)*10*0.2
		loads[node.ID] = load
	}

	return loads
}

func GetTopFailures(limit int) ([]map[string]interface{}, error) {
	var tasks []Task
	err := DB.Where("status = ?", "failed").Order("completed_at DESC").Limit(limit).Find(&tasks).Error
	if err != nil {
		return nil, err
	}

	result := make([]map[string]interface{}, len(tasks))
	for i, task := range tasks {
		result[i] = map[string]interface{}{
			"id":         task.ID,
			"name":       task.Name,
			"error":      task.Error,
			"failed_at":  task.CompletedAt,
			"retries":    task.RetryCount,
			"node":       task.AssignedNode,
		}
	}

	return result, nil
}

func GetDashboardData() (*DashboardData, error) {
	taskStats, err := GetTaskStats()
	if err != nil {
		return nil, err
	}

	nodeStats, err := GetNodeStats()
	if err != nil {
		return nil, err
	}

	recentTasks, err := GetRecentTasks(10)
	if err != nil {
		return nil, err
	}

	activeTasks, err := GetActiveTasks()
	if err != nil {
		return nil, err
	}

	taskTrends, err := GetTaskTrends(24)
	if err != nil {
		return nil, err
	}

	nodeLoads := GetNodeLoads()

	topFailures, err := GetTopFailures(5)
	if err != nil {
		return nil, err
	}

	return &DashboardData{
		Tasks:       taskStats,
		Nodes:       nodeStats,
		RecentTasks: recentTasks,
		ActiveTasks: activeTasks,
		TaskTrends:  taskTrends,
		NodeLoads:   nodeLoads,
		TopFailures: topFailures,
	}, nil
}

type AlertHistory struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	TaskID    string    `json:"task_id" gorm:"index"`
	TaskName  string    `json:"task_name"`
	AlertType string    `json:"alert_type"`
	Message   string    `json:"message"`
	Emails    string    `json:"emails"`
	SMS       string    `json:"sms"`
	CreatedAt time.Time `json:"created_at"`
}

func (AlertHistory) TableName() string {
	return "alert_history"
}
