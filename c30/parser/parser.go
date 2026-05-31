package parser

import (
	"encoding/json"
	"strings"
	"time"

	"logalyzer/filter"
	"logalyzer/types"
)

type LogParser struct {
	parseJSON bool
}

func NewLogParser(parseJSON bool) *LogParser {
	return &LogParser{
		parseJSON: parseJSON,
	}
}

func (p *LogParser) Parse(entry *types.LogEntry) *types.LogEntry {
	message := strings.TrimSpace(entry.RawMessage)
	entry.Message = message
	entry.Level = filter.DetectLogLevel(message)

	if p.parseJSON {
		p.parseJSONFields(entry)
	}

	return entry
}

func (p *LogParser) parseJSONFields(entry *types.LogEntry) {
	message := strings.TrimSpace(entry.RawMessage)

	if !strings.HasPrefix(message, "{") {
		return
	}

	var fields map[string]interface{}
	if err := json.Unmarshal([]byte(message), &fields); err != nil {
		return
	}

	entry.Fields = flattenMap(fields, "")

	findAndSetTimestamp(entry, fields)
	findAndSetLevel(entry, fields)
	findAndSetMessage(entry, fields)
}

func flattenMap(m map[string]interface{}, prefix string) map[string]interface{} {
	result := make(map[string]interface{})

	for k, v := range m {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}

		switch value := v.(type) {
		case map[string]interface{}:
			nested := flattenMap(value, key)
			for nk, nv := range nested {
				result[nk] = nv
			}
		default:
			result[key] = value
		}
	}

	return result
}

func findValue(data map[string]interface{}, keys ...string) (interface{}, bool) {
	for _, key := range keys {
		if val, ok := searchNested(data, key); ok {
			return val, true
		}
	}
	return nil, false
}

func searchNested(data map[string]interface{}, key string) (interface{}, bool) {
	if val, ok := data[key]; ok {
		return val, true
	}

	for _, v := range data {
		if nested, ok := v.(map[string]interface{}); ok {
			if val, found := searchNested(nested, key); found {
				return val, true
			}
		}
	}

	return nil, false
}

func findAndSetTimestamp(entry *types.LogEntry, data map[string]interface{}) {
	if ts, ok := findValue(data, "timestamp", "time", "@timestamp", "ts"); ok {
		entry.TimeStamp = parseTimestamp(ts)
	}
}

func findAndSetLevel(entry *types.LogEntry, data map[string]interface{}) {
	if level, ok := findValue(data, "level", "log_level", "severity"); ok {
		if levelStr, ok := level.(string); ok {
			entry.Level = filter.ParseLogLevel(levelStr)
		}
	}

	if logObj, ok := data["log"].(map[string]interface{}); ok {
		if level, ok := logObj["level"]; ok {
			if levelStr, ok := level.(string); ok {
				entry.Level = filter.ParseLogLevel(levelStr)
			}
		}
	}
}

func findAndSetMessage(entry *types.LogEntry, data map[string]interface{}) {
	if msg, ok := findValue(data, "message", "msg", "log"); ok {
		switch m := msg.(type) {
		case string:
			entry.Message = m
		case map[string]interface{}:
			if logMsg, ok := m["message"]; ok {
				if logMsgStr, ok := logMsg.(string); ok {
					entry.Message = logMsgStr
				}
			}
		}
	}

	if logObj, ok := data["log"].(map[string]interface{}); ok {
		if msg, ok := logObj["message"]; ok {
			if msgStr, ok := msg.(string); ok {
				entry.Message = msgStr
			}
		}
	}
}

func parseTimestamp(ts interface{}) time.Time {
	switch v := ts.(type) {
	case string:
		layouts := []string{
			time.RFC3339,
			time.RFC3339Nano,
			"2006-01-02 15:04:05",
			"2006-01-02T15:04:05Z",
			"2006-01-02 15:04:05.000",
			"2006/01/02 15:04:05",
			"2006-01-02T15:04:05.000Z0700",
			"2006-01-02T15:04:05.000-07:00",
			"Mon, 02 Jan 2006 15:04:05 MST",
			"02/Jan/2006:15:04:05 -0700",
		}
		for _, layout := range layouts {
			if t, err := time.Parse(layout, v); err == nil {
				return t
			}
		}
	case float64:
		return time.Unix(int64(v), 0)
	case int64:
		return time.Unix(v, 0)
	}
	return time.Now()
}

func (p *LogParser) Process(entries <-chan types.LogEntry) <-chan types.LogEntry {
	parsed := make(chan types.LogEntry)

	go func() {
		defer close(parsed)
		for entry := range entries {
			parsed <- *p.Parse(&entry)
		}
	}()

	return parsed
}
