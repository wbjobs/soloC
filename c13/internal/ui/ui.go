package ui

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"syscalltracer/internal/db"
)

type RealtimeStats struct {
	syscallCounts map[string]int64
	syscallTimes  map[string]uint64
	totalEvents   int64
	mu            sync.Mutex
}

func NewRealtimeStats() *RealtimeStats {
	return &RealtimeStats{
		syscallCounts: make(map[string]int64),
		syscallTimes:  make(map[string]uint64),
	}
}

func (s *RealtimeStats) Record(syscallName string, durationNS uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.syscallCounts[syscallName]++
	s.syscallTimes[syscallName] += durationNS
	s.totalEvents++
}

func (s *RealtimeStats) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.syscallCounts = make(map[string]int64)
	s.syscallTimes = make(map[string]uint64)
	s.totalEvents = 0
}

func (s *RealtimeStats) GetStats() map[string]int64 {
	s.mu.Lock()
	defer s.mu.Unlock()

	result := make(map[string]int64)
	for k, v := range s.syscallCounts {
		result[k] = v
	}
	return result
}

func (s *RealtimeStats) GetTotalEvents() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.totalEvents
}

func clearScreen() {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "cls")
	default:
		cmd = exec.Command("clear")
	}
	cmd.Stdout = os.Stdout
	cmd.Run()
}

func formatDuration(ns uint64) string {
	switch {
	case ns >= 1000000000:
		return fmt.Sprintf("%.2f s", float64(ns)/1000000000.0)
	case ns >= 1000000:
		return fmt.Sprintf("%.2f ms", float64(ns)/1000000.0)
	case ns >= 1000:
		return fmt.Sprintf("%.2f us", float64(ns)/1000.0)
	default:
		return fmt.Sprintf("%d ns", ns)
	}
}

type syscallStatEntry struct {
	name  string
	count int64
	total uint64
	avg   uint64
}

func PrintRealtimeStats(stats *RealtimeStats, dbStats []*db.SyscallStats, startTime time.Time) {
	clearScreen()

	elapsed := time.Since(startTime)
	rtCounts := stats.GetStats()
	totalEvents := stats.GetTotalEvents()

	fmt.Println("=" + strings.Repeat("=", 78) + "=")
	fmt.Println("|  eBPF System Call Tracer - Real-time Statistics")
	fmt.Println("=" + strings.Repeat("=", 78) + "=")
	fmt.Printf("|  Running Time: %v  |  Total Events: %d  |  Events/sec: %.2f\n",
		elapsed.Round(time.Second), totalEvents, float64(totalEvents)/elapsed.Seconds())
	fmt.Println("=" + strings.Repeat("=", 78) + "=")
	fmt.Printf("|  %-25s | %-15s | %-15s | %-15s |\n",
		"System Call", "Count", "Total Time", "Avg Time")
	fmt.Println("=" + strings.Repeat("=", 78) + "=")

	var entries []syscallStatEntry

	rtTotal := uint64(0)
	for name, count := range rtCounts {
		stats.mu.Lock()
		totalTime := stats.syscallTimes[name]
		stats.mu.Unlock()
		avgTime := uint64(0)
		if count > 0 {
			avgTime = totalTime / uint64(count)
		}
		entries = append(entries, syscallStatEntry{
			name:  name,
			count: count,
			total: totalTime,
			avg:   avgTime,
		})
		rtTotal += totalTime
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].total > entries[j].total
	})

	for _, e := range entries {
		fmt.Printf("|  %-25s | %-15d | %-15s | %-15s |\n",
			e.name, e.count, formatDuration(e.total), formatDuration(e.avg))
	}

	if len(entries) == 0 {
		fmt.Println("|  (No events recorded yet...)")
	}

	fmt.Println("=" + strings.Repeat("=", 78) + "=")
	fmt.Println("|  Press Ctrl+C to stop tracing")
	fmt.Println("=" + strings.Repeat("=", 78) + "=")
}

func PrintDatabaseStats(stats []*db.SyscallStats) {
	fmt.Println("\n" + strings.Repeat("=", 80))
	fmt.Println("  Database Statistics (All Time)")
	fmt.Println(strings.Repeat("=", 80))
	fmt.Printf("  %-25s %-10s %-18s %-18s\n",
		"System Call", "Count", "Total Time", "Avg Time")
	fmt.Println(strings.Repeat("-", 80))

	totalTime := uint64(0)
	totalCount := int64(0)
	for _, s := range stats {
		totalTime += s.TotalTime
		totalCount += s.Count
		fmt.Printf("  %-25s %-10d %-18s %-18s\n",
			s.SyscallName, s.Count, formatDuration(s.TotalTime), formatDuration(s.AvgTime))
	}

	fmt.Println(strings.Repeat("-", 80))
	fmt.Printf("  %-25s %-10d %-18s\n", "TOTAL", totalCount, formatDuration(totalTime))
	fmt.Println(strings.Repeat("=", 80))
}

func PrintEvents(events []*db.SyscallEvent) {
	fmt.Println("\n" + strings.Repeat("=", 100))
	fmt.Println("  Recent Events")
	fmt.Println(strings.Repeat("=", 100))
	fmt.Printf("  %-8s %-8s %-20s %-18s %-10s %-20s\n",
		"PID", "TID", "Syscall", "Duration", "Ret", "Timestamp")
	fmt.Println(strings.Repeat("-", 100))

	for _, e := range events {
		fmt.Printf("  %-8d %-8d %-20s %-18s %-10d %-20s\n",
			e.PID, e.TID, e.SyscallName, formatDuration(e.DurationNS),
			e.Ret, e.CreatedAt.Format("2006-01-02 15:04:05"))
	}
	fmt.Println(strings.Repeat("=", 100))
}
