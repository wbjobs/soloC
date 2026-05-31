package main

import "os"

type Config struct {
	EtcdEndpoints []string
	TaskPrefix    string
	NodePrefix    string
	LogPrefix     string
	APIAddress    string
}

func LoadConfig() *Config {
	etcdEndpoints := os.Getenv("ETCD_ENDPOINTS")
	if etcdEndpoints == "" {
		etcdEndpoints = "localhost:2379"
	}

	apiAddress := os.Getenv("API_ADDRESS")
	if apiAddress == "" {
		apiAddress = ":8080"
	}

	return &Config{
		EtcdEndpoints: []string{etcdEndpoints},
		TaskPrefix:    "/tasks/",
		NodePrefix:    "/nodes/",
		LogPrefix:     "/logs/",
		APIAddress:    apiAddress,
	}
}
