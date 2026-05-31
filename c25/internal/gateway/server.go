package gateway

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"cardgame/internal/config"

	player_pb "cardgame/proto/player"
	room_pb "cardgame/proto/room"
	game_pb "cardgame/proto/game"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type Server struct {
	playerClient player_pb.PlayerServiceClient
	roomClient   room_pb.RoomServiceClient
	gameClient   game_pb.GameServiceClient
	ctx          context.Context
}

func NewServer(cfg *config.Config) (*Server, error) {
	ctx := context.Background()

	playerConn, err := grpc.Dial(cfg.PlayerPort, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	roomConn, err := grpc.Dial(cfg.RoomPort, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	gameConn, err := grpc.Dial(cfg.GamePort, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	return &Server{
		playerClient: player_pb.NewPlayerServiceClient(playerConn),
		roomClient:   room_pb.NewRoomServiceClient(roomConn),
		gameClient:   game_pb.NewGameServiceClient(gameConn),
		ctx:          ctx,
	}, nil
}

func (s *Server) HandleHealthCheck(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Gateway OK"))
}

type Response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
}

func sendJSON(w http.ResponseWriter, status int, response Response) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(response)
}

func (s *Server) HandleCreatePlayer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	var req struct {
		Username string `json:"username"`
		Avatar   string `json:"avatar"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Invalid request"})
		return
	}

	if req.Username == "" {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Username is required"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	grpcResp, err := s.playerClient.CreatePlayer(ctx, &player_pb.CreatePlayerRequest{
		Username: req.Username,
		Avatar:   req.Avatar,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: grpcResp.Success, Data: grpcResp.Player})
}

func (s *Server) HandleGetPlayerInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	playerID := r.URL.Query().Get("player_id")
	if playerID == "" {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "player_id is required"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.playerClient.GetPlayerInfo(ctx, &player_pb.GetPlayerInfoRequest{PlayerId: playerID})
	if err != nil {
		sendJSON(w, http.StatusNotFound, Response{Success: false, Message: "Player not found"})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: true, Data: resp.Player})
}

func (s *Server) HandleUpdatePlayerInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	var req struct {
		PlayerId string `json:"player_id"`
		Username string `json:"username"`
		Avatar   string `json:"avatar"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Invalid request"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.playerClient.UpdatePlayerInfo(ctx, &player_pb.UpdatePlayerInfoRequest{
		PlayerId: req.PlayerId,
		Username: req.Username,
		Avatar:   req.Avatar,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: resp.Success})
}

func (s *Server) HandleGetPlayerStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	playerID := r.URL.Query().Get("player_id")
	if playerID == "" {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "player_id is required"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.playerClient.GetPlayerStats(ctx, &player_pb.GetPlayerStatsRequest{PlayerId: playerID})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: true, Data: resp.Stats})
}

func (s *Server) HandleGetCardCollection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	playerID := r.URL.Query().Get("player_id")
	if playerID == "" {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "player_id is required"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.playerClient.GetCardCollection(ctx, &player_pb.GetCardCollectionRequest{PlayerId: playerID})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: true, Data: resp.Cards})
}

func (s *Server) HandleCreateRoom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	var req struct {
		PlayerId   string `json:"player_id"`
		PlayerName string `json:"player_name"`
		GameMode   string `json:"game_mode"`
		MaxPlayers int32  `json:"max_players"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Invalid request"})
		return
	}

	if req.GameMode == "" {
		req.GameMode = "1v1"
	}
	if req.MaxPlayers <= 0 {
		req.MaxPlayers = 2
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.roomClient.CreateRoom(ctx, &room_pb.CreateRoomRequest{
		PlayerId:   req.PlayerId,
		PlayerName: req.PlayerName,
		GameMode:   req.GameMode,
		MaxPlayers: req.MaxPlayers,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: resp.Success, Data: resp.Room})
}

func (s *Server) HandleJoinRoom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	var req struct {
		RoomId     string `json:"room_id"`
		PlayerId   string `json:"player_id"`
		PlayerName string `json:"player_name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Invalid request"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.roomClient.JoinRoom(ctx, &room_pb.JoinRoomRequest{
		RoomId:     req.RoomId,
		PlayerId:   req.PlayerId,
		PlayerName: req.PlayerName,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: resp.Success, Data: resp.Room, Message: resp.Message})
}

func (s *Server) HandleLeaveRoom(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	var req struct {
		RoomId   string `json:"room_id"`
		PlayerId string `json:"player_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Invalid request"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.roomClient.LeaveRoom(ctx, &room_pb.LeaveRoomRequest{
		RoomId:   req.RoomId,
		PlayerId: req.PlayerId,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: resp.Success, Message: resp.Message})
}

func (s *Server) HandleGetRoomInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "room_id is required"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.roomClient.GetRoomInfo(ctx, &room_pb.GetRoomInfoRequest{RoomId: roomID})
	if err != nil {
		sendJSON(w, http.StatusNotFound, Response{Success: false, Message: "Room not found"})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: true, Data: resp.Room})
}

func (s *Server) HandleGetRoomList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	gameMode := r.URL.Query().Get("game_mode")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("page_size")

	page := 1
	pageSize := 20
	if pageStr != "" {
		page, _ = strconv.Atoi(pageStr)
	}
	if pageSizeStr != "" {
		pageSize, _ = strconv.Atoi(pageSizeStr)
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.roomClient.GetRoomList(ctx, &room_pb.GetRoomListRequest{
		GameMode: gameMode,
		Page:     int32(page),
		PageSize: int32(pageSize),
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: true, Data: map[string]interface{}{
		"rooms": resp.Rooms,
		"total": resp.Total,
	}})
}

func (s *Server) HandleStartMatchmaking(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	var req struct {
		PlayerId   string `json:"player_id"`
		PlayerName string `json:"player_name"`
		GameMode   string `json:"game_mode"`
		RankScore  int32  `json:"rank_score"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Invalid request"})
		return
	}

	if req.GameMode == "" {
		req.GameMode = "1v1"
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.roomClient.StartMatchmaking(ctx, &room_pb.StartMatchmakingRequest{
		PlayerId:   req.PlayerId,
		PlayerName: req.PlayerName,
		GameMode:   req.GameMode,
		RankScore:  req.RankScore,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{
		Success: resp.Success,
		Data:    map[string]string{"matchmaking_id": resp.MatchmakingId},
		Message: resp.Message,
	})
}

func (s *Server) HandleCancelMatchmaking(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	var req struct {
		PlayerId      string `json:"player_id"`
		MatchmakingId string `json:"matchmaking_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Invalid request"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.roomClient.CancelMatchmaking(ctx, &room_pb.CancelMatchmakingRequest{
		PlayerId:      req.PlayerId,
		MatchmakingId: req.MatchmakingId,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: resp.Success, Message: resp.Message})
}

func (s *Server) HandleStartGame(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	var req struct {
		RoomId     string   `json:"room_id"`
		PlayerIds  []string `json:"player_ids"`
		MaxTurns   int32    `json:"max_turns"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Invalid request"})
		return
	}

	if len(req.PlayerIds) < 2 {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "至少需要2名玩家"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.gameClient.StartGame(ctx, &game_pb.StartGameRequest{
		RoomId:    req.RoomId,
		PlayerIds: req.PlayerIds,
		MaxTurns:  req.MaxTurns,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: resp.Success, Data: resp.GameState, Message: resp.Message})
}

func (s *Server) HandlePlayCard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	var req struct {
		GameId           string `json:"game_id"`
		PlayerId         string `json:"player_id"`
		CardInstanceId   string `json:"card_instance_id"`
		TargetPlayerId   string `json:"target_player_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Invalid request"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.gameClient.PlayCard(ctx, &game_pb.PlayCardRequest{
		GameId:         req.GameId,
		PlayerId:       req.PlayerId,
		CardInstanceId: req.CardInstanceId,
		TargetPlayerId: req.TargetPlayerId,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: resp.Success, Data: resp.GameState, Message: resp.Message})
}

func (s *Server) HandleEndTurn(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	var req struct {
		GameId   string `json:"game_id"`
		PlayerId string `json:"player_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Invalid request"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.gameClient.EndTurn(ctx, &game_pb.EndTurnRequest{
		GameId:   req.GameId,
		PlayerId: req.PlayerId,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: resp.Success, Data: resp.GameState, Message: resp.Message})
}

func (s *Server) HandleGetGameState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	gameID := r.URL.Query().Get("game_id")
	playerID := r.URL.Query().Get("player_id")
	if gameID == "" || playerID == "" {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "game_id and player_id are required"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.gameClient.GetGameState(ctx, &game_pb.GetGameStateRequest{
		GameId:   gameID,
		PlayerId: playerID,
	})
	if err != nil {
		sendJSON(w, http.StatusNotFound, Response{Success: false, Message: "Game not found"})
		return
	}

	sendJSON(w, http.StatusOK, Response{Success: resp.Success, Data: resp.GameState})
}

func (s *Server) HandleSurrender(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	var req struct {
		GameId   string `json:"game_id"`
		PlayerId string `json:"player_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Invalid request"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.gameClient.SurrenderGame(ctx, &game_pb.SurrenderGameRequest{
		GameId:   req.GameId,
		PlayerId: req.PlayerId,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{
		Success: resp.Success,
		Data:    map[string]string{"winner_id": resp.WinnerId},
		Message: resp.Message,
	})
}

func (s *Server) HandleGetGameReplay(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	gameID := r.URL.Query().Get("game_id")
	playerID := r.URL.Query().Get("player_id")

	if gameID == "" || playerID == "" {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Missing required parameters"})
		return
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.gameClient.GetGameReplay(ctx, &game_pb.GetGameReplayRequest{
		GameId:   gameID,
		PlayerId: playerID,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	if !resp.Success {
		sendJSON(w, http.StatusNotFound, Response{Success: false, Message: resp.Message})
		return
	}

	sendJSON(w, http.StatusOK, Response{
		Success: resp.Success,
		Data:    resp.Replay,
		Message: resp.Message,
	})
}

func (s *Server) HandleGetPlayerGameHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendJSON(w, http.StatusMethodNotAllowed, Response{Success: false, Message: "Method not allowed"})
		return
	}

	playerID := r.URL.Query().Get("player_id")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("page_size")

	if playerID == "" {
		sendJSON(w, http.StatusBadRequest, Response{Success: false, Message: "Missing required parameters"})
		return
	}

	page := int32(1)
	if pageStr != "" {
		if p, err := strconv.ParseInt(pageStr, 10, 32); err == nil && p > 0 {
			page = int32(p)
		}
	}

	pageSize := int32(20)
	if pageSizeStr != "" {
		if ps, err := strconv.ParseInt(pageSizeStr, 10, 32); err == nil && ps > 0 {
			pageSize = int32(ps)
		}
	}

	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()

	resp, err := s.gameClient.GetPlayerGameHistory(ctx, &game_pb.GetPlayerGameHistoryRequest{
		PlayerId: playerID,
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, Response{Success: false, Message: err.Error()})
		return
	}

	sendJSON(w, http.StatusOK, Response{
		Success: resp.Success,
		Data: map[string]interface{}{
			"history":   resp.History,
			"total":     resp.Total,
			"page":      resp.Page,
			"page_size": resp.PageSize,
		},
	})
}

func (s *Server) SetupRoutes() {
	http.HandleFunc("/health", s.HandleHealthCheck)

	http.HandleFunc("/api/v1/players/create", s.HandleCreatePlayer)
	http.HandleFunc("/api/v1/players/info", s.HandleGetPlayerInfo)
	http.HandleFunc("/api/v1/players/update", s.HandleUpdatePlayerInfo)
	http.HandleFunc("/api/v1/players/stats", s.HandleGetPlayerStats)
	http.HandleFunc("/api/v1/players/cards", s.HandleGetCardCollection)

	http.HandleFunc("/api/v1/rooms/create", s.HandleCreateRoom)
	http.HandleFunc("/api/v1/rooms/join", s.HandleJoinRoom)
	http.HandleFunc("/api/v1/rooms/leave", s.HandleLeaveRoom)
	http.HandleFunc("/api/v1/rooms/info", s.HandleGetRoomInfo)
	http.HandleFunc("/api/v1/rooms/list", s.HandleGetRoomList)
	http.HandleFunc("/api/v1/rooms/matchmaking/start", s.HandleStartMatchmaking)
	http.HandleFunc("/api/v1/rooms/matchmaking/cancel", s.HandleCancelMatchmaking)

	http.HandleFunc("/api/v1/games/start", s.HandleStartGame)
	http.HandleFunc("/api/v1/games/play", s.HandlePlayCard)
	http.HandleFunc("/api/v1/games/endturn", s.HandleEndTurn)
	http.HandleFunc("/api/v1/games/state", s.HandleGetGameState)
	http.HandleFunc("/api/v1/games/surrender", s.HandleSurrender)

	http.HandleFunc("/api/v1/games/replay", s.HandleGetGameReplay)
	http.HandleFunc("/api/v1/games/history", s.HandleGetPlayerGameHistory)
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("[%s] %s %s", r.Method, r.URL.Path, time.Since(start))
		next.ServeHTTP(w, r)
	})
}

func (s *Server) Start(port string) error {
	s.SetupRoutes()
	log.Printf("Gateway Server starting on port %s...", port)
	return http.ListenAndServe(port, logRequests(enableCORS(http.DefaultServeMux)))
}
