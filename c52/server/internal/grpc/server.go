package grpc

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"
	"edge-server/internal/database"
	"edge-server/internal/models"
	pb "edge-server/proto"
	"gopkg.in/yaml.v3"
)

type Server struct {
	pb.UnimplementedEdgeServiceServer
	heartbeatInterval int64
}

func NewServer(heartbeatInterval int64) *Server {
	return &Server{
		heartbeatInterval: heartbeatInterval,
	}
}

func (s *Server) GetConfig(ctx context.Context, req *pb.ConfigRequest) (*pb.ConfigResponse, error) {
	log.Printf("GetConfig request from node: %s, current version: %d", req.NodeId, req.CurrentVersion)

	var node models.Node
	result := database.DB.Where("node_id = ?", req.NodeId).First(&node)
	if result.Error != nil {
		node = models.Node{
			NodeID:       req.NodeId,
			Hostname:     req.Hostname,
			NodeIP:       req.NodeIp,
			Status:       "online",
			ConfigVersion: 0,
		}
		database.DB.Create(&node)
	}

	var nodeConfig models.NodeConfig
	result = database.DB.Where("node_id = ? AND is_active = ?", req.NodeId, true).First(&nodeConfig)
	if result.Error != nil {
		defaultConfig := models.NodeConfigYAML{
			NodeID:   req.NodeId,
			Version:  1,
			Containers: []models.ContainerConfig{},
			Metadata: map[string]string{},
		}
		configYAML, _ := yaml.Marshal(defaultConfig)
		nodeConfig = models.NodeConfig{
			NodeID:    req.NodeId,
			Version:   1,
			ConfigYAML: string(configYAML),
			IsActive:  true,
		}
		database.DB.Create(&nodeConfig)
	}

	var configYAML models.NodeConfigYAML
	err := yaml.Unmarshal([]byte(nodeConfig.ConfigYAML), &configYAML)
	if err != nil {
		log.Printf("Failed to parse config YAML: %v", err)
		return &pb.ConfigResponse{
			HasUpdate: false,
			Message:   "Failed to parse config",
		}, nil
	}

	forceSync := false
	if req.CurrentVersion > configYAML.Version {
		log.Printf("Version conflict detected: node %s reports version %d, but latest is %d. Forcing sync.",
			req.NodeId, req.CurrentVersion, configYAML.Version)
		forceSync = true
	}

	hasUpdate := configYAML.Version > req.CurrentVersion || forceSync

	pbContainers := make([]*pb.ContainerConfig, len(configYAML.Containers))
	for i, c := range configYAML.Containers {
		pbContainers[i] = &pb.ContainerConfig{
			Image:         c.Image,
			Name:          c.Name,
			Env:           c.Env,
			Ports:         c.Ports,
			Volumes:       c.Volumes,
			CpuLimit:      c.CPULimit,
			MemoryLimit:   c.MemoryLimit,
			RestartPolicy: c.RestartPolicy,
		}
	}

	response := &pb.ConfigResponse{
		HasUpdate: hasUpdate,
		Message:   "OK",
		ForceSync: forceSync,
	}

	if hasUpdate || req.CurrentVersion == 0 {
		response.Config = &pb.NodeConfig{
			NodeId:    configYAML.NodeID,
			Version:   configYAML.Version,
			Containers: pbContainers,
			Metadata:  configYAML.Metadata,
		}
	}

	return response, nil
}

func (s *Server) ReportHeartbeat(ctx context.Context, req *pb.HeartbeatRequest) (*pb.HeartbeatResponse, error) {
	log.Printf("Heartbeat from node: %s, status: %s", req.NodeId, req.Status)

	var node models.Node
	result := database.DB.Where("node_id = ?", req.NodeId).First(&node)
	if result.Error != nil {
		node = models.Node{
			NodeID:       req.NodeId,
			Hostname:     req.Hostname,
			NodeIP:       req.NodeIp,
			Status:       req.Status,
			ConfigVersion: 0,
		}
		database.DB.Create(&node)
	} else {
		now := time.Now()
		node.LastSeen = &now
		node.Status = req.Status
		node.NodeIP = req.NodeIp
		node.Hostname = req.Hostname
		database.DB.Save(&node)
	}

	containersJSON, _ := json.Marshal(req.Containers)
	heartbeat := models.Heartbeat{
		NodeID:        req.NodeId,
		NodeIP:        req.NodeIp,
		Hostname:      req.Hostname,
		CPUUsage:      req.ResourceUsage.CpuUsage,
		MemoryUsage:   req.ResourceUsage.MemoryUsage,
		MemoryTotal:   req.ResourceUsage.MemoryTotal,
		DiskUsage:     req.ResourceUsage.DiskUsage,
		DiskTotal:     req.ResourceUsage.DiskTotal,
		LoadAverage:   req.ResourceUsage.LoadAverage,
		NodeStatus:    req.Status,
		ContainersJSON: string(containersJSON),
		Timestamp:     req.Timestamp,
		CreatedAt:     time.Now(),
	}
	database.DB.Create(&heartbeat)

	var nodeConfig models.NodeConfig
	configPending := false
	result = database.DB.Where("node_id = ? AND is_active = ?", req.NodeId, true).First(&nodeConfig)
	if result.Error == nil {
		var configYAML models.NodeConfigYAML
		err := yaml.Unmarshal([]byte(nodeConfig.ConfigYAML), &configYAML)
		if err == nil && configYAML.Version > node.ConfigVersion {
			configPending = true
		}
	}

	return &pb.HeartbeatResponse{
		Accepted:      true,
		Message:       "Heartbeat received",
		NextHeartbeat: s.heartbeatInterval,
		ConfigUpdated: configPending,
	}, nil
}

func (s *Server) ReportConfigAck(ctx context.Context, req *pb.ConfigAckRequest) (*pb.ConfigAckResponse, error) {
	log.Printf("ConfigAck from node: %s, version: %d, success: %v", req.NodeId, req.Version, req.Success)

	var node models.Node
	result := database.DB.Where("node_id = ?", req.NodeId).First(&node)
	if result.Error != nil {
		return &pb.ConfigAckResponse{
			Accepted: false,
			Message:  "Node not found",
		}, nil
	}

	if req.Success {
		node.ConfigVersion = req.Version
		log.Printf("Node %s config updated to version %d", req.NodeId, req.Version)
	} else {
		log.Printf("Node %s failed to apply config version %d: %s", req.NodeId, req.Version, req.ErrorMessage)
	}

	database.DB.Save(&node)

	return &pb.ConfigAckResponse{
		Accepted: true,
		Message:  "Ack received",
	}, nil
}

func (s *Server) UpdateNodeConfig(nodeID string, configYAML string) error {
	var config models.NodeConfigYAML
	err := yaml.Unmarshal([]byte(configYAML), &config)
	if err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}

	tx := database.DB.Begin()

	var maxVersion int64
	tx.Model(&models.NodeConfig{}).Where("node_id = ?", nodeID).Select("COALESCE(MAX(version), 0)").Scan(&maxVersion)

	newVersion := maxVersion + 1
	if config.Version <= maxVersion {
		config.Version = newVersion
	} else {
		newVersion = config.Version
	}

	updatedYAML, err := yaml.Marshal(config)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	tx.Model(&models.NodeConfig{}).Where("node_id = ?", nodeID).Update("is_active", false)

	newConfig := models.NodeConfig{
		NodeID:     nodeID,
		Version:    newVersion,
		ConfigYAML: string(updatedYAML),
		IsActive:   true,
	}
	if err := tx.Create(&newConfig).Error; err != nil {
		tx.Rollback()
		return err
	}

	tx.Commit()
	return nil
}
