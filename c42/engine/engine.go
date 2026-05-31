package engine

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"

	"log-cleaner/config"
)

func getNestedField(data map[string]interface{}, fieldPath string) (interface{}, bool) {
	parts := strings.Split(fieldPath, ".")
	current := data

	for i, part := range parts {
		if i == len(parts)-1 {
			value, exists := current[part]
			return value, exists
		}

		next, ok := current[part].(map[string]interface{})
		if !ok {
			return nil, false
		}
		current = next
	}

	return nil, false
}

func setNestedField(data map[string]interface{}, fieldPath string, value interface{}) {
	parts := strings.Split(fieldPath, ".")
	current := data

	for i, part := range parts {
		if i == len(parts)-1 {
			current[part] = value
			return
		}

		next, ok := current[part].(map[string]interface{})
		if !ok {
			next = make(map[string]interface{})
			current[part] = next
		}
		current = next
	}
}

func deleteNestedField(data map[string]interface{}, fieldPath string) {
	parts := strings.Split(fieldPath, ".")
	current := data

	for i, part := range parts {
		if i == len(parts)-1 {
			delete(current, part)
			return
		}

		next, ok := current[part].(map[string]interface{})
		if !ok {
			return
		}
		current = next
	}
}

type VersionedRules struct {
	VersionID string
	Rules     []config.Rule
}

type RuleEngine struct {
	currentRules VersionedRules
	canaryRules  *VersionedRules
	regexCache   map[string]*regexp.Regexp
	cacheLock    sync.RWMutex
	statsLock    sync.RWMutex
	stats        map[string]int64
}

var instance *RuleEngine
var once sync.Once

func GetRuleEngine() *RuleEngine {
	once.Do(func() {
		instance = &RuleEngine{
			regexCache: make(map[string]*regexp.Regexp),
			stats:      make(map[string]int64),
		}
		instance.ReloadRules()
	})
	return instance
}

func (re *RuleEngine) ReloadRules() {
	re.cacheLock.Lock()
	defer re.cacheLock.Unlock()

	currentVersionID := config.GetCurrentVersionID()
	currentRules := config.GetCurrentRules()
	re.currentRules = VersionedRules{
		VersionID: currentVersionID,
		Rules:     currentRules,
	}

	canaryConfig := config.GetCanaryConfig()
	if canaryConfig.Enabled {
		canaryRules := config.GetCanaryRules()
		if canaryRules != nil {
			re.canaryRules = &VersionedRules{
				VersionID: canaryConfig.NewVersionID,
				Rules:     canaryRules,
			}
		} else {
			re.canaryRules = nil
		}
	} else {
		re.canaryRules = nil
	}

	re.regexCache = make(map[string]*regexp.Regexp)
}

func (re *RuleEngine) GetStats() map[string]int64 {
	re.statsLock.RLock()
	defer re.statsLock.RUnlock()
	result := make(map[string]int64)
	for k, v := range re.stats {
		result[k] = v
	}
	return result
}

func (re *RuleEngine) incrementStat(versionID string) {
	re.statsLock.Lock()
	defer re.statsLock.Unlock()
	re.stats[versionID]++
}

func (re *RuleEngine) Process(logData map[string]interface{}) (map[string]interface{}, bool, string) {
	result := make(map[string]interface{})
	for k, v := range logData {
		result[k] = v
	}

	var rules []config.Rule
	var versionID string

	re.cacheLock.RLock()
	useCanary := re.canaryRules != nil && config.ShouldUseCanary(logData)
	if useCanary {
		rules = re.canaryRules.Rules
		versionID = re.canaryRules.VersionID
	} else {
		rules = re.currentRules.Rules
		versionID = re.currentRules.VersionID
	}
	re.cacheLock.RUnlock()

	re.incrementStat(versionID)

	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}

		var err error
		switch rule.Type {
		case "field_mapping":
			result = re.applyFieldMapping(result, rule)
		case "regex_match":
			result, err = re.applyRegexMatch(result, rule)
			if err != nil {
				log.Printf("Regex rule error: %v", err)
			}
		case "blacklist":
			if re.isBlacklisted(result, rule) {
				return nil, false, versionID
			}
		case "field_rename":
			result = re.applyFieldRename(result, rule)
		case "field_remove":
			deleteNestedField(result, rule.SourceField)
		}
	}

	return result, true, versionID
}

func (re *RuleEngine) ProcessJSON(data []byte) ([]byte, bool, string) {
	var logData map[string]interface{}
	if err := json.Unmarshal(data, &logData); err != nil {
		log.Printf("JSON parse error: %v", err)
		return nil, false, ""
	}

	result, ok, versionID := re.Process(logData)
	if !ok {
		return nil, false, versionID
	}

	result["_rule_version"] = versionID

	jsonData, err := json.Marshal(result)
	if err != nil {
		log.Printf("JSON marshal error: %v", err)
		return nil, false, versionID
	}

	return jsonData, true, versionID
}

func (re *RuleEngine) applyFieldMapping(data map[string]interface{}, rule config.Rule) map[string]interface{} {
	if rule.SourceField == "" {
		return data
	}

	value, exists := getNestedField(data, rule.SourceField)
	if !exists {
		return data
	}

	strValue := fmt.Sprintf("%v", value)
	if mappedValue, ok := rule.Mapping[strValue]; ok {
		setNestedField(data, rule.TargetField, mappedValue)
	} else {
		setNestedField(data, rule.TargetField, value)
	}

	return data
}

func (re *RuleEngine) applyFieldRename(data map[string]interface{}, rule config.Rule) map[string]interface{} {
	if value, exists := getNestedField(data, rule.SourceField); exists {
		setNestedField(data, rule.TargetField, value)
		deleteNestedField(data, rule.SourceField)
	}
	return data
}

func (re *RuleEngine) applyRegexMatch(data map[string]interface{}, rule config.Rule) (map[string]interface{}, error) {
	value, exists := getNestedField(data, rule.SourceField)
	if !exists {
		return data, nil
	}

	strValue := fmt.Sprintf("%v", value)

	re.cacheLock.RLock()
	regex, ok := re.regexCache[rule.Pattern]
	re.cacheLock.RUnlock()

	if !ok {
		var err error
		regex, err = regexp.Compile(rule.Pattern)
		if err != nil {
			return data, err
		}
		re.cacheLock.Lock()
		re.regexCache[rule.Pattern] = regex
		re.cacheLock.Unlock()
	}

	matches := regex.FindStringSubmatch(strValue)
	if len(matches) > 1 {
		setNestedField(data, rule.TargetField, matches[1])
	}

	return data, nil
}

func (re *RuleEngine) isBlacklisted(data map[string]interface{}, rule config.Rule) bool {
	value, exists := getNestedField(data, rule.SourceField)
	if !exists {
		return false
	}

	strValue := strings.ToLower(fmt.Sprintf("%v", value))
	for _, item := range rule.Blacklist {
		if strings.Contains(strValue, strings.ToLower(item)) {
			return true
		}
	}
	return false
}
