package exporter

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"logalyzer/types"
)

type Exporter struct {
	config *types.ExportConfig
	file   *os.File
	writer io.Writer
}

func NewExporter(config *types.ExportConfig) (*Exporter, error) {
	e := &Exporter{
		config: config,
	}

	if config.FilePath != "" {
		file, err := os.Create(config.FilePath)
		if err != nil {
			return nil, fmt.Errorf("无法创建输出文件: %v", err)
		}
		e.file = file
		e.writer = file
	} else {
		e.writer = os.Stdout
	}

	return e, nil
}

func (e *Exporter) Close() {
	if e.file != nil {
		e.file.Close()
	}
}

func (e *Exporter) Export(entries <-chan types.LogEntry) <-chan error {
	errChan := make(chan error, 1)

	go func() {
		defer close(errChan)
		defer e.Close()

		switch e.config.Format {
		case types.FormatJSON:
			errChan <- e.exportJSON(entries)
		case types.FormatCSV:
			errChan <- e.exportCSV(entries)
		default:
			errChan <- e.exportText(entries)
		}
	}()

	return errChan
}

func (e *Exporter) exportText(entries <-chan types.LogEntry) error {
	for entry := range entries {
		line := e.formatText(&entry)
		if _, err := fmt.Fprintln(e.writer, line); err != nil {
			return fmt.Errorf("写入文本失败: %v", err)
		}
	}
	return nil
}

func (e *Exporter) formatText(entry *types.LogEntry) string {
	parts := []string{
		"[" + entry.TimeStamp.Format("2006-01-02 15:04:05") + "]",
		"[" + entry.Level.String() + "]",
		"[" + entry.Source + "]",
		entry.Message,
	}
	return strings.Join(parts, " ")
}

func (e *Exporter) exportJSON(entries <-chan types.LogEntry) error {
	encoder := json.NewEncoder(e.writer)
	encoder.SetIndent("", "  ")

	first := true
	if _, err := fmt.Fprint(e.writer, "["); err != nil {
		return err
	}

	for entry := range entries {
		if !first {
			if _, err := fmt.Fprint(e.writer, ",\n"); err != nil {
				return err
			}
		}
		first = false

		obj := e.entryToMap(&entry)
		if err := encoder.Encode(obj); err != nil {
			return fmt.Errorf("编码 JSON 失败: %v", err)
		}
	}

	if _, err := fmt.Fprintln(e.writer, "]"); err != nil {
		return err
	}

	return nil
}

func (e *Exporter) exportCSV(entries <-chan types.LogEntry) error {
	writer := csv.NewWriter(e.writer)
	defer writer.Flush()

	headers := []string{"timestamp", "level", "source", "message"}
	if err := writer.Write(headers); err != nil {
		return fmt.Errorf("写入 CSV 表头失败: %v", err)
	}

	for entry := range entries {
		row := []string{
			entry.TimeStamp.Format("2006-01-02 15:04:05"),
			entry.Level.String(),
			entry.Source,
			entry.Message,
		}
		if err := writer.Write(row); err != nil {
			return fmt.Errorf("写入 CSV 行失败: %v", err)
		}
	}

	return nil
}

func (e *Exporter) entryToMap(entry *types.LogEntry) map[string]interface{} {
	result := map[string]interface{}{
		"timestamp": entry.TimeStamp.Format(time.RFC3339),
		"level":     entry.Level.String(),
		"source":    entry.Source,
		"message":   entry.Message,
	}

	if len(entry.Fields) > 0 {
		for k, v := range entry.Fields {
			if k != "timestamp" && k != "level" && k != "message" {
				result[k] = v
			}
		}
	}

	return result
}
