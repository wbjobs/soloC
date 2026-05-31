package game

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"time"

	"cardgame/internal/card"
	redis_client "cardgame/internal/redis"
	pb "cardgame/proto/game"

	"github.com/google/uuid"
)

const (
	gamePrefix       = "game:"
	gameLockPrefix   = "lock:game:"
	gameStateExpire  = 1 * time.Hour
	initialHandSize  = 5
	maxHandSize      = 10
	defaultMaxTurns  = 10
	baseRankChange   = 25
	lockTTL         = 5 * time.Second
)

type Service struct {
	pb.UnimplementedGameServiceServer
	redisClient        *redis_client.Client
	replayLogger       *ReplayLogger
	antiCheatValidator *AntiCheatValidator
}

func NewService(redisClient *redis_client.Client) *Service {
	return &Service{
		redisClient:        redisClient,
		replayLogger:       NewReplayLogger(redisClient),
		antiCheatValidator: NewAntiCheatValidator(redisClient),
	}
}

func (s *Service) StartGame(ctx context.Context, req *pb.StartGameRequest) (*pb.StartGameResponse, error) {
	lockKey := "lock:room:game:" + req.RoomId

	var result *pb.StartGameResponse
	var opErr error

	err := s.redisClient.WithLock(lockKey, lockTTL, func() error {
		if len(req.PlayerIds) < 2 {
			result = &pb.StartGameResponse{
				Success: false,
				Message: "至少需要2名玩家",
			}
			opErr = fmt.Errorf("not enough players")
			return nil
		}

		roomGameKey := "room:active_game:" + req.RoomId
		existingGameID, _ := s.redisClient.Get(roomGameKey)
		if existingGameID != "" {
			result = &pb.StartGameResponse{
				Success: false,
				Message: "该房间已有游戏进行中",
			}
			opErr = fmt.Errorf("game already running in room")
			return nil
		}

		gameID := uuid.New().String()
		now := time.Now().Unix()

		maxTurns := req.MaxTurns
		if maxTurns <= 0 {
			maxTurns = defaultMaxTurns
		}

		rand.Seed(time.Now().UnixNano())
		shuffledPlayers := make([]string, len(req.PlayerIds))
		copy(shuffledPlayers, req.PlayerIds)
		rand.Shuffle(len(shuffledPlayers), func(i, j int) {
			shuffledPlayers[i], shuffledPlayers[j] = shuffledPlayers[j], shuffledPlayers[i]
		})

		playerHands := make(map[string]*pb.PlayerHand)
		playerFields := make(map[string]*pb.PlayerField)
		playerScores := make(map[string]int32)

		for _, playerID := range shuffledPlayers {
			cards := s.dealCards(initialHandSize)
			playerHands[playerID] = &pb.PlayerHand{
				PlayerId: playerID,
				Cards:    cards,
			}
			playerFields[playerID] = &pb.PlayerField{
				PlayerId: playerID,
				Cards:    []*pb.GameCard{},
			}
			playerScores[playerID] = 0
		}

		gameState := &pb.GameState{
			GameId:         gameID,
			RoomId:         req.RoomId,
			Phase:          pb.GamePhase_PLAY,
			CurrentTurn:    1,
			CurrentPlayerId: shuffledPlayers[0],
			PlayerIds:      shuffledPlayers,
			PlayerHands:    playerHands,
			PlayerFields:   playerFields,
			PlayerScores:   playerScores,
			MaxTurns:       maxTurns,
			WinnerId:       "",
			StartTime:      now,
			EndTime:        0,
		}

		if err := s.saveGameState(gameState); err != nil {
			result = &pb.StartGameResponse{Success: false}
			opErr = err
			return nil
		}

		s.redisClient.Set(roomGameKey, gameID, 2*time.Hour)

		startLog := s.replayLogger.CreateStartGameLog(
			gameID,
			req.RoomId,
			shuffledPlayers,
			map[string]interface{}{
				"max_turns": maxTurns,
				"start_time": now,
			},
		)
		s.replayLogger.LogOperation(gameID, startLog)

		for _, playerID := range shuffledPlayers {
			dealLog := s.replayLogger.CreateCardDealLog(
				playerID,
				playerHands[playerID].Cards,
				1,
			)
			s.replayLogger.LogOperation(gameID, dealLog)
		}

		s.publishGameEvent(gameState, "game_started")

		result = &pb.StartGameResponse{
			Success:   true,
			GameState: gameState,
			Message:   "游戏开始",
		}
		opErr = nil
		return nil
	})

	if err != nil {
		return &pb.StartGameResponse{
			Success: false,
			Message: "获取房间锁失败，请稍后重试",
		}, err
	}

	if opErr != nil {
		return result, opErr
	}

	return result, nil
}

func (s *Service) PlayCard(ctx context.Context, req *pb.PlayCardRequest) (*pb.PlayCardResponse, error) {
	lockKey := gameLockPrefix + req.GameId

	var result *pb.PlayCardResponse
	var opErr error

	err := s.redisClient.WithLock(lockKey, lockTTL, func() error {
		gameState, err := s.loadGameState(req.GameId)
		if err != nil {
			result = &pb.PlayCardResponse{
				Success: false,
				Message: "游戏不存在",
			}
			opErr = err
			return nil
		}

		if err := s.antiCheatValidator.ValidatePlayCard(gameState, req.PlayerId, req.CardInstanceId); err != nil {
			result = &pb.PlayCardResponse{
				Success: false,
				Message: "非法操作",
			}
			opErr = err
			return nil
		}

		hand := gameState.PlayerHands[req.PlayerId]

		var playedCard *pb.GameCard
		cardIndex := -1
		for i, c := range hand.Cards {
			if c.InstanceId == req.CardInstanceId {
				playedCard = c
				cardIndex = i
				break
			}
		}

		hand.Cards = append(hand.Cards[:cardIndex], hand.Cards[cardIndex+1:]...)

		field := gameState.PlayerFields[req.PlayerId]
		if field == nil {
			field = &pb.PlayerField{PlayerId: req.PlayerId}
			gameState.PlayerFields[req.PlayerId] = field
		}
		field.Cards = append(field.Cards, playedCard)

		s.calculateBattle(gameState, req.PlayerId, req.TargetPlayerId, playedCard)

		playLog := s.replayLogger.CreatePlayCardLog(
			req.PlayerId,
			req.CardInstanceId,
			req.TargetPlayerId,
			gameState.CurrentTurn,
			playedCard,
		)
		s.replayLogger.LogOperation(req.GameId, playLog)

		if err := s.saveGameState(gameState); err != nil {
			result = &pb.PlayCardResponse{Success: false}
			opErr = err
			return nil
		}

		s.publishGameEvent(gameState, "card_played")

		result = &pb.PlayCardResponse{
			Success:   true,
			GameState: gameState,
			Message:   "出牌成功",
		}
		opErr = nil
		return nil
	})

	if err != nil {
		return &pb.PlayCardResponse{
			Success: false,
			Message: "获取游戏锁失败，请稍后重试",
		}, err
	}

	if opErr != nil {
		return result, opErr
	}

	return result, nil
}

func (s *Service) EndTurn(ctx context.Context, req *pb.EndTurnRequest) (*pb.EndTurnResponse, error) {
	lockKey := gameLockPrefix + req.GameId

	var result *pb.EndTurnResponse
	var opErr error

	err := s.redisClient.WithLock(lockKey, lockTTL, func() error {
		gameState, err := s.loadGameState(req.GameId)
		if err != nil {
			result = &pb.EndTurnResponse{
				Success: false,
				Message: "游戏不存在",
			}
			opErr = err
			return nil
		}

		if err := s.antiCheatValidator.ValidateEndTurn(gameState, req.PlayerId); err != nil {
			result = &pb.EndTurnResponse{
				Success: false,
				Message: "非法操作",
			}
			opErr = err
			return nil
		}

		currentIndex := -1
		for i, pid := range gameState.PlayerIds {
			if pid == req.PlayerId {
				currentIndex = i
				break
			}
		}

		nextIndex := (currentIndex + 1) % len(gameState.PlayerIds)
		nextPlayerID := gameState.PlayerIds[nextIndex]

		endTurnLog := s.replayLogger.CreateEndTurnLog(
			req.PlayerId,
			gameState.CurrentTurn,
			nextPlayerID,
		)
		s.replayLogger.LogOperation(req.GameId, endTurnLog)

		if nextIndex == 0 {
			gameState.CurrentTurn++

			if gameState.CurrentTurn > gameState.MaxTurns {
				s.endGame(gameState)

				endLog := s.replayLogger.CreateGameEndLog(
					gameState.WinnerId,
					gameState.PlayerScores,
					gameState.CurrentTurn,
				)
				s.replayLogger.LogOperation(req.GameId, endLog)

				if err := s.saveGameState(gameState); err != nil {
					result = &pb.EndTurnResponse{Success: false}
					opErr = err
					return nil
				}
				s.publishGameEvent(gameState, "game_ended")
				result = &pb.EndTurnResponse{
					Success:   true,
					GameState: gameState,
					Message:   "游戏结束",
				}
				opErr = nil
				return nil
			}

			for _, pid := range gameState.PlayerIds {
				hand := gameState.PlayerHands[pid]
				if hand != nil && len(hand.Cards) < maxHandSize {
					newCards := s.dealCards(1)
					hand.Cards = append(hand.Cards, newCards...)

					dealLog := s.replayLogger.CreateCardDealLog(
						pid,
						newCards,
						gameState.CurrentTurn,
					)
					s.replayLogger.LogOperation(req.GameId, dealLog)
				}
			}
		}

		gameState.CurrentPlayerId = nextPlayerID

		if err := s.saveGameState(gameState); err != nil {
			result = &pb.EndTurnResponse{Success: false}
			opErr = err
			return nil
		}

		s.publishGameEvent(gameState, "turn_ended")

		result = &pb.EndTurnResponse{
			Success:   true,
			GameState: gameState,
			Message:   "回合结束",
		}
		opErr = nil
		return nil
	})

	if err != nil {
		return &pb.EndTurnResponse{
			Success: false,
			Message: "获取游戏锁失败，请稍后重试",
		}, err
	}

	if opErr != nil {
		return result, opErr
	}

	return result, nil
}

func (s *Service) GetGameState(ctx context.Context, req *pb.GetGameStateRequest) (*pb.GetGameStateResponse, error) {
	gameState, err := s.loadGameState(req.GameId)
	if err != nil {
		return &pb.GetGameStateResponse{Success: false}, err
	}

	publicState := &pb.GameState{
		GameId:         gameState.GameId,
		RoomId:         gameState.RoomId,
		Phase:          gameState.Phase,
		CurrentTurn:    gameState.CurrentTurn,
		CurrentPlayerId: gameState.CurrentPlayerId,
		PlayerIds:      gameState.PlayerIds,
		PlayerFields:   gameState.PlayerFields,
		PlayerScores:   gameState.PlayerScores,
		MaxTurns:       gameState.MaxTurns,
		WinnerId:       gameState.WinnerId,
		StartTime:      gameState.StartTime,
		EndTime:        gameState.EndTime,
	}

	publicState.PlayerHands = make(map[string]*pb.PlayerHand)
	for pid, hand := range gameState.PlayerHands {
		if pid == req.PlayerId {
			publicState.PlayerHands[pid] = hand
		} else {
			publicState.PlayerHands[pid] = &pb.PlayerHand{
				PlayerId: pid,
				Cards:    make([]*pb.GameCard, len(hand.Cards)),
			}
		}
	}

	return &pb.GetGameStateResponse{
		Success:   true,
		GameState: publicState,
	}, nil
}

func (s *Service) SurrenderGame(ctx context.Context, req *pb.SurrenderGameRequest) (*pb.SurrenderGameResponse, error) {
	lockKey := gameLockPrefix + req.GameId

	var result *pb.SurrenderGameResponse
	var opErr error

	err := s.redisClient.WithLock(lockKey, lockTTL, func() error {
		gameState, err := s.loadGameState(req.GameId)
		if err != nil {
			result = &pb.SurrenderGameResponse{
				Success: false,
				Message: "游戏不存在",
			}
			opErr = err
			return nil
		}

		if err := s.antiCheatValidator.ValidateSurrender(gameState, req.PlayerId); err != nil {
			result = &pb.SurrenderGameResponse{
				Success: false,
				Message: "非法操作",
			}
			opErr = err
			return nil
		}

		var winnerID string
		for _, pid := range gameState.PlayerIds {
			if pid != req.PlayerId {
				winnerID = pid
				break
			}
		}

		surrenderLog := s.replayLogger.CreateSurrenderLog(
			req.PlayerId,
			winnerID,
			gameState.CurrentTurn,
		)
		s.replayLogger.LogOperation(req.GameId, surrenderLog)

		gameState.WinnerId = winnerID
		gameState.Phase = pb.GamePhase_END
		gameState.EndTime = time.Now().Unix()

		endLog := s.replayLogger.CreateGameEndLog(
			winnerID,
			gameState.PlayerScores,
			gameState.CurrentTurn,
		)
		s.replayLogger.LogOperation(req.GameId, endLog)

		for _, pid := range gameState.PlayerIds {
			won := pid == winnerID
			rankChange := CalculateRankChange(0)

			entry := &pb.GameHistoryEntry{
				GameId:     gameState.GameId,
				RoomId:     gameState.RoomId,
				PlayerIds:  gameState.PlayerIds,
				StartTime:  gameState.StartTime,
				EndTime:    gameState.EndTime,
				WinnerId:   winnerID,
				Won:        won,
				RankChange: rankChange,
			}

			s.replayLogger.AddGameToHistory(pid, gameState.GameId, entry)
		}

		if gameState.RoomId != "" {
			roomGameKey := "room:active_game:" + gameState.RoomId
			s.redisClient.Del(roomGameKey)
		}

		if err := s.saveGameState(gameState); err != nil {
			result = &pb.SurrenderGameResponse{Success: false}
			opErr = err
			return nil
		}

		s.publishGameEvent(gameState, "game_ended")

		result = &pb.SurrenderGameResponse{
			Success:  true,
			WinnerId: winnerID,
			Message:  "投降成功",
		}
		opErr = nil
		return nil
	})

	if err != nil {
		return &pb.SurrenderGameResponse{
			Success: false,
			Message: "获取游戏锁失败，请稍后重试",
		}, err
	}

	if opErr != nil {
		return result, opErr
	}

	return result, nil
}

func (s *Service) dealCards(count int) []*pb.GameCard {
	templates := card.GetRandomCardTemplates(count)
	cards := make([]*pb.GameCard, 0, count)

	for _, t := range templates {
		cards = append(cards, &pb.GameCard{
			CardId:      t.CardID,
			InstanceId:  uuid.New().String(),
			Name:        t.Name,
			Attack:      t.Attack,
			Defense:     t.Defense,
			Rarity:      t.Rarity,
			CardType:    t.CardType,
			Description: t.Description,
			Level:       1,
		})
	}

	return cards
}

func (s *Service) calculateBattle(gameState *pb.GameState, attackerID, defenderID string, playedCard *pb.GameCard) {
	if defenderID == "" || attackerID == defenderID {
		return
	}

	defenderField := gameState.PlayerFields[defenderID]
	if defenderField == nil || len(defenderField.Cards) == 0 {
		gameState.PlayerScores[attackerID] += playedCard.Attack
		return
	}

	defenderCard := defenderField.Cards[0]
	damageToDefender := int(playedCard.Attack)
	damageToAttacker := int(defenderCard.Attack)

	attackerField := gameState.PlayerFields[attackerID]
	if attackerField != nil && len(attackerField.Cards) > 0 {
		lastAttackerCard := attackerField.Cards[len(attackerField.Cards)-1]
		if lastAttackerCard.Defense < int32(damageToAttacker) {
			for i, c := range attackerField.Cards {
				if c.InstanceId == lastAttackerCard.InstanceId {
					attackerField.Cards = append(attackerField.Cards[:i], attackerField.Cards[i+1:]...)
					break
				}
			}
			gameState.PlayerScores[defenderID] += int32(damageToAttacker) - lastAttackerCard.Defense
		}
	}

	if defenderCard.Defense < int32(damageToDefender) {
		for i, c := range defenderField.Cards {
			if c.InstanceId == defenderCard.InstanceId {
				defenderField.Cards = append(defenderField.Cards[:i], defenderField.Cards[i+1:]...)
				break
			}
		}
		gameState.PlayerScores[attackerID] += int32(damageToDefender) - defenderCard.Defense
	}
}

func (s *Service) endGame(gameState *pb.GameState) {
	gameState.Phase = pb.GamePhase_END
	gameState.EndTime = time.Now().Unix()

	var winnerID string
	maxScore := int32(-1)

	for pid, score := range gameState.PlayerScores {
		if score > maxScore {
			maxScore = score
			winnerID = pid
		}
	}

	gameState.WinnerId = winnerID

	for _, pid := range gameState.PlayerIds {
		won := pid == winnerID
		rankChange := CalculateRankChange(0)

		entry := &pb.GameHistoryEntry{
			GameId:     gameState.GameId,
			RoomId:     gameState.RoomId,
			PlayerIds:  gameState.PlayerIds,
			StartTime:  gameState.StartTime,
			EndTime:    gameState.EndTime,
			WinnerId:   winnerID,
			Won:        won,
			RankChange: rankChange,
		}

		s.replayLogger.AddGameToHistory(pid, gameState.GameId, entry)
	}

	if gameState.RoomId != "" {
		roomGameKey := "room:active_game:" + gameState.RoomId
		s.redisClient.Del(roomGameKey)
	}
}

func (s *Service) saveGameState(gameState *pb.GameState) error {
	key := gamePrefix + gameState.GameId

	data, err := json.Marshal(gameState)
	if err != nil {
		return err
	}

	return s.redisClient.Set(key, string(data), gameStateExpire)
}

func (s *Service) loadGameState(gameID string) (*pb.GameState, error) {
	key := gamePrefix + gameID
	data, err := s.redisClient.Get(key)
	if err != nil {
		return nil, err
	}

	var gameState pb.GameState
	if err := json.Unmarshal([]byte(data), &gameState); err != nil {
		return nil, err
	}

	return &gameState, nil
}

func (s *Service) publishGameEvent(gameState *pb.GameState, eventType string) {
	event := map[string]interface{}{
		"event_type":   eventType,
		"game_id":      gameState.GameId,
		"game_state":   gameState,
		"timestamp":    time.Now().Unix(),
	}

	data, _ := json.Marshal(event)
	channel := "game:" + gameState.GameId
	s.redisClient.Publish(channel, string(data))

	for _, pid := range gameState.PlayerIds {
		playerChannel := "player:game:" + pid
		s.redisClient.Publish(playerChannel, string(data))
	}
}

func (s *Service) GetGameReplay(ctx context.Context, req *pb.GetGameReplayRequest) (*pb.GetGameReplayResponse, error) {
	replay, err := s.replayLogger.GetReplay(req.GameId)
	if err != nil {
		return &pb.GetGameReplayResponse{
			Success: false,
			Message: "回放不存在",
		}, err
	}

	isParticipant := false
	for _, pid := range replay.PlayerIds {
		if pid == req.PlayerId {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		return &pb.GetGameReplayResponse{
			Success: false,
			Message: "无权查看此回放",
		}, fmt.Errorf("unauthorized")
	}

	return &pb.GetGameReplayResponse{
		Success: true,
		Replay:  replay,
	}, nil
}

func (s *Service) GetPlayerGameHistory(ctx context.Context, req *pb.GetPlayerGameHistoryRequest) (*pb.GetPlayerGameHistoryResponse, error) {
	page := req.Page
	if page <= 0 {
		page = 1
	}

	pageSize := req.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	entries, total, err := s.replayLogger.GetPlayerHistory(req.PlayerId, int(page), int(pageSize))
	if err != nil {
		return &pb.GetPlayerGameHistoryResponse{
			Success: false,
			Total:   0,
		}, err
	}

	return &pb.GetPlayerGameHistoryResponse{
		Success:   true,
		History:   entries,
		Total:     int32(total),
		Page:      page,
		PageSize:  pageSize,
	}, nil
}

func GetBaseRankChange() int32 {
	return baseRankChange
}

func CalculateRankChange(rankDiff int32) int32 {
	if rankDiff > 500 {
		return int32(float64(baseRankChange) * 0.5)
	} else if rankDiff < -500 {
		return int32(float64(baseRankChange) * 1.5)
	}
	return baseRankChange
}
