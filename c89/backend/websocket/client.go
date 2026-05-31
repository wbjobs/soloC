package websocket

import (
	"encoding/json"
	"net/http"
	"space-drone-game/backend/game"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	playerID string
}

type Message struct {
	Type   string      `json:"type"`
	Data   interface{} `json:"data"`
}

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	
	client := &Client{
		hub:  hub,
		conn: conn,
		send: make(chan []byte, 256),
	}
	
	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
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
			break
		}
		
		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}
		
		c.handleMessage(msg)
	}
}

func (c *Client) handleMessage(msg Message) {
	switch msg.Type {
	case "join":
		data := msg.Data.(map[string]interface{})
		name := data["name"].(string)
		player := c.hub.gameManager.AddPlayer(name)
		c.playerID = player.ID
		
		response, _ := json.Marshal(map[string]interface{}{
		"type":    "joined",
		"player":  player,
		"playerId": player.ID,
	})
	c.send <- response
	
case "move":
		data := msg.Data.(map[string]interface{})
		target := game.Vector3{
			X: data["x"].(float64),
			Y: data["y"].(float64),
			Z: data["z"].(float64),
		}
		c.hub.gameManager.MoveDrone(c.playerID, target)
		c.hub.BroadcastState()
		
	case "getHistory":
		state := c.hub.gameManager.GetState()
		response, _ := json.Marshal(map[string]interface{}{
			"type":    "history",
			"history": state.History,
		})
		c.send <- response
		
	case "addTestDrone":
		c.hub.gameManager.AddTestDrone()
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
			
			c.conn.WriteMessage(websocket.TextMessage, message)
			
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
