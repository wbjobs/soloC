package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/cors"
	"github.com/vmihailenco/msgpack/v5"
	"ais-tracker-backend/config"
	"ais-tracker-backend/database"
	"ais-tracker-backend/models"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	conn   *websocket.Conn
	send   chan []byte
	filter string
}

type WebSocketServer struct {
	config       *config.Config
	db           *database.Database
	clients      map[*Client]bool
	broadcast    chan *models.TrajectoryUpdate
	alarmChan    chan []models.AnomalyEvent
	register     chan *Client
	unregister   chan *Client
	mu           sync.RWMutex
}

func New(cfg *config.Config, db *database.Database, broadcast chan *models.TrajectoryUpdate, alarmChan chan []models.AnomalyEvent) *WebSocketServer {
	return &WebSocketServer{
		config:    cfg,
		db:        db,
		clients:   make(map[*Client]bool),
		broadcast: broadcast,
		alarmChan: alarmChan,
		register:  make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (s *WebSocketServer) Start(ctx context.Context) {
	go s.run()
	go s.sendStatsPeriodically(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/api/vessels", s.handleVessels)
	mux.HandleFunc("/api/trajectory", s.handleTrajectory)
	mux.HandleFunc("/api/stats", s.handleStats)

	handler := cors.Default().Handler(mux)

	server := &http.Server{
		Addr:    s.config.WebSocketPort,
		Handler: handler,
	}

	go func() {
		log.Printf("WebSocket server starting on %s", s.config.WebSocketPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdownCtx)
	}()
}

func (s *WebSocketServer) run() {
	for {
		select {
		case client := <-s.register:
			s.mu.Lock()
			s.clients[client] = true
			s.mu.Unlock()
			log.Printf("Client connected")

		case client := <-s.unregister:
			s.mu.Lock()
			if _, ok := s.clients[client]; ok {
				delete(s.clients, client)
				close(client.send)
			}
			s.mu.Unlock()
			log.Printf("Client disconnected")

		case update := <-s.broadcast:
			s.broadcastUpdate(update)

		case events := <-s.alarmChan:
			s.broadcastAlarm(events)
		}
	}
}

func (s *WebSocketServer) broadcastAlarm(events []models.AnomalyEvent) {
	alert := models.AnomalyAlert{
		Type:   "anomaly",
		Events: events,
	}

	data, err := msgpack.Marshal(alert)
	if err != nil {
		log.Printf("Failed to marshal alarm (msgpack): %v", err)
		return
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	for client := range s.clients {
		select {
		case client.send <- data:
		default:
		}
	}
}

func (s *WebSocketServer) broadcastUpdate(update *models.TrajectoryUpdate) {
	data, err := msgpack.Marshal(update)
	if err != nil {
		log.Printf("Failed to marshal update (msgpack): %v", err)
		return
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	for client := range s.clients {
		select {
		case client.send <- data:
		default:
			s.mu.RUnlock()
			s.mu.Lock()
			if _, ok := s.clients[client]; ok {
				delete(s.clients, client)
				close(client.send)
			}
			s.mu.Unlock()
			s.mu.RLock()
		}
	}
}

func (s *WebSocketServer) sendStatsPeriodically(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ctx2, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			stats, err := s.db.GetGlobalStats(ctx2)
			cancel()

			if err == nil {
				msg := map[string]interface{}{
					"type":  "stats",
					"stats": stats,
				}
				data, encodeErr := msgpack.Marshal(msg)
				if encodeErr != nil {
					log.Printf("Failed to marshal stats: %v", encodeErr)
					continue
				}

				s.mu.RLock()
				for client := range s.clients {
					select {
					case client.send <- data:
					default:
					}
				}
				s.mu.RUnlock()
			}
		}
	}
}

func (s *WebSocketServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection: %v", err)
		return
	}

	client := &Client{
		conn:   conn,
		send:   make(chan []byte, 512),
		filter: r.URL.Query().Get("mmsi"),
	}

	s.register <- client

	defer func() {
		s.unregister <- client
	}()

	go s.writePump(client)
	s.readPump(client)
}

func (s *WebSocketServer) readPump(client *Client) {
	defer func() {
		s.unregister <- client
		client.conn.Close()
	}()

	client.conn.SetReadLimit(512)
	client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	client.conn.SetPongHandler(func(string) error {
		client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, _, err := client.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Error: %v", err)
			}
			break
		}
	}
}

func (s *WebSocketServer) writePump(client *Client) {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		client.conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.send:
			client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				client.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := client.conn.NextWriter(websocket.BinaryMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (s *WebSocketServer) handleVessels(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	positions, err := s.db.GetAllVesselPositions(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(positions)
}

func (s *WebSocketServer) handleTrajectory(w http.ResponseWriter, r *http.Request) {
	mmsi := r.URL.Query().Get("mmsi")
	if mmsi == "" {
		http.Error(w, "mmsi parameter required", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	points, err := s.db.GetCompressedTrajectory(ctx, mmsi)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(points)
}

func (s *WebSocketServer) handleStats(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	stats, err := s.db.GetGlobalStats(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}
