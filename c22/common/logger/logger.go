package logger

import (
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"time"
)

type LogLevel int

const (
	LevelDebug LogLevel = iota
	LevelInfo
	LevelWarn
	LevelError
	LevelFatal
)

type Logger struct {
	level  LogLevel
	format string
	writer io.Writer
}

var defaultLogger *Logger

func init() {
	defaultLogger = NewLogger(LevelInfo, "json", os.Stdout)
}

func NewLogger(level LogLevel, format string, writer io.Writer) *Logger {
	if writer == nil {
		writer = os.Stdout
	}
	return &Logger{
		level:  level,
		format: format,
		writer: writer,
	}
}

func Init(levelStr string, format string) {
	level := parseLevel(levelStr)
	defaultLogger = NewLogger(level, format, os.Stdout)
}

func parseLevel(levelStr string) LogLevel {
	switch strings.ToLower(levelStr) {
	case "debug":
		return LevelDebug
	case "info":
		return LevelInfo
	case "warn", "warning":
		return LevelWarn
	case "error":
		return LevelError
	case "fatal":
		return LevelFatal
	default:
		return LevelInfo
	}
}

func (l *Logger) log(level LogLevel, msg string, fields ...interface{}) {
	if level < l.level {
		return
	}

	levelStr := levelToString(level)
	timestamp := time.Now().Format(time.RFC3339)
	_, file, line, _ := runtime.Caller(2)
	fileShort := file
	if idx := strings.LastIndex(file, "/"); idx >= 0 {
		fileShort = file[idx+1:]
	}

	var logStr string
	if l.format == "json" {
		fieldsStr := ""
		if len(fields) > 0 {
			for i := 0; i < len(fields); i += 2 {
				if i+1 < len(fields) {
					key := fmt.Sprintf("%v", fields[i])
					value := fmt.Sprintf("%v", fields[i+1])
					fieldsStr += fmt.Sprintf(",\"%s\":\"%s\"", key, value)
				}
			}
		}
		logStr = fmt.Sprintf(
			`{"time":"%s","level":"%s","caller":"%s:%d","msg":"%s"%s}%s`,
			timestamp, levelStr, fileShort, line, msg, fieldsStr, "\n",
		)
	} else {
		fieldsStr := ""
		if len(fields) > 0 {
			fieldsStr = fmt.Sprintf(" %v", fields)
		}
		logStr = fmt.Sprintf(
			"[%s] %s %s:%d %s%s%s",
			levelStr, timestamp, fileShort, line, msg, fieldsStr, "\n",
		)
	}

	l.writer.Write([]byte(logStr))

	if level == LevelFatal {
		os.Exit(1)
	}
}

func levelToString(level LogLevel) string {
	switch level {
	case LevelDebug:
		return "debug"
	case LevelInfo:
		return "info"
	case LevelWarn:
		return "warn"
	case LevelError:
		return "error"
	case LevelFatal:
		return "fatal"
	default:
		return "info"
	}
}

func Debug(msg string, fields ...interface{}) {
	defaultLogger.log(LevelDebug, msg, fields...)
}

func Info(msg string, fields ...interface{}) {
	defaultLogger.log(LevelInfo, msg, fields...)
}

func Warn(msg string, fields ...interface{}) {
	defaultLogger.log(LevelWarn, msg, fields...)
}

func Error(msg string, fields ...interface{}) {
	defaultLogger.log(LevelError, msg, fields...)
}

func Fatal(msg string, fields ...interface{}) {
	defaultLogger.log(LevelFatal, msg, fields...)
}

func (l *Logger) Debug(msg string, fields ...interface{}) {
	l.log(LevelDebug, msg, fields...)
}

func (l *Logger) Info(msg string, fields ...interface{}) {
	l.log(LevelInfo, msg, fields...)
}

func (l *Logger) Warn(msg string, fields ...interface{}) {
	l.log(LevelWarn, msg, fields...)
}

func (l *Logger) Error(msg string, fields ...interface{}) {
	l.log(LevelError, msg, fields...)
}

func (l *Logger) Fatal(msg string, fields ...interface{}) {
	l.log(LevelFatal, msg, fields...)
}
