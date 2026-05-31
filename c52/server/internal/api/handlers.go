package api

import (
	"encoding/json"
	"net/http"
	"time"

	"edge-server/internal/database"
	"edge-server/internal/models"
	grpcsrv "edge-server/internal/grpc"
	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"
)

type Handler struct {
	grpcServer *grpcsrv.Server
}

func NewHandler(grpcServer *grpcsrv.Server) *Handler {
	return &Handler{
		grpcServer: grpcServer,
	}
}

func (h *Handler) GetNodes(c *gin.Context) {
	var nodes []models.Node
	database.DB.Find(&nodes)
	c.JSON(http.StatusOK, gin.H{"nodes": nodes})
}

func (h *Handler) GetNode(c *gin.Context) {
	nodeID := c.Param("node_id")
	var node models.Node
	result := database.DB.Where("node_id = ?", nodeID).First(&node)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
		return
	}
	c.JSON(http.StatusOK, node)
}

func (h *Handler) GetNodeConfig(c *gin.Context) {
	nodeID := c.Param("node_id")
	var config models.NodeConfig
	result := database.DB.Where("node_id = ? AND is_active = ?", nodeID, true).First(&config)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Config not found"})
		return
	}

	var configYAML models.NodeConfigYAML
	err := yaml.Unmarshal([]byte(config.ConfigYAML), &configYAML)
	if err != nil {
		c.JSON(http.StatusOK, config)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         config.ID,
		"node_id":    config.NodeID,
		"version":    config.Version,
		"config":     configYAML,
		"is_active":  config.IsActive,
		"created_at": config.CreatedAt,
		"updated_at": config.UpdatedAt,
	})
}

func (h *Handler) GetNodeConfigHistory(c *gin.Context) {
	nodeID := c.Param("node_id")
	var configs []models.NodeConfig
	database.DB.Where("node_id = ?", nodeID).Order("version desc").Find(&configs)

	configList := make([]gin.H, 0, len(configs))
	for _, cfg := range configs {
		var configYAML models.NodeConfigYAML
		err := yaml.Unmarshal([]byte(cfg.ConfigYAML), &configYAML)
		configItem := gin.H{
			"id":         cfg.ID,
			"node_id":    cfg.NodeID,
			"version":    cfg.Version,
			"is_active":  cfg.IsActive,
			"created_at": cfg.CreatedAt,
		}
		if err == nil {
			configItem["container_count"] = len(configYAML.Containers)
			configItem["description"] = getConfigDescription(&configYAML)
		}
		configList = append(configList, configItem)
	}

	c.JSON(http.StatusOK, gin.H{"configs": configList})
}

func getConfigDescription(config *models.NodeConfigYAML) string {
	if len(config.Containers) == 0 {
		return "空配置"
	}
	names := make([]string, 0, len(config.Containers))
	for _, c := range config.Containers {
		names = append(names, c.Name)
	}
	if len(names) > 3 {
		return names[0] + ", " + names[1] + ", " + names[2] + " 等"
	}
	return joinStrings(names, ", ")
}

func joinStrings(strs []string, sep string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}

func (h *Handler) GetConfigVersionDetail(c *gin.Context) {
	nodeID := c.Param("node_id")
	version := c.Param("version")

	var config models.NodeConfig
	result := database.DB.Where("node_id = ? AND version = ?", nodeID, version).First(&config)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Config version not found"})
		return
	}

	var configYAML models.NodeConfigYAML
	err := yaml.Unmarshal([]byte(config.ConfigYAML), &configYAML)
	if err != nil {
		c.JSON(http.StatusOK, config)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         config.ID,
		"node_id":    config.NodeID,
		"version":    config.Version,
		"config":     configYAML,
		"raw_yaml":   config.ConfigYAML,
		"is_active":  config.IsActive,
		"created_at": config.CreatedAt,
	})
}

type RollbackRequest struct {
	TargetVersion int64 `json:"target_version" binding:"required"`
}

func (h *Handler) RollbackConfig(c *gin.Context) {
	nodeID := c.Param("node_id")
	var req RollbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var sourceConfig models.NodeConfig
	result := database.DB.Where("node_id = ? AND version = ?", nodeID, req.TargetVersion).First(&sourceConfig)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Target config version not found"})
		return
	}

	var currentConfig models.NodeConfig
	database.DB.Where("node_id = ? AND is_active = ?", nodeID, true).First(&currentConfig)
	if currentConfig.Version == req.TargetVersion {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Already at target version"})
		return
	}

	tx := database.DB.Begin()

	tx.Model(&models.NodeConfig{}).Where("node_id = ?", nodeID).Update("is_active", false)

	var sourceYAML models.NodeConfigYAML
	if err := yaml.Unmarshal([]byte(sourceConfig.ConfigYAML), &sourceYAML); err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse source config"})
		return
	}

	newVersion := currentConfig.Version + 1
	if newVersion <= req.TargetVersion {
		newVersion = req.TargetVersion + 1
	}
	sourceYAML.Version = newVersion

	newYAML, err := yaml.Marshal(sourceYAML)
	if err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to marshal config"})
		return
	}

	newConfig := models.NodeConfig{
		NodeID:     nodeID,
		Version:    newVersion,
		ConfigYAML: string(newYAML),
		IsActive:   true,
		CreatedAt:  time.Now(),
	}
	if err := tx.Create(&newConfig).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create new config"})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, gin.H{
		"message":        "Config rolled back successfully",
		"source_version": req.TargetVersion,
		"new_version":    newVersion,
	})
}

type DiffRequest struct {
	VersionA int64 `json:"version_a" binding:"required"`
	VersionB int64 `json:"version_b" binding:"required"`
}

func (h *Handler) CompareConfigs(c *gin.Context) {
	nodeID := c.Param("node_id")
	var req DiffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var configA, configB models.NodeConfig
	if err := database.DB.Where("node_id = ? AND version = ?", nodeID, req.VersionA).First(&configA).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Version A not found"})
		return
	}
	if err := database.DB.Where("node_id = ? AND version = ?", nodeID, req.VersionB).First(&configB).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Version B not found"})
		return
	}

	var yamlA, yamlB models.NodeConfigYAML
	yaml.Unmarshal([]byte(configA.ConfigYAML), &yamlA)
	yaml.Unmarshal([]byte(configB.ConfigYAML), &yamlB)

	diff := calculateDiff(&yamlA, &yamlB)

	c.JSON(http.StatusOK, gin.H{
		"version_a": req.VersionA,
		"version_b": req.VersionB,
		"diff":      diff,
	})
}

func calculateDiff(a, b *models.NodeConfigYAML) gin.H {
	containersA := make(map[string]models.ContainerConfig)
	for _, c := range a.Containers {
		containersA[c.Name] = c
	}
	containersB := make(map[string]models.ContainerConfig)
	for _, c := range b.Containers {
		containersB[c.Name] = c
	}

	added := make([]string, 0)
	removed := make([]string, 0)
	modified := make([]gin.H, 0)

	for name := range containersB {
		if _, exists := containersA[name]; !exists {
			added = append(added, name)
		}
	}

	for name := range containersA {
		if _, exists := containersB[name]; !exists {
			removed = append(removed, name)
		}
	}

	for name, ca := range containersA {
		if cb, exists := containersB[name]; exists {
			changes := getContainerChanges(ca, cb)
			if len(changes) > 0 {
				modified = append(modified, gin.H{
					"name":    name,
					"changes": changes,
				})
			}
		}
	}

	return gin.H{
		"added":    added,
		"removed":  removed,
		"modified": modified,
		"version_change": gin.H{
			"from": a.Version,
			"to":   b.Version,
		},
	}
}

func getContainerChanges(a, b models.ContainerConfig) []gin.H {
	changes := make([]gin.H, 0)

	if a.Image != b.Image {
		changes = append(changes, gin.H{
			"field": "image",
			"from":  a.Image,
			"to":    b.Image,
		})
	}
	if a.CPULimit != b.CPULimit {
		changes = append(changes, gin.H{
			"field": "cpu_limit",
			"from":  a.CPULimit,
			"to":    b.CPULimit,
		})
	}
	if a.MemoryLimit != b.MemoryLimit {
		changes = append(changes, gin.H{
			"field": "memory_limit",
			"from":  a.MemoryLimit,
			"to":    b.MemoryLimit,
		})
	}
	if a.RestartPolicy != b.RestartPolicy {
		changes = append(changes, gin.H{
			"field": "restart_policy",
			"from":  a.RestartPolicy,
			"to":    b.RestartPolicy,
		})
	}

	jsonPortsA, _ := json.Marshal(a.Ports)
	jsonPortsB, _ := json.Marshal(b.Ports)
	if string(jsonPortsA) != string(jsonPortsB) {
		changes = append(changes, gin.H{
			"field": "ports",
			"from":  a.Ports,
			"to":    b.Ports,
		})
	}

	jsonVolumesA, _ := json.Marshal(a.Volumes)
	jsonVolumesB, _ := json.Marshal(b.Volumes)
	if string(jsonVolumesA) != string(jsonVolumesB) {
		changes = append(changes, gin.H{
			"field": "volumes",
			"from":  a.Volumes,
			"to":    b.Volumes,
		})
	}

	jsonEnvA, _ := json.Marshal(a.Env)
	jsonEnvB, _ := json.Marshal(b.Env)
	if string(jsonEnvA) != string(jsonEnvB) {
		changes = append(changes, gin.H{
			"field": "env",
			"from":  a.Env,
			"to":    b.Env,
		})
	}

	return changes
}

type UpdateConfigRequest struct {
	ConfigYAML string `json:"config_yaml" binding:"required"`
}

func (h *Handler) UpdateNodeConfig(c *gin.Context) {
	nodeID := c.Param("node_id")
	var req UpdateConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.grpcServer.UpdateNodeConfig(nodeID, req.ConfigYAML)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Config updated successfully"})
}

func (h *Handler) GetNodeHeartbeats(c *gin.Context) {
	nodeID := c.Param("node_id")
	var heartbeats []models.Heartbeat
	database.DB.Where("node_id = ?", nodeID).Order("created_at desc").Limit(100).Find(&heartbeats)
	c.JSON(http.StatusOK, gin.H{"heartbeats": heartbeats})
}
