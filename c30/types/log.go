package types

import (
	"time"
)

type LogLevel int

const (
	LogLevelUnknown LogLevel = iota
	LogLevelDebug
	LogLevelInfo
	LogLevelWarn
	LogLevelError
	LogLevelFatal
)

func (l LogLevel) String() string {
	switch l {
	case LogLevelDebug:
		return "DEBUG"
	case LogLevelInfo:
		return "INFO"
	case LogLevelWarn:
		return "WARN"
	case LogLevelError:
		return "ERROR"
	case LogLevelFatal:
		return "FATAL"
	default:
		return "UNKNOWN"
	}
}

type LogEntry struct {
	TimeStamp   time.Time
	Level       LogLevel
	Message     string
	Source      string
	RawMessage  string
	Fields      map[string]interface{}
}

type CollectorType int

const (
	CollectorTypeFile CollectorType = iota
	CollectorTypeSSH
	CollectorTypeK8s
)

type CollectorConfig struct {
	Type     CollectorType
	Path     string
	Host     string
	Port     int
	User     string
	Password string
	KeyPath  string
	Namespace string
	PodName   string
	Container string
}

type FilterConfig struct {
	Pattern     string
	CaseInsensitive bool
	Level       LogLevel
	StartTime   time.Time
	EndTime     time.Time
}

type OutputFormat string

const (
	FormatJSON OutputFormat = "json"
	FormatCSV  OutputFormat = "csv"
)

type ExportConfig struct {
	FilePath   string
	Format     OutputFormat
	IncludeFields []string
}

type LevelStats struct {
	Level LogLevel
	Count int64
}

type KeywordStats struct {
	Keyword string
	Count   int64
}

type SourceStats struct {
	Source string
	Count  int64
}

type StatsReport struct {
	StartTime     time.Time
	EndTime       time.Time
	TotalLogs     int64
	Levels        []LevelStats
	Keywords      []KeywordStats
	Sources       []SourceStats
	ErrorsPerHour []HourlyStats
}

type HourlyStats struct {
	Hour  int
	Count int64
}

type KeywordConfig struct {
	Pattern string
	Label   string
}

type StatsConfig struct {
	Keywords       []KeywordConfig
	IncludeSources bool
	IncludeHourly  bool
}

