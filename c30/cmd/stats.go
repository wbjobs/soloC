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
	"logalyzer/filter"
	"logalyzer/parser"
	"logalyzer/stats"
	"logalyzer/types"

	"github.com/spf13/cobra"
)

var statsCmd = &cobra.Command{
	Use:   "stats",
	Short: "日志聚合统计",
	Long:  `对采集的日志进行聚合统计，按级别、关键词等生成统计报表。`,
	RunE:  runStatsCommand,
}

var (
	statsConfigPath  string
	statsOutputJSON  bool
	statsFilePath    string
	statsFilter      string
	statsLevel       string
	statsParseJSON   bool
)

func init() {
	rootCmd.AddCommand(statsCmd)

	statsCmd.Flags().StringVarP(&statsConfigPath, "config", "c", "", "使用配置文件")
	statsCmd.Flags().StringVarP(&statsFilePath, "path", "p", "", "本地日志文件路径（无配置文件时使用）")
	statsCmd.Flags().BoolVar(&statsOutputJSON, "json", false, "输出 JSON 格式报表")
	statsCmd.Flags().StringVarP(&statsFilter, "grep", "g", "", "正则表达式过滤")
	statsCmd.Flags().StringVarP(&statsLevel, "level", "l", "", "按日志级别过滤")
	statsCmd.Flags().BoolVar(&statsParseJSON, "parse-json", false, "解析 JSON 格式日志")
}

func runStatsCommand(cmd *cobra.Command, args []string) error {
	var cfg *config.AppConfig
	var err error

	if statsConfigPath != "" {
		cfg, err = config.LoadConfig(statsConfigPath)
		if err != nil {
			return fmt.Errorf("加载配置文件失败: %v", err)
		}
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
	var wg sync.WaitGroup

	if cfg != nil {
		for _, src := range cfg.Sources {
			wg.Add(1)

			switch src.Type {
			case "file":
				go func(fc *config.FileConfig) {
					defer wg.Done()
					fileCollector := collector.NewFileCollector(fc.Path, fc.Tail)
					logChan, _ := fileCollector.Collect(ctx)

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
					logChan, _ := sshCollector.Collect(ctx)

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
					logChan, _ := k8sCollector.Collect(ctx)

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
	} else {
		if statsFilePath == "" {
			return fmt.Errorf("必须指定配置文件 (--config) 或日志文件路径 (--path)")
		}

		wg.Add(1)
		go func() {
			defer wg.Done()
			fileCollector := collector.NewFileCollector(statsFilePath, false)
			logChan, _ := fileCollector.Collect(ctx)

			for entry := range logChan {
				select {
				case aggregatedChan <- entry:
				case <-ctx.Done():
					return
				}
			}
		}()
	}

	go func() {
		wg.Wait()
		close(aggregatedChan)
	}()

	var parseJSON bool
	if cfg != nil {
		parseJSON = cfg.ParseJSON
	} else {
		parseJSON = statsParseJSON
	}

	logParser := parser.NewLogParser(parseJSON)
	parsedChan := logParser.Process(aggregatedChan)

	var filterConfig *types.FilterConfig
	if cfg != nil {
		filterConfig = cfg.GetFilterConfig()
	} else {
		filterConfig = &types.FilterConfig{
			Pattern: statsFilter,
			Level:   filter.ParseLogLevel(statsLevel),
		}
	}

	logFilter, err := filter.NewLogFilter(filterConfig)
	if err != nil {
		return fmt.Errorf("创建过滤器失败: %v", err)
	}
	filteredChan := logFilter.Process(parsedChan)

	var statsConfig *types.StatsConfig
	if cfg != nil {
		statsConfig = cfg.GetStatsConfig()
	} else {
		statsConfig = &types.StatsConfig{
			IncludeSources: true,
			IncludeHourly:  true,
		}
	}

	aggregator, err := stats.NewLogAggregator(statsConfig)
	if err != nil {
		return fmt.Errorf("创建统计聚合器失败: %v", err)
	}

	done := aggregator.Process(filteredChan)

	select {
	case <-done:
	case <-ctx.Done():
	}

	report := aggregator.GetReport()

	if statsOutputJSON {
		jsonReport, err := aggregator.FormatJSONReport(report)
		if err != nil {
			return fmt.Errorf("生成 JSON 报表失败: %v", err)
		}
		fmt.Println(jsonReport)
	} else {
		textReport := aggregator.FormatTextReport(report)
		fmt.Print(textReport)
	}

	return nil
}
