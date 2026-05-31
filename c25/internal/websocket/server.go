package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	redis_client "cardgame/internal/redis"

	"github.com/gorilla/websocket"
)

const (
	writeWait       = 10 * time.Second
	pongWait        = 60 * time.Second
	pingPeriod      = (pongWait * 9) / 10
	maxMessageSize  = 8192
	playerOnlineKey = "player:online:"
	playerRoomKey   = "player:room:"
	onlineTTL       = 90 * time.Second
)

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type Client struct {
	conn     *websocket.Conn
	server   *Server
	playerID string
	send     chan []byte
	mu       sync.Mutex
}

type Server struct {
	redisClient *redis_client.Client
	clients     map[*Client]bool
	broadcast   chan []byte
	register    chan *Client
	unregister  chan *Client
	mu          sync.RWMutex
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func NewServer(redisClient *redis_client.Client) *Server {
	s := &Server{
		redisClient: redisClient,
		clients:     make(map[*Client]bool),
		broadcast:   make(chan []byte, 256),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
	}
	go s.run()
	go s.subscribeToRedis()
	return s
}

func (s *Server) run() {
	for {
		select {
		case client := <-s.register:
			s.mu.Lock()
			s.clients[client] = true
			s.mu.Unlock()
			s.setPlayerOnline(client.playerID)
			log.Printf("Client registered: %s", client.playerID)
		case client := <-s.unregister:
			s.mu.Lock()
			if _, ok := s.clients[client]; ok {
				delete(s.clients, client)
				close(client.send)
			}
			s.mu.Unlock()
			s.setPlayerOffline(client.playerID)
			log.Printf("Client unregistered: %s", client.playerID)
		case message := <-s.broadcast:
			s.mu.RLock()
			for client := range s.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(s.clients, client)
				}
			}
			s.mu.RUnlock()
		}
	}
}

func (s *Server) setPlayerOnline(playerID string) {
	key := playerOnlineKey + playerID
	value := map[string]interface{}{
		"online":    1,
		"last_seen": time.Now().Unix(),
	}
	s.redisClient.HSet(key, value)
	s.redisClient.Expire(key, onlineTTL)
}

func (s *Server) setPlayerOffline(playerID string) {
	key := playerOnlineKey + playerID
	s.redisClient.Del(key)

	roomID, _ := s.redisClient.Get(playerRoomKey + playerID)
	if roomID != "" {
		event := map[string]interface{}{
			"event_type": "player_disconnected",
			"player_id":  playerID,
			"room_id":    roomID,
			"timestamp":  time.Now().Unix(),
		}
		data, _ := json.Marshal(event)
		s.redisClient.Publish("room:events", string(data))
	}
}

func (s *Server) subscribeToRedis() {
	ctx := context.Background()
	channels := []string{"match:found:*", "game:*", "player:game:*"}
	
	for _, pattern := range channels {
		go func(p string) {
			pubsub := s.redisClient.Subscribe(p)
			defer pubsub.Close()

			for msg := range pubsub.Channel() {
				s.broadcastToClients(msg.Channel, []byte(msg.Payload))
			}
		}(pattern)
	}
}

func (s *Server) broadcastToClients(channel string, message []byte) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for client := range s.clients {
		if s.shouldSendToClient(client, channel) {
			select {
			case client.send <- message:
			default:
				close(client.send)
				delete(s.clients, client)
			}
		}
	}
}

func (s *Server) shouldSendToClient(client *Client, channel string) bool {
	if len(channel) > 11 && channel[:11] == "match:found:" {
		return channel[11:] == client.playerID
	}

	if len(channel) > 14 && channel[:14] == "player:game:" {
		return channel[14:] == client.playerID
	}

	return true
}

func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	playerID := r.URL.Query().Get("player_id")
	if playerID == "" {
		http.Error(w, "Missing player_id", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{
		conn:     conn,
		server:   s,
		playerID: playerID,
		send:     make(chan []byte, 256),
	}

	s.register <- client

	go client.writePump()
	go client.readPump()

	welcomeMsg := map[string]interface{}{
		"type":    "connected",
		"message": "WebSocket connected",
	}
	data, _ := json.Marshal(welcomeMsg)
	client.send <- data
}

func (c *Client) readPump() {
	defer func() {
		c.server.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			break
		}

		c.handleMessage(message)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(rawMessage []byte) {
	var msg Message
	if err := json.Unmarshal(rawMessage, &msg); err != nil {
		log.Printf("Invalid message format: %v", err)
		return
	}

	switch msg.Type {
	case "ping":
		c.sendPong()
	case "heartbeat":
		c.handleHeartbeat()
	case "room_join":
		var payload struct {
			RoomID string `json:"room_id"`
		}
		if err := json.Unmarshal(msg.Payload, &payload); err == nil && payload.RoomID != "" {
			c.handleRoomJoin(payload.RoomID)
		}
	case "room_leave":
		c.handleRoomLeave()
	default:
		c.forwardToGameServer(msg)
	}
}

func (c *Client) handleRoomLeave() {
	roomID, err := c.server.redisClient.Get(playerRoomKey + c.playerID)
	if err == nil && roomID != "" {
		c.server.redisClient.Del(playerRoomKey + c.playerID)
		event := map[string]interface{}{
			"event_type": "player_left_room",
			"player_id":  c.playerID,
			"room_id":    roomID,
			"timestamp":  time.Now().Unix(),
		}
		data, _ := json.Marshal(event)
		c.server.redisClient.Publish("room:events", string(data))
	}
}

func (c *Client) sendPong() {
	response := map[string]interface{}{
		"type": "pong",
		"time": time.Now().Unix(),
	}
	data, _ := json.Marshal(response)
	c.send <- data
}

func (c *Client) handleHeartbeat() {
	c.server.renewPlayerOnline(c.playerID)
	response := map[string]interface{}{
		"type":      "heartbeat_ack",
		"player_id": c.playerID,
		"timestamp": time.Now().Unix(),
	}
	data, _ := json.Marshal(response)
	c.send <- data
}

func (c *Client) handleRoomJoin(roomID string) {
	c.server.redisClient.Set(playerRoomKey+c.playerID, roomID, 24*time.Hour)
	c.server.renewPlayerOnline(c.playerID)
}

func (s *Server) renewPlayerOnline(playerID string) {
	key := playerOnlineKey + playerID
	value := map[string]interface{}{
		"online":    1,
		"last_seen": time.Now().Unix(),
	}
	s.redisClient.HSet(key, value)
	s.redisClient.Expire(key, onlineTTL)
}

func (c *Client) forwardToGameServer(msg Message) {
	channel := "client:message:" + c.playerID
	messageWithPlayer := map[string]interface{}{
		"type":      msg.Type,
		"payload":   msg.Payload,
		"player_id": c.playerID,
		"timestamp": time.Now().Unix(),
	}
	data, _ := json.Marshal(messageWithPlayer)
	c.server.redisClient.Publish(channel, string(data))
}
