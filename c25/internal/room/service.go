package room

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	redis_client "cardgame/internal/redis"
	pb "cardgame/proto/room"

	"github.com/google/uuid"
)

const (
	roomPrefix          = "room:"
	roomPlayersPrefix   = "room:players:"
	roomListPrefix      = "rooms:list:"
	matchmakingPrefix   = "matchmaking:"
	roomExpiration      = 24 * time.Hour
	matchmakingInterval = 500 * time.Millisecond
	rankTolerance       = 100
	playerOnlineKey     = "player:online:"
	roomHeartbeatKey   = "room:heartbeat:"
	roomCheckInterval  = 30 * time.Second
	roomIdleTimeout    = 120 * time.Second
)

type MatchmakingPlayer struct {
	PlayerID   string `json:"player_id"`
	PlayerName string `json:"player_name"`
	GameMode   string `json:"game_mode"`
	RankScore  int32  `json:"rank_score"`
	StartTime  int64  `json:"start_time"`
}

type Service struct {
	pb.UnimplementedRoomServiceServer
	redisClient   *redis_client.Client
	mu            sync.Mutex
	matchmakingCh chan *pb.StartMatchmakingRequest
}

func NewService(redisClient *redis_client.Client) *Service {
	s := &Service{
		redisClient:   redisClient,
		matchmakingCh: make(chan *pb.StartMatchmakingRequest, 100),
	}
	go s.runMatchmaking()
	go s.runRoomMonitor()
	go s.subscribeRoomEvents()
	return s
}

func (s *Service) CreateRoom(ctx context.Context, req *pb.CreateRoomRequest) (*pb.CreateRoomResponse, error) {
	roomID := uuid.New().String()
	now := time.Now().Unix()

	maxPlayers := req.MaxPlayers
	if maxPlayers <= 0 || maxPlayers > 4 {
		maxPlayers = 2
	}

	room := &pb.Room{
		RoomId:      roomID,
		HostId:      req.PlayerId,
		HostName:    req.PlayerName,
		PlayerIds:   []string{req.PlayerId},
		PlayerNames: []string{req.PlayerName},
		Status:      pb.RoomStatus_WAITING,
		MaxPlayers:  maxPlayers,
		GameMode:    req.GameMode,
		CreatedAt:   now,
	}

	if err := s.saveRoom(room); err != nil {
		return &pb.CreateRoomResponse{Success: false}, err
	}

	s.updateRoomHeartbeat(roomID)

	listKey := roomListPrefix + req.GameMode
	s.redisClient.LPush(listKey, roomID)
	s.redisClient.Expire(listKey, roomExpiration)

	return &pb.CreateRoomResponse{
		Success: true,
		Room:    room,
	}, nil
}

func (s *Service) JoinRoom(ctx context.Context, req *pb.JoinRoomRequest) (*pb.JoinRoomResponse, error) {
	room, err := s.loadRoom(req.RoomId)
	if err != nil {
		return &pb.JoinRoomResponse{
			Success: false,
			Message: "房间不存在",
		}, err
	}

	if room.Status != pb.RoomStatus_WAITING {
		return &pb.JoinRoomResponse{
			Success: false,
			Message: "房间不可加入",
		}, fmt.Errorf("room not available")
	}

	if len(room.PlayerIds) >= int(room.MaxPlayers) {
		return &pb.JoinRoomResponse{
			Success: false,
			Message: "房间已满",
		}, fmt.Errorf("room is full")
	}

	for _, pid := range room.PlayerIds {
		if pid == req.PlayerId {
			return &pb.JoinRoomResponse{
				Success: false,
				Message: "已在房间中",
			}, fmt.Errorf("already in room")
		}
	}

	room.PlayerIds = append(room.PlayerIds, req.PlayerId)
	room.PlayerNames = append(room.PlayerNames, req.PlayerName)

	if len(room.PlayerIds) >= int(room.MaxPlayers) {
		room.Status = pb.RoomStatus_PLAYING
	}

	if err := s.saveRoom(room); err != nil {
		return &pb.JoinRoomResponse{Success: false}, err
	}

	s.updateRoomHeartbeat(req.RoomId)

	return &pb.JoinRoomResponse{
		Success: true,
		Room:    room,
		Message: "加入成功",
	}, nil
}

func (s *Service) LeaveRoom(ctx context.Context, req *pb.LeaveRoomRequest) (*pb.LeaveRoomResponse, error) {
	room, err := s.loadRoom(req.RoomId)
	if err != nil {
		return &pb.LeaveRoomResponse{
			Success: false,
			Message: "房间不存在",
		}, err
	}

	idx := -1
	for i, pid := range room.PlayerIds {
		if pid == req.PlayerId {
			idx = i
			break
		}
	}

	if idx == -1 {
		return &pb.LeaveRoomResponse{
			Success: false,
			Message: "不在房间中",
		}, fmt.Errorf("not in room")
	}

	room.PlayerIds = append(room.PlayerIds[:idx], room.PlayerIds[idx+1:]...)
	room.PlayerNames = append(room.PlayerNames[:idx], room.PlayerNames[idx+1:]...)

	if len(room.PlayerIds) == 0 {
		s.redisClient.Del(roomPrefix + req.RoomId)
		return &pb.LeaveRoomResponse{
			Success: true,
			Message: "房间已解散",
		}, nil
	}

	if room.HostId == req.PlayerId && len(room.PlayerIds) > 0 {
		room.HostId = room.PlayerIds[0]
		room.HostName = room.PlayerNames[0]
	}

	if err := s.saveRoom(room); err != nil {
		return &pb.LeaveRoomResponse{Success: false}, err
	}

	s.updateRoomHeartbeat(req.RoomId)

	return &pb.LeaveRoomResponse{
		Success: true,
		Message: "已离开房间",
	}, nil
}

func (s *Service) GetRoomInfo(ctx context.Context, req *pb.GetRoomInfoRequest) (*pb.GetRoomInfoResponse, error) {
	room, err := s.loadRoom(req.RoomId)
	if err != nil {
		return &pb.GetRoomInfoResponse{}, err
	}
	return &pb.GetRoomInfoResponse{Room: room}, nil
}

func (s *Service) StartMatchmaking(ctx context.Context, req *pb.StartMatchmakingRequest) (*pb.StartMatchmakingResponse, error) {
	matchmakingID := uuid.New().String()
	now := time.Now().Unix()

	player := &MatchmakingPlayer{
		PlayerID:   req.PlayerId,
		PlayerName: req.PlayerName,
		GameMode:   req.GameMode,
		RankScore:  req.RankScore,
		StartTime:  now,
	}

	data, err := json.Marshal(player)
	if err != nil {
		return &pb.StartMatchmakingResponse{Success: false}, err
	}

	key := matchmakingPrefix + req.GameMode + ":" + req.PlayerId
	s.redisClient.Set(key, string(data), 5*time.Minute)

	select {
	case s.matchmakingCh <- req:
	default:
	}

	return &pb.StartMatchmakingResponse{
		Success:       true,
		MatchmakingId: matchmakingID,
		Message:       "已加入匹配队列",
	}, nil
}

func (s *Service) CancelMatchmaking(ctx context.Context, req *pb.CancelMatchmakingRequest) (*pb.CancelMatchmakingResponse, error) {
	gameModes := []string{"1v1", "2v2", "free"}
	for _, mode := range gameModes {
		key := matchmakingPrefix + mode + ":" + req.PlayerId
		if s.redisClient.Exists(key) {
			s.redisClient.Del(key)
			return &pb.CancelMatchmakingResponse{
				Success: true,
				Message: "已取消匹配",
			}, nil
		}
	}

	return &pb.CancelMatchmakingResponse{
		Success: false,
		Message: "未在匹配中",
	}, nil
}

func (s *Service) GetRoomList(ctx context.Context, req *pb.GetRoomListRequest) (*pb.GetRoomListResponse, error) {
	gameMode := req.GameMode
	if gameMode == "" {
		gameMode = "1v1"
	}

	listKey := roomListPrefix + gameMode
	roomIDs, err := s.redisClient.LRange(listKey, 0, -1)
	if err != nil {
		return &pb.GetRoomListResponse{}, err
	}

	var rooms []*pb.Room
	for _, roomID := range roomIDs {
		room, err := s.loadRoom(roomID)
		if err == nil && room.Status == pb.RoomStatus_WAITING {
			rooms = append(rooms, room)
		}
	}

	return &pb.GetRoomListResponse{
		Rooms: rooms,
		Total: int32(len(rooms)),
	}, nil
}

func (s *Service) runMatchmaking() {
	ticker := time.NewTicker(matchmakingInterval)
	defer ticker.Stop()

	for range ticker.C {
		s.tryMatch()
	}
}

func (s *Service) tryMatch() {
	s.mu.Lock()
	defer s.mu.Unlock()

	gameModes := []string{"1v1", "2v2", "free"}
	for _, mode := range gameModes {
		players := s.getMatchmakingPlayers(mode)
		if len(players) >= 2 {
			s.matchPlayers(mode, players[:2])
		}
	}
}

func (s *Service) getMatchmakingPlayers(gameMode string) []*MatchmakingPlayer {
	pattern := matchmakingPrefix + gameMode + ":*"
	var result []*MatchmakingPlayer

	keys, _ := s.redisClient.SMembers("matchmaking_keys")
	for _, key := range keys {
		if strings.HasPrefix(key, matchmakingPrefix+gameMode+":") {
			data, err := s.redisClient.Get(key)
			if err == nil {
				var player MatchmakingPlayer
				if json.Unmarshal([]byte(data), &player) == nil {
					result = append(result, &player)
				}
			}
		}
	}

	if len(result) == 0 {
		return result
	}

	return result
}

func (s *Service) matchPlayers(gameMode string, players []*MatchmakingPlayer) {
	for _, p := range players {
		key := matchmakingPrefix + gameMode + ":" + p.PlayerID
		s.redisClient.Del(key)
	}

	room := &pb.Room{
		RoomId:      uuid.New().String(),
		HostId:      players[0].PlayerID,
		HostName:    players[0].PlayerName,
		PlayerIds:   []string{players[0].PlayerID, players[1].PlayerID},
		PlayerNames: []string{players[0].PlayerName, players[1].PlayerName},
		Status:      pb.RoomStatus_PLAYING,
		MaxPlayers:  2,
		GameMode:    gameMode,
		CreatedAt:   time.Now().Unix(),
	}

	s.saveRoom(room)

	channel := "match:found:" + players[0].PlayerID
	msg, _ := json.Marshal(room)
	s.redisClient.Publish(channel, string(msg))

	channel2 := "match:found:" + players[1].PlayerID
	s.redisClient.Publish(channel2, string(msg))
}

func (s *Service) saveRoom(room *pb.Room) error {
	key := roomPrefix + room.RoomId

	fields := map[string]interface{}{
		"room_id":     room.RoomId,
		"host_id":     room.HostId,
		"host_name":   room.HostName,
		"status":      int32(room.Status),
		"max_players": room.MaxPlayers,
		"game_mode":   room.GameMode,
		"created_at":  room.CreatedAt,
	}

	if err := s.redisClient.HSet(key, fields); err != nil {
		return err
	}

	playersKey := roomPlayersPrefix + room.RoomId
	s.redisClient.Del(playersKey)
	for _, pid := range room.PlayerIds {
		s.redisClient.SAdd(playersKey, pid)
	}

	s.redisClient.Expire(key, roomExpiration)
	s.redisClient.Expire(playersKey, roomExpiration)

	return nil
}

func (s *Service) loadRoom(roomID string) (*pb.Room, error) {
	key := roomPrefix + roomID
	data, err := s.redisClient.HGetAll(key)
	if err != nil || len(data) == 0 {
		return nil, fmt.Errorf("room not found")
	}

	playersKey := roomPlayersPrefix + roomID
	playerIDs, err := s.redisClient.SMembers(playersKey)
	if err != nil {
		playerIDs = []string{}
	}

	status, _ := strconv.Atoi(data["status"])
	maxPlayers, _ := strconv.Atoi(data["max_players"])
	createdAt, _ := strconv.ParseInt(data["created_at"], 10, 64)

	room := &pb.Room{
		RoomId:     data["room_id"],
		HostId:     data["host_id"],
		HostName:   data["host_name"],
		PlayerIds:  playerIDs,
		Status:     pb.RoomStatus(status),
		MaxPlayers: int32(maxPlayers),
		GameMode:   data["game_mode"],
		CreatedAt:  createdAt,
	}

	return room, nil
}

func (s *Service) runRoomMonitor() {
	ticker := time.NewTicker(roomCheckInterval)
	defer ticker.Stop()

	for range ticker.C {
		s.checkRoomsHealth()
	}
}

func (s *Service) checkRoomsHealth() {
	gameModes := []string{"1v1", "2v2", "free"}
	
	for _, mode := range gameModes {
		listKey := roomListPrefix + mode
		roomIDs, err := s.redisClient.LRange(listKey, 0, -1)
		if err != nil {
			continue
		}

		for _, roomID := range roomIDs {
			room, err := s.loadRoom(roomID)
			if err != nil {
				continue
			}

			s.processRoomHealthCheck(room)
		}
	}
}

func (s *Service) processRoomHealthCheck(room *pb.Room) {
	if room.Status == pb.RoomStatus_FINISHED {
		return
	}

	now := time.Now().Unix()
	heartbeatKey := roomHeartbeatKey + room.RoomId
	lastHeartbeat, _ := s.redisClient.Get(heartbeatKey)
	
	var lastHeartbeatTime int64
	if lastHeartbeat != "" {
		lastHeartbeatTime, _ = strconv.ParseInt(lastHeartbeat, 10, 64)
	} else {
		lastHeartbeatTime = room.CreatedAt
	}

	idleDuration := time.Duration(now-lastHeartbeatTime) * time.Second
	if idleDuration >= roomIdleTimeout {
		s.disbandRoom(room, "房间超时无心跳")
		return
	}

	onlinePlayers := make([]string, 0)
	for _, playerID := range room.PlayerIds {
		if s.isPlayerOnline(playerID) {
			onlinePlayers = append(onlinePlayers, playerID)
		}
	}

	offlineCount := len(room.PlayerIds) - len(onlinePlayers)
	if offlineCount > 0 {
		s.removeOfflinePlayers(room, onlinePlayers)
	}
}

func (s *Service) isPlayerOnline(playerID string) bool {
	key := playerOnlineKey + playerID
	exists := s.redisClient.Exists(key)
	if !exists {
		return false
	}

	data, err := s.redisClient.HGetAll(key)
	if err != nil || len(data) == 0 {
		return false
	}

	lastSeen, _ := strconv.ParseInt(data["last_seen"], 10, 64)
	now := time.Now().Unix()
	return (now - lastSeen) < int64(90)
}

func (s *Service) removeOfflinePlayers(room *pb.Room, onlinePlayers []string) {
	if len(onlinePlayers) == 0 {
		s.disbandRoom(room, "所有玩家已离线")
		return
	}

	removed := false
	for i := len(room.PlayerIds) - 1; i >= 0; i-- {
		playerID := room.PlayerIds[i]
		isOnline := false
		for _, onlineID := range onlinePlayers {
			if onlineID == playerID {
				isOnline = true
				break
			}
		}
		if !isOnline {
			room.PlayerIds = append(room.PlayerIds[:i], room.PlayerIds[i+1:]...)
			room.PlayerNames = append(room.PlayerNames[:i], room.PlayerNames[i+1:]...)
			removed = true
		}
	}

	if !removed {
		return
	}

	if len(room.PlayerIds) == 0 {
		s.disbandRoom(room, "所有玩家已离线")
		return
	}

	if room.HostId != onlinePlayers[0] {
		room.HostId = room.PlayerIds[0]
		room.HostName = room.PlayerNames[0]
	}

	if len(room.PlayerIds) < 2 && room.Status == pb.RoomStatus_PLAYING {
		s.forceEndRoom(room, "玩家不足，游戏结束")
		return
	}

	s.saveRoom(room)

	event := map[string]interface{}{
		"event_type":  "room_updated",
		"room_id":     room.RoomId,
		"room":        room,
		"timestamp":   time.Now().Unix(),
	}
	data, _ := json.Marshal(event)
	s.redisClient.Publish("room:events", string(data))
}

func (s *Service) disbandRoom(room *pb.Room, reason string) {
	s.redisClient.Del(roomPrefix + room.RoomId)
	s.redisClient.Del(roomPlayersPrefix + room.RoomId)
	s.redisClient.Del(roomHeartbeatKey + room.RoomId)

	listKey := roomListPrefix + room.GameMode
	s.redisClient.LPush(listKey, "")

	event := map[string]interface{}{
		"event_type":  "room_disbanded",
		"room_id":     room.RoomId,
		"reason":      reason,
		"timestamp":   time.Now().Unix(),
	}
	data, _ := json.Marshal(event)
	s.redisClient.Publish("room:events", string(data))
	s.redisClient.Publish("room:"+room.RoomId+":events", string(data))
}

func (s *Service) forceEndRoom(room *pb.Room, reason string) {
	room.Status = pb.RoomStatus_FINISHED
	s.saveRoom(room)

	event := map[string]interface{}{
		"event_type":  "room_ended",
		"room_id":     room.RoomId,
		"room":        room,
		"reason":      reason,
		"timestamp":   time.Now().Unix(),
	}
	data, _ := json.Marshal(event)
	s.redisClient.Publish("room:events", string(data))
	s.redisClient.Publish("room:"+room.RoomId+":events", string(data))
}

func (s *Service) subscribeRoomEvents() {
	pubsub := s.redisClient.Subscribe("room:events")
	defer pubsub.Close()

	for msg := range pubsub.Channel() {
		s.handleRoomEvent(msg.Payload)
	}
}

func (s *Service) handleRoomEvent(payload string) {
	var event map[string]interface{}
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		return
	}

	eventType, _ := event["event_type"].(string)
	switch eventType {
	case "player_disconnected":
		s.handlePlayerDisconnected(event)
	case "player_left_room":
		s.handlePlayerLeftRoom(event)
	}
}

func (s *Service) handlePlayerDisconnected(event map[string]interface{}) {
	roomID, _ := event["room_id"].(string)
	playerID, _ := event["player_id"].(string)

	if roomID == "" || playerID == "" {
		return
	}

	room, err := s.loadRoom(roomID)
	if err != nil {
		return
	}

	idx := -1
	for i, pid := range room.PlayerIds {
		if pid == playerID {
			idx = i
			break
		}
	}

	if idx == -1 {
		return
	}

	room.PlayerIds = append(room.PlayerIds[:idx], room.PlayerIds[idx+1:]...)
	room.PlayerNames = append(room.PlayerNames[:idx], room.PlayerNames[idx+1:]...)

	if len(room.PlayerIds) == 0 {
		s.disbandRoom(room, "所有玩家已离线")
		return
	}

	if room.HostId == playerID && len(room.PlayerIds) > 0 {
		room.HostId = room.PlayerIds[0]
		room.HostName = room.PlayerNames[0]
	}

	if len(room.PlayerIds) < 2 && room.Status == pb.RoomStatus_PLAYING {
		s.forceEndRoom(room, "玩家不足，游戏结束")
		return
	}

	s.saveRoom(room)

	updateEvent := map[string]interface{}{
		"event_type":  "room_updated",
		"room_id":     room.RoomId,
		"room":        room,
		"timestamp":   time.Now().Unix(),
	}
	data, _ := json.Marshal(updateEvent)
	s.redisClient.Publish("room:"+room.RoomId+":events", string(data))
}

func (s *Service) handlePlayerLeftRoom(event map[string]interface{}) {
	roomID, _ := event["room_id"].(string)
	playerID, _ := event["player_id"].(string)

	if roomID == "" || playerID == "" {
		return
	}

	room, err := s.loadRoom(roomID)
	if err != nil {
		return
	}

	idx := -1
	for i, pid := range room.PlayerIds {
		if pid == playerID {
			idx = i
			break
		}
	}

	if idx == -1 {
		return
	}

	room.PlayerIds = append(room.PlayerIds[:idx], room.PlayerIds[idx+1:]...)
	room.PlayerNames = append(room.PlayerNames[:idx], room.PlayerNames[idx+1:]...)

	if len(room.PlayerIds) == 0 {
		s.disbandRoom(room, "所有玩家已离开")
		return
	}

	if room.HostId == playerID && len(room.PlayerIds) > 0 {
		room.HostId = room.PlayerIds[0]
		room.HostName = room.PlayerNames[0]
	}

	s.saveRoom(room)

	updateEvent := map[string]interface{}{
		"event_type":  "room_updated",
		"room_id":     room.RoomId,
		"room":        room,
		"timestamp":   time.Now().Unix(),
	}
	data, _ := json.Marshal(updateEvent)
	s.redisClient.Publish("room:"+room.RoomId+":events", string(data))
}

func (s *Service) updateRoomHeartbeat(roomID string) {
	heartbeatKey := roomHeartbeatKey + roomID
	now := time.Now().Unix()
	s.redisClient.Set(heartbeatKey, strconv.FormatInt(now, 10), 5*time.Minute)
}
