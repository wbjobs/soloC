package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"logalyzer/collector"
	"logalyzer/config"
	"logalyzer/exporter"
	"logalyzer/filter"
	"logalyzer/highlight"
	"logalyzer/parser"
	"logalyzer/types"

	"github.com/spf13/cobra"
)

var runCmd = &cobra.Command{
	Use:   "run",
	Short: "使用配置文件执行日志采集和分析",
	Long:  `使用 YAML 配置文件定义数据源、过滤规则和输出选项，执行日志采集和分析。`,
	RunE:  runConfigCommand,
}

var (
	runConfigPath string
	runGenExample bool
)

func init() {
	rootCmd.AddCommand(runCmd)

	runCmd.Flags().StringVarP(&runConfigPath, "config", "c", "", "配置文件路径")
	runCmd.Flags().BoolVar(&runGenExample, "gen-example", false, "生成示例配置文件")
}

func runConfigCommand(cmd *cobra.Command, args []string) error {
	if runGenExample {
		fmt.Print(config.GenerateExampleConfig())
		return nil
	}

	if runConfigPath == "" {
		return fmt.Errorf("必须指定配置文件路径 (--config)")
	}

	cfg, err := config.LoadConfig(runConfigPath)
	if err != nil {
		return fmt.Errorf("加载配置文件失败: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		cancel()
	}()

	aggregatedChan := make(chan types.LogEntry)
	errChans := make([]<-chan error, 0, len(cfg.Sources))
	var wg sync.WaitGroup

	for _, src := range cfg.Sources {
		wg.Add(1)

		switch src.Type {
		case "file":
			go func(fc *config.FileConfig) {
				defer wg.Done()
				fileCollector := collector.NewFileCollector(fc.Path, fc.Tail)

				var logChan <-chan types.LogEntry
				var errChan <-chan error

				if fc.Tail {
					logChan, errChan = fileCollector.Watch(ctx)
				} else {
					logChan, errChan = fileCollector.Collect(ctx)
				}

				errChans = append(errChans, errChan)

				for entry := range logChan {
					select {
					case aggregatedChan <- entry:
					case <-ctx.Done():
						return
					}
				}
			}(src.File)

		case "ssh":
			go func(sc *config.SSHConfig) {
				defer wg.Done()
				sshCollector := collector.NewSSHCollector(sc.Host, sc.Port, sc.User, sc.Password, sc.KeyPath, sc.FilePath, sc.Tail)
				logChan, errChan := sshCollector.Collect(ctx)

				errChans = append(errChans, errChan)

				for entry := range logChan {
					select {
					case aggregatedChan <- entry:
					case <-ctx.Done():
						return
					}
				}
			}(src.SSH)

		case "k8s":
			go func(kc *config.K8sConfig) {
				defer wg.Done()
				k8sCollector := collector.NewK8sCollector(kc.Namespace, kc.PodName, kc.Container, kc.KubeConfig, kc.Tail)
				logChan, errChan := k8sCollector.Collect(ctx)

				errChans = append(errChans, errChan)

				for entry := range logChan {
					select {
					case aggregatedChan <- entry:
					case <-ctx.Done():
						return
					}
				}
			}(src.K8s)
		}
	}

	go func() {
		wg.Wait()
		close(aggregatedChan)
	}()

	logParser := parser.NewLogParser(cfg.ParseJSON)
	parsedChan := logParser.Process(aggregatedChan)

	filterConfig := cfg.GetFilterConfig()
	logFilter, err := filter.NewLogFilter(filterConfig)
	if err != nil {
		return fmt.Errorf("创建过滤器失败: %v", err)
	}
	filteredChan := logFilter.Process(parsedChan)

	if cfg.Export != nil && cfg.Export.FilePath != "" {
		exportConfig := cfg.GetExportConfig()
		logExporter, err := exporter.NewExporter(exportConfig)
		if err != nil {
			return fmt.Errorf("创建导出器失败: %v", err)
		}

		exportErrChan := logExporter.Export(filteredChan)

		errDone := make(chan struct{})
		go func() {
			for _, ec := range errChans {
				select {
				case err := <-ec:
					if err != nil {
						fmt.Fprintf(os.Stderr, "警告: %v\n", err)
					}
				case <-ctx.Done():
				}
			}
			close(errDone)
		}()

		select {
		case err := <-exportErrChan:
			return err
		case <-errDone:
		case <-ctx.Done():
		}

		return nil
	} else {
		highlighter := highlight.NewHighlighter(!cfg.NoColor)

		errDone := make(chan struct{})
		go func() {
			for _, ec := range errChans {
				select {
				case err := <-ec:
					if err != nil {
						fmt.Fprintf(os.Stderr, "警告: %v\n", err)
					}
				case <-ctx.Done():
				}
			}
			close(errDone)
		}()

		for {
			select {
			case entry, ok := <-filteredChan:
				if !ok {
					return nil
				}
				highlighter.Print(&entry)
			case <-ctx.Done():
				return nil
			case <-errDone:
			}
		}
	}
}
