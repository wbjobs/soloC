package config

import (
	"fmt"
	"os"

	"logalyzer/filter"
	"logalyzer/types"

	"gopkg.in/yaml.v3"
)

type SSHConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	KeyPath  string `yaml:"key_path"`
	FilePath string `yaml:"file_path"`
	Tail     bool   `yaml:"tail"`
}

type K8sConfig struct {
	Namespace  string `yaml:"namespace"`
	PodName    string `yaml:"pod_name"`
	Container  string `yaml:"container"`
	KubeConfig string `yaml:"kubeconfig"`
	Tail       bool   `yaml:"tail"`
}

type FileConfig struct {
	Path string `yaml:"path"`
	Tail bool   `yaml:"tail"`
}

type FilterRule struct {
	Pattern         string `yaml:"pattern"`
	CaseInsensitive bool   `yaml:"case_insensitive"`
	Level           string `yaml:"level"`
}

type KeywordRule struct {
	Pattern string `yaml:"pattern"`
	Label   string `yaml:"label"`
}

type StatsOptions struct {
	Keywords       []KeywordRule `yaml:"keywords"`
	IncludeSources bool          `yaml:"include_sources"`
	IncludeHourly  bool          `yaml:"include_hourly"`
}

type ExportOptions struct {
	FilePath string `yaml:"file_path"`
	Format   string `yaml:"format"`
}

type Source struct {
	Type string      `yaml:"type"`
	File *FileConfig `yaml:"file,omitempty"`
	SSH  *SSHConfig  `yaml:"ssh,omitempty"`
	K8s  *K8sConfig  `yaml:"k8s,omitempty"`
}

type AppConfig struct {
	Sources    []Source      `yaml:"sources"`
	Filter     *FilterRule   `yaml:"filter,omitempty"`
	Stats      *StatsOptions `yaml:"stats,omitempty"`
	Export     *ExportOptions `yaml:"export,omitempty"`
	ParseJSON  bool          `yaml:"parse_json"`
	NoColor    bool          `yaml:"no_color"`
}

func LoadConfig(path string) (*AppConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("无法读取配置文件: %v", err)
	}

	var cfg AppConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("解析配置文件失败: %v", err)
	}

	if err := validateConfig(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func validateConfig(cfg *AppConfig) error {
	if len(cfg.Sources) == 0 {
		return fmt.Errorf("配置文件中没有定义任何数据源")
	}

	for i, src := range cfg.Sources {
		switch src.Type {
		case "file":
			if src.File == nil {
				return fmt.Errorf("源 %d (file) 缺少 file 配置", i)
			}
			if src.File.Path == "" {
				return fmt.Errorf("源 %d (file) 缺少 path 配置", i)
			}
		case "ssh":
			if src.SSH == nil {
				return fmt.Errorf("源 %d (ssh) 缺少 ssh 配置", i)
			}
			if src.SSH.Host == "" {
				return fmt.Errorf("源 %d (ssh) 缺少 host 配置", i)
			}
			if src.SSH.User == "" {
				return fmt.Errorf("源 %d (ssh) 缺少 user 配置", i)
			}
			if src.SSH.FilePath == "" {
				return fmt.Errorf("源 %d (ssh) 缺少 file_path 配置", i)
			}
			if src.SSH.Password == "" && src.SSH.KeyPath == "" {
				return fmt.Errorf("源 %d (ssh) 必须提供 password 或 key_path", i)
			}
			if src.SSH.Port == 0 {
				src.SSH.Port = 22
			}
		case "k8s":
			if src.K8s == nil {
				return fmt.Errorf("源 %d (k8s) 缺少 k8s 配置", i)
			}
			if src.K8s.PodName == "" {
				return fmt.Errorf("源 %d (k8s) 缺少 pod_name 配置", i)
			}
			if src.K8s.Namespace == "" {
				src.K8s.Namespace = "default"
			}
		default:
			return fmt.Errorf("源 %d 不支持的类型: %s", i, src.Type)
		}
	}

	if cfg.Export != nil {
		switch cfg.Export.Format {
		case "", "json", "csv":
		default:
			return fmt.Errorf("不支持的导出格式: %s", cfg.Export.Format)
		}
	}

	return nil
}

func (c *AppConfig) GetFilterConfig() *types.FilterConfig {
	if c.Filter == nil {
		return &types.FilterConfig{}
	}

	return &types.FilterConfig{
		Pattern:         c.Filter.Pattern,
		CaseInsensitive: c.Filter.CaseInsensitive,
		Level:           filter.ParseLogLevel(c.Filter.Level),
	}
}

func (c *AppConfig) GetStatsConfig() *types.StatsConfig {
	if c.Stats == nil {
		return &types.StatsConfig{}
	}

	keywords := make([]types.KeywordConfig, 0, len(c.Stats.Keywords))
	for _, kw := range c.Stats.Keywords {
		keywords = append(keywords, types.KeywordConfig{
			Pattern: kw.Pattern,
			Label:   kw.Label,
		})
	}

	return &types.StatsConfig{
		Keywords:       keywords,
		IncludeSources: c.Stats.IncludeSources,
		IncludeHourly:  c.Stats.IncludeHourly,
	}
}

func (c *AppConfig) GetExportConfig() *types.ExportConfig {
	if c.Export == nil {
		return &types.ExportConfig{}
	}

	var format types.OutputFormat
	switch c.Export.Format {
	case "csv":
		format = types.FormatCSV
	default:
		format = types.FormatJSON
	}

	return &types.ExportConfig{
		FilePath: c.Export.FilePath,
		Format:   format,
	}
}

func GenerateExampleConfig() string {
	return `# Logalyzer 配置文件示例
# 支持多数据源、过滤规则、统计关键词和导出配置

# 数据源配置（支持多个源同时采集）
sources:
  # 本地文件
  - type: file
    file:
      path: /var/log/app.log
      tail: true

  # SSH 远程服务器
  # - type: ssh
  #   ssh:
  #     host: server.example.com
  #     port: 22
  #     user: admin
  #     # password: your_password  # 或使用 key_path
  #     key_path: ~/.ssh/id_rsa
  #     file_path: /var/log/nginx/access.log
  #     tail: true

  # Kubernetes Pod
  # - type: k8s
  #   k8s:
  #     namespace: default
  #     pod_name: my-app-pod-xyz
  #     container: main
  #     kubeconfig: ~/.kube/config
  #     tail: true

# 日志过滤规则
filter:
  pattern: "error|failed"
  case_insensitive: true
  level: WARN  # DEBUG, INFO, WARN, ERROR, FATAL

# 统计配置
stats:
  include_sources: true
  include_hourly: true
  keywords:
    - pattern: "timeout"
      label: "超时错误"
    - pattern: "connection refused"
      label: "连接拒绝"
    - pattern: "out of memory|OOM"
      label: "内存不足"
    - pattern: "404|401|403|500|502|503"
      label: "HTTP错误"

# 导出配置
export:
  file_path: ./logs_export.json
  format: json  # json 或 csv

# 其他选项
parse_json: true
no_color: false
`
}
