package engine

import (
	"encoding/json"
	"regexp"
	"testing"

	"log-cleaner/config"
)

func TestNestedFieldExtraction(t *testing.T) {
	jsonData := `{
		"level": "2",
		"message": "user_id=12345 action=login",
		"user": {
			"info": {
				"name": "testuser",
				"role": "admin"
			},
			"ip": "192.168.1.1"
		},
		"temp": {
			"data": "to_remove"
		}
	}`

	var logData map[string]interface{}
	err := json.Unmarshal([]byte(jsonData), &logData)
	if err != nil {
		t.Fatalf("Failed to parse JSON: %v", err)
	}

	tests := []struct {
		name     string
		rules    []config.Rule
		checkFn  func(t *testing.T, result map[string]interface{})
	}{
		{
			name: "extract nested field with regex",
			rules: []config.Rule{
				{
					ID:          "rule1",
					Name:        "Extract user_id",
					Type:        "regex_match",
					SourceField: "message",
					TargetField: "user.extracted_id",
					Pattern:     "user_id=([a-zA-Z0-9]+)",
					Enabled:     true,
				},
			},
			checkFn: func(t *testing.T, result map[string]interface{}) {
				user, ok := result["user"].(map[string]interface{})
				if !ok {
					t.Fatal("user field not found or not a map")
				}
				if user["extracted_id"] != "12345" {
					t.Errorf("Expected extracted_id=12345, got %v", user["extracted_id"])
				}
			},
		},
		{
			name: "mapping nested field",
			rules: []config.Rule{
				{
					ID:          "rule2",
					Name:        "Map role",
					Type:        "field_mapping",
					SourceField: "user.info.role",
					TargetField: "user.info.role_display",
					Mapping: map[string]string{
						"admin": "Administrator",
						"user":  "Regular User",
					},
					Enabled: true,
				},
			},
			checkFn: func(t *testing.T, result map[string]interface{}) {
				user, ok := result["user"].(map[string]interface{})
				if !ok {
					t.Fatal("user field not found or not a map")
				}
				info, ok := user["info"].(map[string]interface{})
				if !ok {
					t.Fatal("info field not found or not a map")
				}
				if info["role_display"] != "Administrator" {
					t.Errorf("Expected role_display=Administrator, got %v", info["role_display"])
				}
			},
		},
		{
			name: "delete nested field",
			rules: []config.Rule{
				{
					ID:          "rule3",
					Name:        "Remove temp data",
					Type:        "field_remove",
					SourceField: "temp.data",
					Enabled:     true,
				},
			},
			checkFn: func(t *testing.T, result map[string]interface{}) {
				temp, ok := result["temp"].(map[string]interface{})
				if !ok {
					return
				}
				if _, exists := temp["data"]; exists {
					t.Error("temp.data should have been deleted")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var testData map[string]interface{}
			json.Unmarshal([]byte(jsonData), &testData)

			re := &RuleEngine{
				rules:      tt.rules,
				regexCache: make(map[string]*regexp.Regexp),
			}

			result, ok := re.Process(testData)
			if !ok {
				t.Fatal("Process returned false")
			}

			tt.checkFn(t, result)
		})
	}
}

func TestGetNestedField(t *testing.T) {
	data := map[string]interface{}{
		"a": map[string]interface{}{
			"b": map[string]interface{}{
				"c": "value",
			},
		},
	}

	tests := []struct {
		path    string
		expect  interface{}
		exists  bool
	}{
		{"a.b.c", "value", true},
		{"a.b", map[string]interface{}{"c": "value"}, true},
		{"a", map[string]interface{}{"b": map[string]interface{}{"c": "value"}}, true},
		{"x.y.z", nil, false},
		{"a.x", nil, false},
	}

	for _, tt := range tests {
		value, exists := getNestedField(data, tt.path)
		if exists != tt.exists {
			t.Errorf("Path %s: expected exists=%v, got %v", tt.path, tt.exists, exists)
		}
		if tt.exists && value != tt.expect {
			if strVal, ok := tt.expect.(string); ok {
				if value != strVal {
					t.Errorf("Path %s: expected %v, got %v", tt.path, tt.expect, value)
				}
			}
		}
	}
}
