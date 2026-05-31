package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/sirupsen/logrus"

	pb "blockchain-monitor/api/gen/monitor"
	"blockchain-monitor/manager"
	"blockchain-monitor/service"
)

type HTTPServer struct {
	router           *mux.Router
	nodeManager      *manager.NodeManager
	predictionService *service.PredictionService
	server           *http.Server
}

type RegisterNodeRequest struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	Endpoint string `json:"endpoint"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
}

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func NewHTTPServer(
	nodeManager *manager.NodeManager,
	predictionService *service.PredictionService,
	port string,
) *HTTPServer {
	s := &HTTPServer{
		router:           mux.NewRouter(),
		nodeManager:      nodeManager,
		predictionService: predictionService,
	}

	s.setupRoutes()

	s.server = &http.Server{
		Addr:         ":" + port,
		Handler:      s.router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	return s
}

func (s *HTTPServer) setupRoutes() {
	s.router.HandleFunc("/api/health", s.healthCheck).Methods("GET")
	s.router.HandleFunc("/api/nodes", s.registerNode).Methods("POST")
	s.router.HandleFunc("/api/nodes", s.listNodes).Methods("GET")
	s.router.HandleFunc("/api/nodes/{id}", s.getNode).Methods("GET")
	s.router.HandleFunc("/api/nodes/{id}", s.unregisterNode).Methods("DELETE")
	s.router.HandleFunc("/api/nodes/{id}/status", s.getNodeStatus).Methods("GET")
	s.router.HandleFunc("/api/nodes/{id}/prediction", s.getNodePrediction).Methods("GET")
	s.router.HandleFunc("/api/metrics", s.streamMetrics).Methods("GET")

	s.router.Use(corsMiddleware)
}

func (s *HTTPServer) Start() error {
	logrus.WithField("port", s.server.Addr).Info("HTTP server starting")
	return s.server.ListenAndServe()
}

func (s *HTTPServer) Stop(ctx context.Context) error {
	logrus.Info("HTTP server stopping")
	return s.server.Shutdown(ctx)
}

func (s *HTTPServer) healthCheck(w http.ResponseWriter, r *http.Request) {
	sendJSON(w, http.StatusOK, APIResponse{Success: true, Data: map[string]string{"status": "ok"}})
}

func (s *HTTPServer) registerNode(w http.ResponseWriter, r *http.Request) {
	var req RegisterNodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, APIResponse{Success: false, Error: "Invalid request body"})
		return
	}

	nodeType, err := parseNodeType(req.Type)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, APIResponse{Success: false, Error: err.Error()})
		return
	}

	nodeID, err := s.nodeManager.RegisterNode(
		nodeType,
		req.Name,
		req.Endpoint,
		req.Username,
		req.Password,
	)

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, APIResponse{Success: false, Error: err.Error()})
		return
	}

	sendJSON(w, http.StatusCreated, APIResponse{Success: true, Data: map[string]string{"node_id": nodeID}})
}

func (s *HTTPServer) listNodes(w http.ResponseWriter, r *http.Request) {
	nodes := s.nodeManager.ListNodes()
	result := make([]map[string]interface{}, 0, len(nodes))

	for _, node := range nodes {
		info := node.GetNodeInfo()
		status, _ := s.nodeManager.GetNodeStatus(info.ID)
		metrics, _ := s.nodeManager.GetNodeMetrics(info.ID)

		nodeData := map[string]interface{}{
			"id":       info.ID,
			"type":     info.Type.String(),
			"name":     info.Name,
			"endpoint": info.Endpoint,
		}

		if status != nil {
			nodeData["status"] = status.Status.String()
			nodeData["block_height"] = status.BlockHeight
			nodeData["peer_count"] = status.PeerCount
			nodeData["sync_progress"] = status.SyncProgress
			nodeData["last_checked"] = status.Timestamp.Unix()
		}

		if metrics != nil {
			nodeData["tx_rate"] = metrics.TxRate
			nodeData["latency_ms"] = metrics.Latency
		}

		result = append(result, nodeData)
	}

	sendJSON(w, http.StatusOK, APIResponse{Success: true, Data: result})
}

func (s *HTTPServer) getNode(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	nodeID := vars["id"]

	node, err := s.nodeManager.GetNode(nodeID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, APIResponse{Success: false, Error: "Node not found"})
		return
	}

	info := node.GetNodeInfo()
	status, _ := s.nodeManager.GetNodeStatus(nodeID)
	metrics, _ := s.nodeManager.GetNodeMetrics(nodeID)

	result := map[string]interface{}{
		"id":       info.ID,
		"type":     info.Type.String(),
		"name":     info.Name,
		"endpoint": info.Endpoint,
	}

	if status != nil {
		result["status"] = status.Status.String()
		result["block_height"] = status.BlockHeight
		result["peer_count"] = status.PeerCount
		result["sync_progress"] = status.SyncProgress
		result["last_checked"] = status.Timestamp.Unix()
	}

	if metrics != nil {
		result["tx_rate"] = metrics.TxRate
		result["latency_ms"] = metrics.Latency
	}

	sendJSON(w, http.StatusOK, APIResponse{Success: true, Data: result})
}

func (s *HTTPServer) unregisterNode(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	nodeID := vars["id"]

	err := s.nodeManager.UnregisterNode(nodeID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, APIResponse{Success: false, Error: "Node not found"})
		return
	}

	sendJSON(w, http.StatusOK, APIResponse{Success: true, Data: map[string]string{"message": "Node unregistered"}})
}

func (s *HTTPServer) getNodeStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	nodeID := vars["id"]

	status, exists := s.nodeManager.GetNodeStatus(nodeID)
	if !exists {
		sendJSON(w, http.StatusNotFound, APIResponse{Success: false, Error: "Node not found"})
		return
	}

	metrics, _ := s.nodeManager.GetNodeMetrics(nodeID)

	result := map[string]interface{}{
		"status":         status.Status.String(),
		"block_height":   status.BlockHeight,
		"peer_count":     status.PeerCount,
		"sync_progress":  status.SyncProgress,
		"latency_ms":     status.Latency.Milliseconds(),
		"error_message":  status.ErrorMessage,
		"timestamp":      status.Timestamp.Unix(),
	}

	if metrics != nil {
		result["tx_rate"] = metrics.TxRate
	}

	sendJSON(w, http.StatusOK, APIResponse{Success: true, Data: result})
}

func (s *HTTPServer) getNodePrediction(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	nodeID := vars["id"]

	_, err := s.nodeManager.GetNode(nodeID)
	if err != nil {
		sendJSON(w, http.StatusNotFound, APIResponse{Success: false, Error: "Node not found"})
		return
	}

	if s.predictionService == nil {
		sendJSON(w, http.StatusServiceUnavailable, APIResponse{Success: false, Error: "Prediction service not available"})
		return
	}

	hoursStr := r.URL.Query().Get("hours")
	hours := 24
	if hoursStr != "" {
		if parsed, err := strconv.Atoi(hoursStr); err == nil && parsed > 0 && parsed <= 168 {
			hours = parsed
		}
	}

	logrus.WithFields(logrus.Fields{
		"node_id": nodeID,
		"hours":   hours,
	}).Info("Received prediction request")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	result, err := s.predictionService.PredictNext24Hours(ctx, nodeID, hours)
	if err != nil {
		logrus.WithError(err).Error("Prediction failed")
		sendJSON(w, http.StatusInternalServerError, APIResponse{Success: false, Error: "Prediction failed"})
		return
	}

	sendJSON(w, http.StatusOK, APIResponse{Success: true, Data: result})
}

func (s *HTTPServer) streamMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			metricsList := s.getAllMetrics()
			data, err := json.Marshal(metricsList)
			if err != nil {
				continue
			}

			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}
}

func (s *HTTPServer) getAllMetrics() []map[string]interface{} {
	result := []map[string]interface{}{}
	nodes := s.nodeManager.ListNodes()

	for _, node := range nodes {
		info := node.GetNodeInfo()
		metrics, exists := s.nodeManager.GetNodeMetrics(info.ID)
		if !exists {
			continue
		}

		result = append(result, map[string]interface{}{
			"node_id":       metrics.NodeID,
			"timestamp":     metrics.Timestamp.Unix(),
			"block_height":  metrics.BlockHeight,
			"tx_rate":       metrics.TxRate,
			"peer_count":    metrics.PeerCount,
			"sync_progress": metrics.SyncProgress,
			"latency_ms":    metrics.Latency,
		})
	}

	return result
}

func sendJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func parseNodeType(typeStr string) (pb.NodeType, error) {
	switch strings.ToUpper(typeStr) {
	case "ETHEREUM", "ETH":
		return pb.NodeType_ETHEREUM, nil
	case "BITCOIN", "BTC":
		return pb.NodeType_BITCOIN, nil
	default:
		return pb.NodeType_UNKNOWN, fmt.Errorf("unsupported node type: %s", typeStr)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
