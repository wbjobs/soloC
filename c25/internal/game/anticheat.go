package game

import (
	"encoding/json"
	"fmt"
	"time"

	redis_client "cardgame/internal/redis"
	pb "cardgame/proto/game"
)

const (
	anticheatViolationKey  = "anticheat:violation:"
	anticheatViolationTTL  = 24 * time.Hour
	maxOperationsPerMinute = 60
	maxViolations          = 5
)

type ViolationType string

const (
	ViolationNotYourTurn       ViolationType = "not_your_turn"
	ViolationCardNotInHand     ViolationType = "card_not_in_hand"
	ViolationGameEnded         ViolationType = "game_ended"
	ViolationPlayerNotInGame   ViolationType = "player_not_in_game"
	ViolationTooManyOperations ViolationType = "too_many_operations"
	ViolationInvalidOperation  ViolationType = "invalid_operation"
	ViolationSuspiciousBehavior ViolationType = "suspicious_behavior"
)

type Violation struct {
	GameID        string        `json:"game_id"`
	PlayerID      string        `json:"player_id"`
	ViolationType ViolationType `json:"violation_type"`
	Description   string        `json:"description"`
	Timestamp     int64         `json:"timestamp"`
}

type AntiCheatValidator struct {
	redisClient *redis_client.Client
}

func NewAntiCheatValidator(redisClient *redis_client.Client) *AntiCheatValidator {
	return &AntiCheatValidator{
		redisClient: redisClient,
	}
}

func (a *AntiCheatValidator) ValidatePlayCard(gameState *pb.GameState, playerID, cardInstanceID string) error {
	if err := a.ValidateBasicGameState(gameState, playerID); err != nil {
		return err
	}

	if gameState.CurrentPlayerId != playerID {
		a.RecordViolation(gameState.GameId, playerID, ViolationNotYourTurn,
			fmt.Sprintf("玩家 %s 试图在不属于自己的回合出牌", playerID))
		return fmt.Errorf("not your turn")
	}

	hand, exists := gameState.PlayerHands[playerID]
	if !exists || hand == nil {
		a.RecordViolation(gameState.GameId, playerID, ViolationPlayerNotInGame,
			fmt.Sprintf("玩家 %s 不在游戏中", playerID))
		return fmt.Errorf("player not in game")
	}

	cardFound := false
	for _, card := range hand.Cards {
		if card.InstanceId == cardInstanceID {
			cardFound = true
			break
		}
	}

	if !cardFound {
		a.RecordViolation(gameState.GameId, playerID, ViolationCardNotInHand,
			fmt.Sprintf("玩家 %s 试图使用不在手牌中的卡牌 %s", playerID, cardInstanceID))
		return fmt.Errorf("card not in hand")
	}

	if err := a.CheckOperationRateLimit(playerID, gameState.GameId); err != nil {
		return err
	}

	return nil
}

func (a *AntiCheatValidator) ValidateEndTurn(gameState *pb.GameState, playerID string) error {
	if err := a.ValidateBasicGameState(gameState, playerID); err != nil {
		return err
	}

	if gameState.CurrentPlayerId != playerID {
		a.RecordViolation(gameState.GameId, playerID, ViolationNotYourTurn,
			fmt.Sprintf("玩家 %s 试图在不属于自己的回合结束回合", playerID))
		return fmt.Errorf("not your turn")
	}

	if err := a.CheckOperationRateLimit(playerID, gameState.GameId); err != nil {
		return err
	}

	return nil
}

func (a *AntiCheatValidator) ValidateSurrender(gameState *pb.GameState, playerID string) error {
	if err := a.ValidateBasicGameState(gameState, playerID); err != nil {
		return err
	}

	playerFound := false
	for _, pid := range gameState.PlayerIds {
		if pid == playerID {
			playerFound = true
			break
		}
	}

	if !playerFound {
		a.RecordViolation(gameState.GameId, playerID, ViolationPlayerNotInGame,
			fmt.Sprintf("玩家 %s 不在游戏中", playerID))
		return fmt.Errorf("player not in game")
	}

	return nil
}

func (a *AntiCheatValidator) ValidateBasicGameState(gameState *pb.GameState, playerID string) error {
	if gameState == nil {
		return fmt.Errorf("game state is nil")
	}

	if gameState.Phase == pb.GamePhase_END {
		return fmt.Errorf("game ended")
	}

	if gameState.GameId == "" {
		return fmt.Errorf("invalid game id")
	}

	return nil
}

func (a *AntiCheatValidator) CheckOperationRateLimit(playerID, gameID string) error {
	key := fmt.Sprintf("anticheat:rate:%s:%s", playerID, gameID)
	currentMinute := time.Now().Minute()

	existingData, _ := a.redisClient.Get(key)
	var count int
	if existingData != "" {
		var data struct {
			Minute int `json:"minute"`
			Count  int `json:"count"`
		}
		json.Unmarshal([]byte(existingData), &data)
		if data.Minute == currentMinute {
			count = data.Count
		}
	}

	count++
	if count > maxOperationsPerMinute {
		a.RecordViolation(gameID, playerID, ViolationTooManyOperations,
			fmt.Sprintf("玩家 %s 操作频率过高: %d 次/分钟", playerID, count))
		return fmt.Errorf("too many operations")
	}

	newData := struct {
		Minute int `json:"minute"`
		Count  int `json:"count"`
	}{
		Minute: currentMinute,
		Count:  count,
	}
	dataBytes, _ := json.Marshal(newData)
	a.redisClient.Set(key, string(dataBytes), 2*time.Minute)

	return nil
}

func (a *AntiCheatValidator) RecordViolation(gameID, playerID string, violationType ViolationType, description string) {
	violation := Violation{
		GameID:        gameID,
		PlayerID:      playerID,
		ViolationType: violationType,
		Description:   description,
		Timestamp:     time.Now().Unix(),
	}

	key := anticheatViolationKey + playerID
	dataBytes, _ := json.Marshal(violation)
	a.redisClient.LPush(key, string(dataBytes))
	a.redisClient.Expire(key, anticheatViolationTTL)

	violationList, _ := a.redisClient.LRange(key, 0, -1)
	if len(violationList) >= maxViolations {
		a.redisClient.Set("anticheat:banned:"+playerID, "1", 1*time.Hour)
	}
}

func (a *AntiCheatValidator) IsPlayerBanned(playerID string) bool {
	key := "anticheat:banned:" + playerID
	return a.redisClient.Exists(key)
}

func (a *AntiCheatValidator) GetViolations(playerID string, limit int) ([]Violation, error) {
	key := anticheatViolationKey + playerID
	data, err := a.redisClient.LRange(key, 0, int64(limit-1))
	if err != nil {
		return nil, err
	}

	var violations []Violation
	for _, item := range data {
		var v Violation
		if json.Unmarshal([]byte(item), &v) == nil {
			violations = append(violations, v)
		}
	}

	return violations, nil
}

func (a *AntiCheatValidator) ValidateGameConsistency(prevState, newState *pb.GameState) error {
	if prevState == nil || newState == nil {
		return fmt.Errorf("invalid game state")
	}

	if prevState.GameId != newState.GameId {
		return fmt.Errorf("game id mismatch")
	}

	if newState.CurrentTurn < prevState.CurrentTurn {
		return fmt.Errorf("turn number decreased")
	}

	if len(newState.PlayerIds) != len(prevState.PlayerIds) {
		return fmt.Errorf("player count changed during game")
	}

	return nil
}

func (a *AntiCheatValidator) ValidateCardInstance(cardInstanceID, playerID, gameID string) error {
	if cardInstanceID == "" {
		a.RecordViolation(gameID, playerID, ViolationInvalidOperation,
			"卡牌实例ID为空")
		return fmt.Errorf("empty card instance id")
	}

	if len(cardInstanceID) < 10 {
		a.RecordViolation(gameID, playerID, ViolationSuspiciousBehavior,
			fmt.Sprintf("卡牌实例ID格式异常: %s", cardInstanceID))
		return fmt.Errorf("invalid card instance id format")
	}

	return nil
}
