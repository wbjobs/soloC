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

var sshCmd = &cobra.Command{
	Use:   "ssh",
	Short: "通过 SSH 从远程服务器采集日志",
	Long:  `通过 SSH 连接到远程服务器并采集日志文件。`,
	RunE:  runSSHCommand,
}

var (
	sshHost       string
	sshPort       int
	sshUser       string
	sshPassword   string
	sshKeyPath    string
	sshFilePath   string
	sshTail       bool
	sshParseJSON  bool
	sshPattern    string
	sshCaseInsensitive bool
	sshLevel      string
	sshExport     string
	sshFormat     string
	sshNoColor    bool
)

func init() {
	rootCmd.AddCommand(sshCmd)

	sshCmd.Flags().StringVarP(&sshHost, "host", "H", "", "远程服务器地址 (必填)")
	sshCmd.Flags().IntVarP(&sshPort, "port", "P", 22, "SSH 端口")
	sshCmd.Flags().StringVarP(&sshUser, "user", "u", "", "用户名 (必填)")
	sshCmd.Flags().StringVarP(&sshPassword, "password", "p", "", "密码")
	sshCmd.Flags().StringVar(&sshKeyPath, "key", "", "私钥文件路径")
	sshCmd.Flags().StringVar(&sshFilePath, "file", "", "远程日志文件路径 (必填)")
	sshCmd.Flags().BoolVarP(&sshTail, "follow", "f", false, "实时跟踪日志文件 (tail 模式)")
	sshCmd.Flags().BoolVar(&sshParseJSON, "json", false, "解析 JSON 格式日志")
	sshCmd.Flags().StringVarP(&sshPattern, "grep", "g", "", "正则表达式过滤")
	sshCmd.Flags().BoolVarP(&sshCaseInsensitive, "ignore-case", "i", false, "忽略大小写")
	sshCmd.Flags().StringVarP(&sshLevel, "level", "l", "", "按日志级别过滤")
	sshCmd.Flags().StringVarP(&sshExport, "export", "o", "", "导出到文件")
	sshCmd.Flags().StringVar(&sshFormat, "format", "json", "导出格式 (json, csv)")
	sshCmd.Flags().BoolVar(&sshNoColor, "no-color", false, "禁用颜色高亮")

	sshCmd.MarkFlagRequired("host")
	sshCmd.MarkFlagRequired("user")
	sshCmd.MarkFlagRequired("file")
}

func runSSHCommand(cmd *cobra.Command, args []string) error {
	if sshHost == "" || sshUser == "" || sshFilePath == "" {
		return fmt.Errorf("必须指定 host, user 和 file 参数")
	}

	if sshPassword == "" && sshKeyPath == "" {
		return fmt.Errorf("必须提供 password 或 key 参数")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		cancel()
	}()

	sshCollector := collector.NewSSHCollector(sshHost, sshPort, sshUser, sshPassword, sshKeyPath, sshFilePath, sshTail)
	logChan, errChan := sshCollector.Collect(ctx)

	logParser := parser.NewLogParser(sshParseJSON)
	parsedChan := logParser.Process(logChan)

	filterConfig := &types.FilterConfig{
		Pattern:         sshPattern,
		CaseInsensitive: sshCaseInsensitive,
		Level:           filter.ParseLogLevel(sshLevel),
	}

	logFilter, err := filter.NewLogFilter(filterConfig)
	if err != nil {
		return fmt.Errorf("创建过滤器失败: %v", err)
	}
	filteredChan := logFilter.Process(parsedChan)

	if sshExport != "" {
		var format types.OutputFormat
		switch sshFormat {
		case "csv":
			format = types.FormatCSV
		default:
			format = types.FormatJSON
		}

		exportConfig := &types.ExportConfig{
			FilePath: sshExport,
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
		highlighter := highlight.NewHighlighter(!sshNoColor)

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
