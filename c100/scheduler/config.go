package main

type Config struct {
	EtcdEndpoints   []string
	EtcdDialTimeout int
	NodeTTL         int
	TaskPrefix      string
	NodePrefix      string
	LogPrefix       string
}

func LoadConfig() *Config {
	return &Config{
		EtcdEndpoints:   []string{"localhost:2379"},
		EtcdDialTimeout: 5,
		NodeTTL:         10,
		TaskPrefix:      "/tasks/",
		NodePrefix:      "/nodes/",
		LogPrefix:       "/logs/",
	}
}
