package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"logalyzer/collector"
	"logalyzer/exporter"
	"logalyzer/filter"
	"logalyzer/highlight"
	"logalyzer/parser"
	"logalyzer/types"

	"github.com/spf13/cobra"
)

var fileCmd = &cobra.Command{
	Use:   "file",
	Short: "从本地文件采集日志",
	Long:  `从本地文件采集日志，支持 tail 模式实时监控。`,
	RunE:  runFileCommand,
}

var (
	filePath     string
	fileTail     bool
	fileParseJSON bool
	filePattern  string
	fileCaseInsensitive bool
	fileLevel    string
	fileExport   string
	fileFormat   string
	fileNoColor  bool
)

func init() {
	rootCmd.AddCommand(fileCmd)

	fileCmd.Flags().StringVarP(&filePath, "path", "p", "", "日志文件路径 (必填)")
	fileCmd.Flags().BoolVarP(&fileTail, "follow", "f", false, "实时跟踪日志文件 (tail 模式)")
	fileCmd.Flags().BoolVar(&fileParseJSON, "json", false, "解析 JSON 格式日志")
	fileCmd.Flags().StringVarP(&filePattern, "grep", "g", "", "正则表达式过滤")
	fileCmd.Flags().BoolVarP(&fileCaseInsensitive, "ignore-case", "i", false, "忽略大小写")
	fileCmd.Flags().StringVarP(&fileLevel, "level", "l", "", "按日志级别过滤 (DEBUG, INFO, WARN, ERROR, FATAL)")
	fileCmd.Flags().StringVarP(&fileExport, "export", "o", "", "导出到文件")
	fileCmd.Flags().StringVar(&fileFormat, "format", "json", "导出格式 (json, csv)")
	fileCmd.Flags().BoolVar(&fileNoColor, "no-color", false, "禁用颜色高亮")

	fileCmd.MarkFlagRequired("path")
}

func runFileCommand(cmd *cobra.Command, args []string) error {
	if filePath == "" {
		return fmt.Errorf("必须指定日志文件路径")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		cancel()
	}()

	fileCollector := collector.NewFileCollector(filePath, fileTail)

	var logChan <-chan types.LogEntry
	var errChan <-chan error

	if fileTail {
		logChan, errChan = fileCollector.Watch(ctx)
	} else {
		logChan, errChan = fileCollector.Collect(ctx)
	}

	logParser := parser.NewLogParser(fileParseJSON)
	parsedChan := logParser.Process(logChan)

	filterConfig := &types.FilterConfig{
		Pattern:         filePattern,
		CaseInsensitive: fileCaseInsensitive,
		Level:           filter.ParseLogLevel(fileLevel),
	}

	logFilter, err := filter.NewLogFilter(filterConfig)
	if err != nil {
		return fmt.Errorf("创建过滤器失败: %v", err)
	}
	filteredChan := logFilter.Process(parsedChan)

	if fileExport != "" {
		var format types.OutputFormat
		switch fileFormat {
		case "csv":
			format = types.FormatCSV
		default:
			format = types.FormatJSON
		}

		exportConfig := &types.ExportConfig{
			FilePath: fileExport,
			Format:   format,
		}

		logExporter, err := exporter.NewExporter(exportConfig)
		if err != nil {
			return fmt.Errorf("创建导出器失败: %v", err)
		}

		exportErrChan := logExporter.Export(filteredChan)

		select {
		case err := <-errChan:
			return err
		case err := <-exportErrChan:
			return err
		case <-ctx.Done():
			return nil
		}
	} else {
		highlighter := highlight.NewHighlighter(!fileNoColor)

		for {
			select {
			case entry, ok := <-filteredChan:
				if !ok {
					return nil
				}
				highlighter.Print(&entry)
			case err := <-errChan:
				return err
			case <-ctx.Done():
				return nil
			}
		}
	}
}
