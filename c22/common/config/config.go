package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Scheduler SchedulerConfig `yaml:"scheduler"`
	Executor  ExecutorConfig  `yaml:"executor"`
	Etcd      EtcdConfig      `yaml:"etcd"`
	MySQL     MySQLConfig     `yaml:"mysql"`
	Logger    LoggerConfig    `yaml:"logger"`
	Tracing   TracingConfig   `yaml:"tracing"`
}

type SchedulerConfig struct {
	GRPCPort         int    `yaml:"grpc_port"`
	RESTPort         int    `yaml:"rest_port"`
	NodeID           string `yaml:"node_id"`
	HeartbeatTTL     int    `yaml:"heartbeat_ttl"`
	LoadBalanceStrategy string `yaml:"load_balance_strategy"`
}

type ExecutorConfig struct {
	GRPCPort           int      `yaml:"grpc_port"`
	NodeID             string   `yaml:"node_id"`
	Address            string   `yaml:"address"`
	MaxConcurrentTasks int      `yaml:"max_concurrent_tasks"`
	SupportedTaskTypes []string `yaml:"supported_task_types"`
	HeartbeatInterval  int      `yaml:"heartbeat_interval"`
	Weight             int      `yaml:"weight"`
}

type TracingConfig struct {
	Enabled     bool   `yaml:"enabled"`
	ServiceName string `yaml:"service_name"`
	Endpoint    string `yaml:"endpoint"`
	Insecure    bool   `yaml:"insecure"`
}

type EtcdConfig struct {
	Endpoints   []string `yaml:"endpoints"`
	DialTimeout int      `yaml:"dial_timeout"`
	Prefix      string   `yaml:"prefix"`
}

type MySQLConfig struct {
	Host         string `yaml:"host"`
	Port         int    `yaml:"port"`
	User         string `yaml:"user"`
	Password     string `yaml:"password"`
	Database     string `yaml:"database"`
	MaxOpenConns int    `yaml:"max_open_conns"`
	MaxIdleConns int    `yaml:"max_idle_conns"`
}

type LoggerConfig struct {
	Level  string `yaml:"level"`
	Format string `yaml:"format"`
}

func LoadConfig(configPath string) (*Config, error) {
	file, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(file, &config); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	setDefaults(&config)
	return &config, nil
}

func setDefaults(config *Config) {
	if config.Scheduler.GRPCPort == 0 {
		config.Scheduler.GRPCPort = 50051
	}
	if config.Scheduler.RESTPort == 0 {
		config.Scheduler.RESTPort = 8080
	}
	if config.Scheduler.NodeID == "" {
		config.Scheduler.NodeID = "scheduler-1"
	}
	if config.Scheduler.HeartbeatTTL == 0 {
		config.Scheduler.HeartbeatTTL = 30
	}
	if config.Scheduler.LoadBalanceStrategy == "" {
		config.Scheduler.LoadBalanceStrategy = "round_robin"
	}

	if config.Executor.GRPCPort == 0 {
		config.Executor.GRPCPort = 50052
	}
	if config.Executor.NodeID == "" {
		config.Executor.NodeID = "executor-1"
	}
	if config.Executor.MaxConcurrentTasks == 0 {
		config.Executor.MaxConcurrentTasks = 10
	}
	if config.Executor.HeartbeatInterval == 0 {
		config.Executor.HeartbeatInterval = 5
	}
	if config.Executor.Weight <= 0 {
		config.Executor.Weight = 1
	}

	if config.Tracing.ServiceName == "" {
		config.Tracing.ServiceName = "distributed-scheduler"
	}
	if config.Tracing.Endpoint == "" {
		config.Tracing.Endpoint = "localhost:4317"
	}

	if config.Etcd.DialTimeout == 0 {
		config.Etcd.DialTimeout = 5
	}
	if config.Etcd.Prefix == "" {
		config.Etcd.Prefix = "/scheduler"
	}

	if config.MySQL.Port == 0 {
		config.MySQL.Port = 3306
	}
	if config.MySQL.MaxOpenConns == 0 {
		config.MySQL.MaxOpenConns = 100
	}
	if config.MySQL.MaxIdleConns == 0 {
		config.MySQL.MaxIdleConns = 10
	}

	if config.Logger.Level == "" {
		config.Logger.Level = "info"
	}
	if config.Logger.Format == "" {
		config.Logger.Format = "json"
	}
}
