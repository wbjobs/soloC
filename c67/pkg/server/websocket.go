package server

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"network-monitor/pkg/topology"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type WebSocketServer struct {
	clients        map[*websocket.Conn]bool
	broadcast      chan []byte
	topology       *topology.Topology
	anomalyDetector *topology.AnomalyDetector
	mu             sync.Mutex
}

func NewWebSocketServer(topo *topology.Topology) *WebSocketServer {
	return &WebSocketServer{
		clients:        make(map[*websocket.Conn]bool),
		broadcast:      make(chan []byte, 256),
		topology:       topo,
		anomalyDetector: topology.NewAnomalyDetector(topo),
	}
}

func (s *WebSocketServer) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	s.mu.Lock()
	s.clients[conn] = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.clients, conn)
		s.mu.Unlock()
		conn.Close()
	}()

	s.sendInitialState(conn)

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

type TopologyMessage struct {
	Type      string        `json:"type"`
	Nodes     interface{}   `json:"nodes"`
	Edges     interface{}   `json:"edges"`
	Anomalies interface{}   `json:"anomalies"`
	AnomalyStats map[string]int `json:"anomalyStats"`
	AnomalyScore float64    `json:"anomalyScore"`
}

func (s *WebSocketServer) sendInitialState(conn *websocket.Conn) {
	anomalies := s.anomalyDetector.DetectAll()
	stats := s.anomalyDetector.GetAnomalyStats()
	score := s.anomalyDetector.GetAnomalyScore()

	msg := TopologyMessage{
		Type:         "topology",
		Nodes:        s.topology.GetNodes(),
		Edges:        s.topology.GetEdges(),
		Anomalies:    anomalies,
		AnomalyStats: stats,
		AnomalyScore: score,
	}
	data, _ := json.Marshal(msg)
	conn.WriteMessage(websocket.TextMessage, data)
}

func (s *WebSocketServer) BroadcastUpdate() {
	anomalies := s.anomalyDetector.DetectAll()
	stats := s.anomalyDetector.GetAnomalyStats()
	score := s.anomalyDetector.GetAnomalyScore()

	msg := TopologyMessage{
		Type:         "topology",
		Nodes:        s.topology.GetNodes(),
		Edges:        s.topology.GetEdges(),
		Anomalies:    anomalies,
		AnomalyStats: stats,
		AnomalyScore: score,
	}
	data, _ := json.Marshal(msg)

	select {
	case s.broadcast <- data:
	default:
	}
}

func (s *WebSocketServer) StartBroadcaster() {
	go func() {
		for data := range s.broadcast {
			s.mu.Lock()
			for conn := range s.clients {
				err := conn.WriteMessage(websocket.TextMessage, data)
				if err != nil {
					conn.Close()
					delete(s.clients, conn)
				}
			}
			s.mu.Unlock()
		}
	}()
}

func (s *WebSocketServer) StartPeriodicUpdate(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			s.BroadcastUpdate()
		}
	}()
}

func (s *WebSocketServer) ServeStaticFiles() http.Handler {
	return http.FileServer(http.Dir("./frontend/build"))
}

func (s *WebSocketServer) Start(addr string) error {
	http.HandleFunc("/ws", s.HandleWebSocket)
	http.Handle("/", s.ServeStaticFiles())

	log.Printf("Server starting on %s", addr)
	return http.ListenAndServe(addr, nil)
}

func (s *WebSocketServer) GetAnomalyDetector() *topology.AnomalyDetector {
	return s.anomalyDetector
}
