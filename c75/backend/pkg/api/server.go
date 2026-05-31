package api

import (
	"database/sql"
	"net/http"
	"plc-gateway/pkg/database"
	"plc-gateway/pkg/gateway"
	"plc-gateway/pkg/modbus"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Server struct {
	addr         string
	router       *gin.Engine
	modbusServer *modbus.Server
	db           *sql.DB
	gateway      *gateway.Gateway
	clients      map[*websocket.Conn]bool
	clientsMu    sync.RWMutex
}

func NewServer(addr string, modbusServer *modbus.Server, db *sql.DB, gateway *gateway.Gateway) *Server {
	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()

	server := &Server{
		addr:         addr,
		router:       router,
		modbusServer: modbusServer,
		db:           db,
		gateway:      gateway,
		clients:      make(map[*websocket.Conn]bool),
	}

	server.setupRoutes()
	return server
}

func (s *Server) setupRoutes() {
	s.router.StaticFS("/", http.Dir("../../frontend/public"))

	api := s.router.Group("/api")
	{
		api.GET("/registers", s.getRegisters)
		api.GET("/registers/:index", s.getRegister)
		api.POST("/registers/:index", s.writeRegister)

		api.GET("/logs", s.getLogs)
		api.GET("/logs/:id", s.getLogByID)

		api.POST("/ladder/compile", s.compileLadder)
		api.POST("/ladder/download", s.downloadLadderBinary)

		api.GET("/ws", s.handleWebSocket)
	}
}

func (s *Server) getRegisters(c *gin.Context) {
	values, _ := s.modbusServer.BatchReadRegisters(0, 100)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    values,
	})
}

func (s *Server) getRegister(c *gin.Context) {
	indexStr := c.Param("index")
	index, err := strconv.Atoi(indexStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "invalid register index",
		})
		return
	}

	if index < 0 || index >= 100 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "register index out of range",
		})
		return
	}

	value := s.modbusServer.GetRegister(index)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"index": index,
			"value": value,
		},
	})
}

func (s *Server) writeRegister(c *gin.Context) {
	indexStr := c.Param("index")
	index, err := strconv.Atoi(indexStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "invalid register index",
		})
		return
	}

	var body struct {
		Value uint16 `json:"value" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "invalid request body",
		})
		return
	}

	if err := s.gateway.ManualWrite(index, body.Value); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "register written successfully",
	})
}

func (s *Server) getLogs(c *gin.Context) {
	direction := c.Query("direction")
	registerStr := c.Query("register")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	limitStr := c.Query("limit")
	offsetStr := c.Query("offset")

	var register *int
	if registerStr != "" {
		r, err := strconv.Atoi(registerStr)
		if err == nil && r >= 0 && r < 100 {
			register = &r
		}
	}

	startTime := time.Now().Add(-24 * time.Hour)
	if startTimeStr != "" {
		if t, err := time.Parse(time.RFC3339, startTimeStr); err == nil {
			startTime = t
		}
	}

	endTime := time.Now()
	if endTimeStr != "" {
		if t, err := time.Parse(time.RFC3339, endTimeStr); err == nil {
			endTime = t
		}
	}

	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	offset := 0
	if offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	logs, total, err := database.GetLogs(s.db, direction, register, startTime, endTime, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    logs,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}

func (s *Server) getLogByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "invalid log ID",
		})
		return
	}

	log, err := database.GetLogByID(s.db, id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "log not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    log,
	})
}

func (s *Server) handleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	s.clientsMu.Lock()
	s.clients[conn] = true
	s.clientsMu.Unlock()

	defer func() {
		s.clientsMu.Lock()
		delete(s.clients, conn)
		s.clientsMu.Unlock()
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (s *Server) broadcastData() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		values, _ := s.modbusServer.BatchReadRegisters(0, 100)
		message := gin.H{
			"type": "registers",
			"data": values,
		}

		s.clientsMu.RLock()
		for client := range s.clients {
			client.SetWriteDeadline(time.Now().Add(1 * time.Second))
			client.WriteJSON(message)
		}
		s.clientsMu.RUnlock()
	}
}

func (s *Server) Start() error {
	go s.broadcastData()
	return s.router.Run(s.addr)
}

type LadderElement struct {
	Type    string `json:"type"`
	Address string `json:"address"`
	Preset  uint32 `json:"preset"`
}

type LadderRung struct {
	Elements []LadderElement `json:"elements"`
}

type LadderData struct {
	Rungs   []LadderRung `json:"rungs"`
	Version string       `json:"version"`
}

type Instruction struct {
	Opcode  uint8  `json:"opcode"`
	Type    string `json:"type"`
	Address string `json:"address"`
	Preset  uint32 `json:"preset"`
	Rung    int    `json:"rung"`
}

var opcodeMap = map[string]uint8{
	"contact-no": 0x01,
	"contact-nc": 0x02,
	"coil":       0x03,
	"coil-not":   0x04,
	"timer-on":   0x05,
	"counter":    0x06,
	"parallel":   0x07,
}

func (s *Server) compileLadder(c *gin.Context) {
	var data LadderData
	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "invalid ladder data format",
		})
		return
	}

	var instructions []Instruction
	var hasErrors bool

	for rungIndex, rung := range data.Rungs {
		if len(rung.Elements) == 0 {
			continue
		}

		lastElement := rung.Elements[len(rung.Elements)-1]
		if !isOutputType(lastElement.Type) {
			hasErrors = true
		}

		for _, el := range rung.Elements {
			opcode := opcodeMap[el.Type]
			if opcode == 0 {
				opcode = 0x00
			}
			instructions = append(instructions, Instruction{
				Opcode:  opcode,
				Type:    el.Type,
				Address: el.Address,
				Preset:  el.Preset,
				Rung:    rungIndex,
			})
		}

		instructions = append(instructions, Instruction{
			Opcode: 0xFF,
			Type:   "rung-end",
			Rung:   rungIndex,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      !hasErrors,
		"instructions": instructions,
		"count":        len(instructions),
	})
}

func isOutputType(typeStr string) bool {
	return typeStr == "coil" || typeStr == "coil-not" || 
		typeStr == "timer-on" || typeStr == "counter"
}

func (s *Server) downloadLadderBinary(c *gin.Context) {
	var data LadderData
	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "invalid ladder data format",
		})
		return
	}

	binary := generatePLCBinary(data)
	filename := fmt.Sprintf("ladder_%s.plp", time.Now().Format("20060102"))

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Data(http.StatusOK, "application/octet-stream", binary)
}

func generatePLCBinary(data LadderData) []byte {
	buffer := make([]byte, 1024)

	buffer[0] = 0x4C
	buffer[1] = 0x44
	buffer[2] = 0x50
	buffer[3] = 0x4C

	buffer[4] = 0x01
	buffer[5] = 0x00

	instructionCount := uint32(0)
	for _, rung := range data.Rungs {
		instructionCount += uint32(len(rung.Elements)) + 1
	}

	buffer[8] = byte(instructionCount)
	buffer[9] = byte(instructionCount >> 8)
	buffer[10] = byte(instructionCount >> 16)
	buffer[11] = byte(instructionCount >> 24)

	offset := 16

	for rungIndex, rung := range data.Rungs {
		for _, el := range rung.Elements {
			if offset+16 > len(buffer) {
				break
			}

			opcode := opcodeMap[el.Type]
			buffer[offset] = opcode
			offset++

			addrBytes := []byte(el.Address)
			for i := 0; i < 8 && i < len(addrBytes); i++ {
				buffer[offset+i] = addrBytes[i]
			}
			offset += 8

			buffer[offset] = byte(el.Preset)
			buffer[offset+1] = byte(el.Preset >> 8)
			buffer[offset+2] = byte(el.Preset >> 16)
			buffer[offset+3] = byte(el.Preset >> 24)
			offset += 4

			buffer[offset] = byte(rungIndex)
			offset++
			buffer[offset] = 0x00
			offset++
		}

		if offset+16 > len(buffer) {
			break
		}

		buffer[offset] = 0xFF
		offset++
		offset += 8
		offset += 4
		buffer[offset] = byte(rungIndex)
		offset++
		buffer[offset] = 0x00
		offset++
	}

	checksum := uint32(0)
	for i := 0; i < len(buffer)-4; i++ {
		checksum += uint32(buffer[i])
	}

	buffer[len(buffer)-4] = byte(checksum)
	buffer[len(buffer)-3] = byte(checksum >> 8)
	buffer[len(buffer)-2] = byte(checksum >> 16)
	buffer[len(buffer)-1] = byte(checksum >> 24)

	return buffer
}
