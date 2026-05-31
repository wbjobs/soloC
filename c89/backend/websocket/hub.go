package websocket

import (
	"encoding/json"
	"space-drone-game/backend/game"
	"sync"
	"time"
)

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	gameManager *game.GameManager
	mu         sync.RWMutex
}

func NewHub(gm *game.GameManager) *Hub {
	return &Hub{
		broadcast:   make(chan []byte),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
		clients:     make(map[*Client]bool),
		gameManager: gm,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) BroadcastState() {
	state := h.gameManager.GetState()
	gravityBodies := h.gameManager.GetGravityBodies()
	data, _ := json.Marshal(map[string]interface{}{
		"type":         "state",
		"state":        state,
		"gravityBodies": gravityBodies,
	})
	h.broadcast <- data
}

func (h *Hub) BroadcastHeatMap() {
	heatMap := h.gameManager.GetHeatMap()
	data, _ := json.Marshal(map[string]interface{}{
		"type":    "heatmap",
		"heatmap": heatMap,
	})
	h.broadcast <- data
}

func (h *Hub) StartBroadcastLoop() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	
	for range ticker.C {
		h.BroadcastState()
		h.BroadcastHeatMap()
	}
}
