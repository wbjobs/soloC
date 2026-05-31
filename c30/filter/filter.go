package filter

import (
	"regexp"
	"strings"

	"logalyzer/types"
)

type LogFilter struct {
	config *types.FilterConfig
	regex  *regexp.Regexp
}

func NewLogFilter(config *types.FilterConfig) (*LogFilter, error) {
	f := &LogFilter{
		config: config,
	}

	if config.Pattern != "" {
		pattern := config.Pattern
		if config.CaseInsensitive {
			pattern = "(?i)" + pattern
		}
		re, err := regexp.Compile(pattern)
		if err != nil {
			return nil, err
		}
		f.regex = re
	}

	return f, nil
}

func (f *LogFilter) Match(entry *types.LogEntry) bool {
	if f.config == nil {
		return true
	}

	if f.config.Level != types.LogLevelUnknown {
		if entry.Level < f.config.Level {
			return false
		}
	}

	if f.regex != nil {
		if !f.regex.MatchString(entry.RawMessage) && !f.regex.MatchString(entry.Message) {
			return false
		}
	}

	if !f.config.StartTime.IsZero() {
		if entry.TimeStamp.Before(f.config.StartTime) {
			return false
		}
	}

	if !f.config.EndTime.IsZero() {
		if entry.TimeStamp.After(f.config.EndTime) {
			return false
		}
	}

	return true
}

func (f *LogFilter) Process(entries <-chan types.LogEntry) <-chan types.LogEntry {
	filtered := make(chan types.LogEntry)

	go func() {
		defer close(filtered)
		for entry := range entries {
			if f.Match(&entry) {
				filtered <- entry
			}
		}
	}()

	return filtered
}

func ParseLogLevel(levelStr string) types.LogLevel {
	levelStr = strings.ToUpper(strings.TrimSpace(levelStr))

	switch levelStr {
	case "DEBUG", "DBG":
		return types.LogLevelDebug
	case "INFO", "INF":
		return types.LogLevelInfo
	case "WARN", "WARNING":
		return types.LogLevelWarn
	case "ERROR", "ERR":
		return types.LogLevelError
	case "FATAL", "CRITICAL":
		return types.LogLevelFatal
	default:
		return types.LogLevelUnknown
	}
}

func DetectLogLevel(message string) types.LogLevel {
	upper := strings.ToUpper(message)

	if strings.Contains(upper, "FATAL") || strings.Contains(upper, "CRITICAL") {
		return types.LogLevelFatal
	}
	if strings.Contains(upper, "ERROR") || strings.Contains(upper, "[ERRO]") {
		return types.LogLevelError
	}
	if strings.Contains(upper, "WARN") || strings.Contains(upper, "WARNING") || strings.Contains(upper, "[WARN]") {
		return types.LogLevelWarn
	}
	if strings.Contains(upper, "INFO") || strings.Contains(upper, "[INFO]") {
		return types.LogLevelInfo
	}
	if strings.Contains(upper, "DEBUG") || strings.Contains(upper, "DBG") || strings.Contains(upper, "[DEBG]") {
		return types.LogLevelDebug
	}

	return types.LogLevelUnknown
}
