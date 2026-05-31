package config

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	TCPPort        int            `yaml:"tcp_port"`
	HTTPPort       int            `yaml:"http_port"`
	RedisAddr      string         `yaml:"redis_addr"`
	RedisPassword  string         `yaml:"redis_password"`
	RedisDB        int            `yaml:"redis_db"`
	RedisKey       string         `yaml:"redis_key"`
	Elasticsearch  ESConfig       `yaml:"elasticsearch"`
	RuleVersions   RuleVersioning `yaml:"rule_versions"`
}

type ESConfig struct {
	Addresses []string `yaml:"addresses"`
	Username  string   `yaml:"username"`
	Password  string   `yaml:"password"`
	Index     string   `yaml:"index"`
}

type Rule struct {
	ID          string            `yaml:"id"`
	Name        string            `yaml:"name"`
	Type        string            `yaml:"type"`
	SourceField string            `yaml:"source_field"`
	TargetField string            `yaml:"target_field"`
	Pattern     string            `yaml:"pattern"`
	Mapping     map[string]string `yaml:"mapping"`
	Blacklist   []string          `yaml:"blacklist"`
	Enabled     bool              `yaml:"enabled"`
}

type RuleVersion struct {
	VersionID string    `yaml:"version_id"`
	CreatedAt time.Time `yaml:"created_at"`
	CreatedBy string    `yaml:"created_by"`
	Comment   string    `yaml:"comment"`
	Rules     []Rule    `yaml:"rules"`
}

type CanaryConfig struct {
	Enabled      bool    `yaml:"enabled"`
	NewVersionID string  `yaml:"new_version_id"`
	Percentage   float64 `yaml:"percentage"`
	HashField    string  `yaml:"hash_field"`
}

type RuleVersioning struct {
	CurrentVersion string        `yaml:"current_version"`
	Versions       []RuleVersion `yaml:"versions"`
	Canary         CanaryConfig  `yaml:"canary"`
}

var (
	config     *Config
	configLock sync.RWMutex
	configPath = "config.yaml"
)

func LoadConfig(path string) (*Config, error) {
	if path != "" {
		configPath = path
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	if cfg.RuleVersions.Versions == nil {
		cfg.RuleVersions.Versions = []RuleVersion{}
	}
	if cfg.RuleVersions.CurrentVersion == "" && len(cfg.RuleVersions.Versions) > 0 {
		cfg.RuleVersions.CurrentVersion = cfg.RuleVersions.Versions[0].VersionID
	}

	configLock.Lock()
	config = &cfg
	configLock.Unlock()

	return &cfg, nil
}

func GetConfig() *Config {
	configLock.RLock()
	defer configLock.RUnlock()
	if config == nil {
		return &Config{}
	}
	cfgCopy := *config
	return &cfgCopy
}

func SaveConfig(cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return err
	}

	configLock.Lock()
	config = cfg
	configLock.Unlock()

	return nil
}

func GetCurrentRules() []Rule {
	configLock.RLock()
	defer configLock.RUnlock()
	if config == nil {
		return nil
	}

	versionID := config.RuleVersions.CurrentVersion
	for _, v := range config.RuleVersions.Versions {
		if v.VersionID == versionID {
			rulesCopy := make([]Rule, len(v.Rules))
			copy(rulesCopy, v.Rules)
			return rulesCopy
		}
	}
	return nil
}

func GetRulesByVersion(versionID string) []Rule {
	configLock.RLock()
	defer configLock.RUnlock()
	if config == nil {
		return nil
	}

	for _, v := range config.RuleVersions.Versions {
		if v.VersionID == versionID {
			rulesCopy := make([]Rule, len(v.Rules))
			copy(rulesCopy, v.Rules)
			return rulesCopy
		}
	}
	return nil
}

func CreateNewVersion(rules []Rule, createdBy, comment string) (string, error) {
	configLock.Lock()
	defer configLock.Unlock()
	if config == nil {
		config = &Config{}
	}

	versionID := generateVersionID(rules)

	newVersion := RuleVersion{
		VersionID: versionID,
		CreatedAt: time.Now(),
		CreatedBy: createdBy,
		Comment:   comment,
		Rules:     rules,
	}

	config.RuleVersions.Versions = append([]RuleVersion{newVersion}, config.RuleVersions.Versions...)

	if config.RuleVersions.CurrentVersion == "" {
		config.RuleVersions.CurrentVersion = versionID
	}

	err := SaveConfig(config)
	if err != nil {
		return "", err
	}

	return versionID, nil
}

func GetAllVersions() []RuleVersion {
	configLock.RLock()
	defer configLock.RUnlock()
	if config == nil {
		return nil
	}

	versionsCopy := make([]RuleVersion, len(config.RuleVersions.Versions))
	copy(versionsCopy, config.RuleVersions.Versions)
	return versionsCopy
}

func SetCurrentVersion(versionID string) error {
	configLock.Lock()
	defer configLock.Unlock()
	if config == nil {
		config = &Config{}
	}

	found := false
	for _, v := range config.RuleVersions.Versions {
		if v.VersionID == versionID {
			found = true
			break
		}
	}
	if !found {
		return os.ErrNotExist
	}

	config.RuleVersions.CurrentVersion = versionID
	return SaveConfig(config)
}

func SetCanaryConfig(canary CanaryConfig) error {
	configLock.Lock()
	defer configLock.Unlock()
	if config == nil {
		config = &Config{}
	}

	config.RuleVersions.Canary = canary
	return SaveConfig(config)
}

func GetCanaryConfig() CanaryConfig {
	configLock.RLock()
	defer configLock.RUnlock()
	if config == nil {
		return CanaryConfig{}
	}
	return config.RuleVersions.Canary
}

func GetCurrentVersionID() string {
	configLock.RLock()
	defer configLock.RUnlock()
	if config == nil {
		return ""
	}
	return config.RuleVersions.CurrentVersion
}

func ShouldUseCanary(logData map[string]interface{}) bool {
	configLock.RLock()
	defer configLock.RUnlock()
	if config == nil || !config.RuleVersions.Canary.Enabled {
		return false
	}

	canary := config.RuleVersions.Canary
	if canary.Percentage <= 0 {
		return false
	}
	if canary.Percentage >= 100 {
		return true
	}

	hashValue := getHashValue(logData, canary.HashField)
	return hashValue%100 < int(canary.Percentage)
}

func GetCanaryRules() []Rule {
	configLock.RLock()
	defer configLock.RUnlock()
	if config == nil || !config.RuleVersions.Canary.Enabled {
		return nil
	}

	canary := config.RuleVersions.Canary
	for _, v := range config.RuleVersions.Versions {
		if v.VersionID == canary.NewVersionID {
			rulesCopy := make([]Rule, len(v.Rules))
			copy(rulesCopy, v.Rules)
			return rulesCopy
		}
	}
	return nil
}

func generateVersionID(rules []Rule) string {
	data, _ := json.Marshal(rules)
	hash := sha256.Sum256(append(data, []byte(time.Now().String())...))
	return "v_" + hex.EncodeToString(hash[:])[:8]
}

func getHashValue(logData map[string]interface{}, field string) int {
	if field == "" {
		field = "message"
	}

	value, exists := logData[field]
	if !exists {
		return int(time.Now().UnixNano() % 100)
	}

	strValue := interfaceToString(value)
	hash := sha256.Sum256([]byte(strValue))
	return int(hash[0])
}

func interfaceToString(v interface{}) string {
	switch val := v.(type) {
	case string:
		return val
	case int, int64, float64:
		return string(jsonFormat(v))
	default:
		data, _ := json.Marshal(v)
		return string(data)
	}
}

func jsonFormat(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
}
