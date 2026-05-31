package httpserver

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/mux"

	"log-cleaner/config"
	"log-cleaner/engine"
)

type Server struct {
	router *mux.Router
	port   int
}

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
}

type CreateVersionRequest struct {
	Rules     []config.Rule `json:"rules"`
	CreatedBy string        `json:"created_by"`
	Comment   string        `json:"comment"`
}

type SetCanaryRequest struct {
	Enabled      bool    `json:"enabled"`
	NewVersionID string  `json:"new_version_id"`
	Percentage   float64 `json:"percentage"`
	HashField    string  `json:"hash_field"`
}

func NewServer(port int) *Server {
	s := &Server{
		router: mux.NewRouter(),
		port:   port,
	}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	s.router.HandleFunc("/api/health", s.healthCheck).Methods("GET")

	s.router.HandleFunc("/api/rules", s.getCurrentRules).Methods("GET")
	s.router.HandleFunc("/api/rules", s.createNewVersion).Methods("POST")

	s.router.HandleFunc("/api/versions", s.getAllVersions).Methods("GET")
	s.router.HandleFunc("/api/versions/{version_id}", s.getVersion).Methods("GET")
	s.router.HandleFunc("/api/versions/{version_id}/activate", s.activateVersion).Methods("POST")

	s.router.HandleFunc("/api/canary", s.getCanaryConfig).Methods("GET")
	s.router.HandleFunc("/api/canary", s.setCanaryConfig).Methods("PUT")
	s.router.HandleFunc("/api/canary/stop", s.stopCanary).Methods("POST")
	s.router.HandleFunc("/api/canary/promote", s.promoteCanary).Methods("POST")

	s.router.HandleFunc("/api/rules/reload", s.reloadRules).Methods("POST")

	s.router.HandleFunc("/api/stats", s.getStats).Methods("GET")
	s.router.HandleFunc("/api/config", s.getConfig).Methods("GET")
}

func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Message: "Log Cleaner Service is running",
	})
}

func (s *Server) getCurrentRules(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	rules := config.GetCurrentRules()
	currentVersion := config.GetCurrentVersionID()
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"version_id": currentVersion,
			"rules":      rules,
		},
	})
}

func (s *Server) createNewVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req CreateVersionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Invalid request body: " + err.Error(),
		})
		return
	}

	if len(req.Rules) == 0 {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Rules cannot be empty",
		})
		return
	}

	versionID, err := config.CreateNewVersion(req.Rules, req.CreatedBy, req.Comment)
	if err != nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Failed to create version: " + err.Error(),
		})
		return
	}

	engine.GetRuleEngine().ReloadRules()

	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Message: "Version created successfully",
		Data: map[string]string{
			"version_id": versionID,
		},
	})
}

func (s *Server) getAllVersions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	versions := config.GetAllVersions()
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    versions,
	})
}

func (s *Server) getVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	vars := mux.Vars(r)
	versionID := vars["version_id"]

	rules := config.GetRulesByVersion(versionID)
	if rules == nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Version not found",
		})
		return
	}

	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"version_id": versionID,
			"rules":      rules,
		},
	})
}

func (s *Server) activateVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	vars := mux.Vars(r)
	versionID := vars["version_id"]

	if err := config.SetCurrentVersion(versionID); err != nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Failed to activate version: " + err.Error(),
		})
		return
	}

	engine.GetRuleEngine().ReloadRules()

	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Message: fmt.Sprintf("Version %s activated successfully", versionID),
	})
}

func (s *Server) getCanaryConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	canary := config.GetCanaryConfig()
	stats := engine.GetRuleEngine().GetStats()
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"canary": canary,
			"stats":  stats,
		},
	})
}

func (s *Server) setCanaryConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req SetCanaryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Invalid request body: " + err.Error(),
		})
		return
	}

	if req.Enabled && req.NewVersionID == "" {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "NewVersionID is required when enabling canary",
		})
		return
	}

	if req.Percentage < 0 || req.Percentage > 100 {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Percentage must be between 0 and 100",
		})
		return
	}

	canary := config.CanaryConfig{
		Enabled:      req.Enabled,
		NewVersionID: req.NewVersionID,
		Percentage:   req.Percentage,
		HashField:    req.HashField,
	}

	if err := config.SetCanaryConfig(canary); err != nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Failed to set canary config: " + err.Error(),
		})
		return
	}

	engine.GetRuleEngine().ReloadRules()

	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Message: "Canary configuration updated successfully",
		Data:    canary,
	})
}

func (s *Server) stopCanary(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	canary := config.CanaryConfig{
		Enabled: false,
	}

	if err := config.SetCanaryConfig(canary); err != nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Failed to stop canary: " + err.Error(),
		})
		return
	}

	engine.GetRuleEngine().ReloadRules()

	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Message: "Canary stopped successfully",
	})
}

func (s *Server) promoteCanary(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	canary := config.GetCanaryConfig()
	if !canary.Enabled {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "No active canary to promote",
		})
		return
	}

	if err := config.SetCurrentVersion(canary.NewVersionID); err != nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Failed to promote canary: " + err.Error(),
		})
		return
	}

	canary.Enabled = false
	if err := config.SetCanaryConfig(canary); err != nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Warning: Version promoted but failed to stop canary: " + err.Error(),
		})
		return
	}

	engine.GetRuleEngine().ReloadRules()

	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Message: fmt.Sprintf("Canary version %s promoted to current version", canary.NewVersionID),
	})
}



func (s *Server) reloadRules(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if _, err := config.LoadConfig(""); err != nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Failed to reload config: " + err.Error(),
		})
		return
	}

	engine.GetRuleEngine().ReloadRules()

	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Message: "Rules reloaded successfully",
	})
}

func (s *Server) getConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	cfg := config.GetConfig()
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    cfg,
	})
}

func (s *Server) getStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	engineStats := engine.GetRuleEngine().GetStats()
	rules := config.GetCurrentRules()
	stats := map[string]interface{}{
		"current_version": config.GetCurrentVersionID(),
		"rules_count":     len(rules),
		"version_stats":   engineStats,
	}
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    stats,
	})
}

func (s *Server) Start() error {
	log.Printf("HTTP server listening on port %d", s.port)
	return http.ListenAndServe(fmt.Sprintf(":%d", s.port), s.router)
}
