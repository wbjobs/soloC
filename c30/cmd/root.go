package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "logalyzer",
	Short: "跨平台日志聚合与分析工具",
	Long: `Logalyzer 是一个功能强大的跨平台日志聚合与分析命令行工具，
支持从本地文件、SSH 远程服务器和 Kubernetes Pod 采集日志，
并提供过滤、解析、实时监控和导出功能。`,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}
