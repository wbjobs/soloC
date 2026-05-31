package stats

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"logalyzer/types"
)

type LogAggregator struct {
	config       *types.StatsConfig
	keywords     []*keywordMatcher
	levelCounts  map[types.LogLevel]int64
	sourceCounts map[string]int64
	keywordCount map[string]int64
	hourlyCounts map[int]int64
	totalCount   int64
	startTime    time.Time
	mutex        sync.RWMutex
}

type keywordMatcher struct {
	pattern *regexp.Regexp
	label   string
}

func NewLogAggregator(config *types.StatsConfig) (*LogAggregator, error) {
	agg := &LogAggregator{
		config:       config,
		levelCounts:  make(map[types.LogLevel]int64),
		sourceCounts: make(map[string]int64),
		keywordCount: make(map[string]int64),
		hourlyCounts: make(map[int]int64),
		startTime:    time.Now(),
	}

	if config != nil {
		for _, kw := range config.Keywords {
			pattern := kw.Pattern
			if !strings.HasPrefix(pattern, "(?i)") {
				pattern = "(?i)" + pattern
			}
			re, err := regexp.Compile(pattern)
			if err != nil {
				return nil, fmt.Errorf("无效的关键词正则表达式 '%s': %v", kw.Pattern, err)
			}

			label := kw.Label
			if label == "" {
				label = kw.Pattern
			}

			agg.keywords = append(agg.keywords, &keywordMatcher{
				pattern: re,
				label:   label,
			})
		}
	}

	return agg, nil
}

func (a *LogAggregator) Add(entry *types.LogEntry) {
	a.mutex.Lock()
	defer a.mutex.Unlock()

	a.totalCount++
	a.levelCounts[entry.Level]++

	if a.config != nil && a.config.IncludeSources {
		a.sourceCounts[entry.Source]++
	}

	if a.config != nil && a.config.IncludeHourly {
		if entry.Level >= types.LogLevelError {
			hour := entry.TimeStamp.Hour()
			a.hourlyCounts[hour]++
		}
	}

	for _, kw := range a.keywords {
		if kw.pattern.MatchString(entry.RawMessage) || kw.pattern.MatchString(entry.Message) {
			a.keywordCount[kw.label]++
		}
	}
}

func (a *LogAggregator) Process(entries <-chan types.LogEntry) <-chan struct{} {
	done := make(chan struct{})

	go func() {
		defer close(done)
		for entry := range entries {
			a.Add(&entry)
		}
	}()

	return done
}

func (a *LogAggregator) GetReport() *types.StatsReport {
	a.mutex.RLock()
	defer a.mutex.RUnlock()

	report := &types.StatsReport{
		StartTime: a.startTime,
		EndTime:   time.Now(),
		TotalLogs: a.totalCount,
	}

	for level, count := range a.levelCounts {
		if count > 0 {
			report.Levels = append(report.Levels, types.LevelStats{
				Level: level,
				Count: count,
			})
		}
	}

	sortLevelStats(report.Levels)

	for label, count := range a.keywordCount {
		if count > 0 {
			report.Keywords = append(report.Keywords, types.KeywordStats{
				Keyword: label,
				Count:   count,
			})
		}
	}

	sortKeywordStats(report.Keywords)

	for source, count := range a.sourceCounts {
		report.Sources = append(report.Sources, types.SourceStats{
			Source: source,
			Count:  count,
		})
	}

	sortSourceStats(report.Sources)

	for hour := 0; hour < 24; hour++ {
		if count, ok := a.hourlyCounts[hour]; ok {
			report.ErrorsPerHour = append(report.ErrorsPerHour, types.HourlyStats{
				Hour:  hour,
				Count: count,
			})
		}
	}

	return report
}

func sortLevelStats(stats []types.LevelStats) {
	for i := 0; i < len(stats); i++ {
		for j := i + 1; j < len(stats); j++ {
			if stats[j].Level > stats[i].Level {
				stats[i], stats[j] = stats[j], stats[i]
			}
		}
	}
}

func sortKeywordStats(stats []types.KeywordStats) {
	for i := 0; i < len(stats); i++ {
		for j := i + 1; j < len(stats); j++ {
			if stats[j].Count > stats[i].Count {
				stats[i], stats[j] = stats[j], stats[i]
			}
		}
	}
}

func sortSourceStats(stats []types.SourceStats) {
	for i := 0; i < len(stats); i++ {
		for j := i + 1; j < len(stats); j++ {
			if stats[j].Count > stats[i].Count {
				stats[i], stats[j] = stats[j], stats[i]
			}
		}
	}
}

func (a *LogAggregator) FormatTextReport(report *types.StatsReport) string {
	var builder strings.Builder

	builder.WriteString("========================================\n")
	builder.WriteString("         日志聚合统计报表\n")
	builder.WriteString("========================================\n\n")

	builder.WriteString(fmt.Sprintf("统计时间段: %s - %s\n",
		report.StartTime.Format("2006-01-02 15:04:05"),
		report.EndTime.Format("2006-01-02 15:04:05")))
	duration := report.EndTime.Sub(report.StartTime)
	builder.WriteString(fmt.Sprintf("统计时长: %s\n\n", duration))

	builder.WriteString(fmt.Sprintf("总计日志数: %d\n\n", report.TotalLogs))

	builder.WriteString("--- 按级别统计 ---\n")
	if len(report.Levels) == 0 {
		builder.WriteString("  无数据\n")
	} else {
		for _, stat := range report.Levels {
			percentage := 0.0
			if report.TotalLogs > 0 {
				percentage = float64(stat.Count) / float64(report.TotalLogs) * 100
			}
			builder.WriteString(fmt.Sprintf("  %-7s: %d (%.1f%%)\n",
				stat.Level.String(), stat.Count, percentage))
		}
	}
	builder.WriteString("\n")

	if len(report.Keywords) > 0 {
		builder.WriteString("--- 关键词统计 ---\n")
		for _, stat := range report.Keywords {
			builder.WriteString(fmt.Sprintf("  %-30s: %d\n", stat.Keyword, stat.Count))
		}
		builder.WriteString("\n")
	}

	if len(report.Sources) > 0 {
		builder.WriteString("--- 按来源统计 ---\n")
		for _, stat := range report.Sources {
			builder.WriteString(fmt.Sprintf("  %s: %d\n", stat.Source, stat.Count))
		}
		builder.WriteString("\n")
	}

	if len(report.ErrorsPerHour) > 0 {
		builder.WriteString("--- 每小时错误数 ---\n")
		for _, stat := range report.ErrorsPerHour {
			bar := strings.Repeat("█", int(stat.Count))
			builder.WriteString(fmt.Sprintf("  %02d:00: %d %s\n", stat.Hour, stat.Count, bar))
		}
		builder.WriteString("\n")
	}

	builder.WriteString("========================================\n")

	return builder.String()
}

func (a *LogAggregator) FormatJSONReport(report *types.StatsReport) (string, error) {
	type jsonLevelStat struct {
		Level string `json:"level"`
		Count int64  `json:"count"`
	}

	type jsonReport struct {
		StartTime     string           `json:"start_time"`
		EndTime       string           `json:"end_time"`
		TotalLogs     int64            `json:"total_logs"`
		Levels        []jsonLevelStat  `json:"levels"`
		Keywords      []types.KeywordStats `json:"keywords,omitempty"`
		Sources       []types.SourceStats  `json:"sources,omitempty"`
		ErrorsPerHour []types.HourlyStats  `json:"errors_per_hour,omitempty"`
	}

	jsonLevels := make([]jsonLevelStat, 0, len(report.Levels))
	for _, stat := range report.Levels {
		jsonLevels = append(jsonLevels, jsonLevelStat{
			Level: stat.Level.String(),
			Count: stat.Count,
		})
	}

	r := jsonReport{
		StartTime:     report.StartTime.Format(time.RFC3339),
		EndTime:       report.EndTime.Format(time.RFC3339),
		TotalLogs:     report.TotalLogs,
		Levels:        jsonLevels,
		Keywords:      report.Keywords,
		Sources:       report.Sources,
		ErrorsPerHour: report.ErrorsPerHour,
	}

	data, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return "", err
	}

	return string(data), nil
}
