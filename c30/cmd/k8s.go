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

var k8sCmd = &cobra.Command{
	Use:   "k8s",
	Short: "从 Kubernetes Pod 采集日志",
	Long:  `从 Kubernetes Pod 采集日志，支持指定命名空间和容器。`,
	RunE:  runK8sCommand,
}

var (
	k8sNamespace   string
	k8sPod         string
	k8sContainer   string
	k8sKubeconfig  string
	k8sTail        bool
	k8sParseJSON   bool
	k8sPattern     string
	k8sCaseInsensitive bool
	k8sLevel       string
	k8sExport      string
	k8sFormat      string
	k8sNoColor     bool
	k8sListPods    bool
)

func init() {
	rootCmd.AddCommand(k8sCmd)

	k8sCmd.Flags().StringVarP(&k8sNamespace, "namespace", "n", "default", "Kubernetes 命名空间")
	k8sCmd.Flags().StringVarP(&k8sPod, "pod", "p", "", "Pod 名称")
	k8sCmd.Flags().StringVarP(&k8sContainer, "container", "c", "", "容器名称")
	k8sCmd.Flags().StringVar(&k8sKubeconfig, "kubeconfig", "", "kubeconfig 文件路径")
	k8sCmd.Flags().BoolVarP(&k8sTail, "follow", "f", false, "实时跟踪日志")
	k8sCmd.Flags().BoolVar(&k8sParseJSON, "json", false, "解析 JSON 格式日志")
	k8sCmd.Flags().StringVarP(&k8sPattern, "grep", "g", "", "正则表达式过滤")
	k8sCmd.Flags().BoolVarP(&k8sCaseInsensitive, "ignore-case", "i", false, "忽略大小写")
	k8sCmd.Flags().StringVarP(&k8sLevel, "level", "l", "", "按日志级别过滤")
	k8sCmd.Flags().StringVarP(&k8sExport, "export", "o", "", "导出到文件")
	k8sCmd.Flags().StringVar(&k8sFormat, "format", "json", "导出格式 (json, csv)")
	k8sCmd.Flags().BoolVar(&k8sNoColor, "no-color", false, "禁用颜色高亮")
	k8sCmd.Flags().BoolVar(&k8sListPods, "list-pods", false, "列出命名空间中的所有 Pod")
}

func runK8sCommand(cmd *cobra.Command, args []string) error {
	if k8sListPods {
		ctx := context.Background()
		k8sCollector := collector.NewK8sCollector(k8sNamespace, "", "", k8sKubeconfig, false)
		pods, err := k8sCollector.ListPods(ctx)
		if err != nil {
			return fmt.Errorf("获取 Pod 列表失败: %v", err)
		}

		fmt.Printf("命名空间 %s 中的 Pod:\n", k8sNamespace)
		for _, pod := range pods {
			fmt.Println("  -", pod)
		}
		return nil
	}

	if k8sPod == "" {
		return fmt.Errorf("必须指定 pod 参数，或使用 --list-pods 查看可用 Pod")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		cancel()
	}()

	k8sCollector := collector.NewK8sCollector(k8sNamespace, k8sPod, k8sContainer, k8sKubeconfig, k8sTail)
	logChan, errChan := k8sCollector.Collect(ctx)

	logParser := parser.NewLogParser(k8sParseJSON)
	parsedChan := logParser.Process(logChan)

	filterConfig := &types.FilterConfig{
		Pattern:         k8sPattern,
		CaseInsensitive: k8sCaseInsensitive,
		Level:           filter.ParseLogLevel(k8sLevel),
	}

	logFilter, err := filter.NewLogFilter(filterConfig)
	if err != nil {
		return fmt.Errorf("创建过滤器失败: %v", err)
	}
	filteredChan := logFilter.Process(parsedChan)

	if k8sExport != "" {
		var format types.OutputFormat
		switch k8sFormat {
		case "csv":
			format = types.FormatCSV
		default:
			format = types.FormatJSON
		}

		exportConfig := &types.ExportConfig{
			FilePath: k8sExport,
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
		highlighter := highlight.NewHighlighter(!k8sNoColor)

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
