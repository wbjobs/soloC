package game

import (
	"encoding/json"
	"fmt"
	"time"

	redis_client "cardgame/internal/redis"
	pb "cardgame/proto/game"

	"github.com/google/uuid"
)

const (
	replayLogPrefix       = "game:replay:"
	replayLogExpiration   = 7 * 24 * time.Hour
	playerHistoryPrefix   = "player:history:"
	playerHistoryLimit    = 100
)

type ReplayLogger struct {
	redisClient *redis_client.Client
}

func NewReplayLogger(redisClient *redis_client.Client) *ReplayLogger {
	return &ReplayLogger{
		redisClient: redisClient,
	}
}

func (r *ReplayLogger) LogOperation(gameID string, operation *pb.GameOperation) error {
	key := replayLogPrefix + gameID

	data, err := json.Marshal(operation)
	if err != nil {
		return err
	}

	err = r.redisClient.LPush(key, string(data))
	if err != nil {
		return err
	}

	r.redisClient.Expire(key, replayLogExpiration)
	return nil
}

func (r *ReplayLogger) CreateOperation(
	opType pb.OperationType,
	playerID string,
	turnNumber int32,
	payload interface{},
) *pb.GameOperation {
	var payloadStr string
	if payload != nil {
		data, err := json.Marshal(payload)
		if err == nil {
			payloadStr = string(data)
		}
	}

	return &pb.GameOperation{
		OperationId:   uuid.New().String(),
		OperationType: opType,
		PlayerId:      playerID,
		Timestamp:     time.Now().Unix(),
		TurnNumber:    turnNumber,
		Payload:       payloadStr,
	}
}

func (r *ReplayLogger) GetReplay(gameID string) (*pb.GameReplay, error) {
	key := replayLogPrefix + gameID

	logData, err := r.redisClient.LRange(key, 0, -1)
	if err != nil || len(logData) == 0 {
		return nil, fmt.Errorf("replay not found")
	}

	var operations []*pb.GameOperation
	for i := len(logData) - 1; i >= 0; i-- {
		var op pb.GameOperation
		if err := json.Unmarshal([]byte(logData[i]), &op); err == nil {
			operations = append(operations, &op)
		}
	}

	if len(operations) == 0 {
		return nil, fmt.Errorf("replay not found")
	}

	replay := &pb.GameReplay{
		GameId:     gameID,
		Operations: operations,
	}

	if len(operations) > 0 {
		for _, op := range operations {
			if op.OperationType == pb.OperationType_OP_START_GAME {
				replay.StartTime = op.Timestamp
				var payload map[string]interface{}
				if json.Unmarshal([]byte(op.Payload), &payload) == nil {
					if roomID, ok := payload["room_id"].(string); ok {
						replay.RoomId = roomID
					}
					if playerIDs, ok := payload["player_ids"].([]interface{}); ok {
						for _, id := range playerIDs {
							if strID, ok := id.(string); ok {
								replay.PlayerIds = append(replay.PlayerIds, strID)
							}
						}
					}
				}
			}
			if op.OperationType == pb.OperationType_OP_GAME_END {
				replay.EndTime = op.Timestamp
				var payload map[string]interface{}
				if json.Unmarshal([]byte(op.Payload), &payload) == nil {
					if winnerID, ok := payload["winner_id"].(string); ok {
						replay.WinnerId = winnerID
					}
				}
			}
		}
	}

	return replay, nil
}

func (r *ReplayLogger) AddGameToHistory(playerID string, gameID string, entry *pb.GameHistoryEntry) error {
	key := playerHistoryPrefix + playerID

	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}

	err = r.redisClient.LPush(key, string(data))
	if err != nil {
		return err
	}

	length, _ := r.redisClient.LRange(key, 0, -1)
	if len(length) > playerHistoryLimit {
		r.redisClient.LPush(key)
	}

	return nil
}

func (r *ReplayLogger) GetPlayerHistory(playerID string, page, pageSize int) ([]*pb.GameHistoryEntry, int, error) {
	key := playerHistoryPrefix + playerID

	allData, err := r.redisClient.LRange(key, 0, -1)
	if err != nil {
		return nil, 0, err
	}

	total := len(allData)
	if total == 0 {
		return []*pb.GameHistoryEntry{}, 0, nil
	}

	start := (page - 1) * pageSize
	end := start + pageSize
	if start >= total {
		return []*pb.GameHistoryEntry{}, total, nil
	}
	if end > total {
		end = total
	}

	var entries []*pb.GameHistoryEntry
	for i := start; i < end; i++ {
		var entry pb.GameHistoryEntry
		if err := json.Unmarshal([]byte(allData[i]), &entry); err == nil {
			entries = append(entries, &entry)
		}
	}

	return entries, total, nil
}

func (r *ReplayLogger) DeleteReplay(gameID string) error {
	key := replayLogPrefix + gameID
	return r.redisClient.Del(key)
}

func (r *ReplayLogger) CreateStartGameLog(gameID, roomID string, playerIDs []string, gameState interface{}) *pb.GameOperation {
	return r.CreateOperation(
		pb.OperationType_OP_START_GAME,
		"",
		1,
		map[string]interface{}{
			"room_id":    roomID,
			"player_ids": playerIDs,
			"game_state": gameState,
		},
	)
}

func (r *ReplayLogger) CreatePlayCardLog(playerID, cardInstanceID, targetPlayerID string, turnNumber int32, card interface{}) *pb.GameOperation {
	return r.CreateOperation(
		pb.OperationType_OP_PLAY_CARD,
		playerID,
		turnNumber,
		map[string]interface{}{
			"card_instance_id": cardInstanceID,
			"target_player_id": targetPlayerID,
			"card":             card,
		},
	)
}

func (r *ReplayLogger) CreateEndTurnLog(playerID string, turnNumber int32, nextPlayerID string) *pb.GameOperation {
	return r.CreateOperation(
		pb.OperationType_OP_END_TURN,
		playerID,
		turnNumber,
		map[string]interface{}{
			"next_player_id": nextPlayerID,
		},
	)
}

func (r *ReplayLogger) CreateSurrenderLog(playerID, winnerID string, turnNumber int32) *pb.GameOperation {
	return r.CreateOperation(
		pb.OperationType_OP_SURRENDER,
		playerID,
		turnNumber,
		map[string]interface{}{
			"winner_id": winnerID,
			"reason":    "surrender",
		},
	)
}

func (r *ReplayLogger) CreateCardDealLog(playerID string, cards interface{}, turnNumber int32) *pb.GameOperation {
	return r.CreateOperation(
		pb.OperationType_OP_CARD_DEAL,
		playerID,
		turnNumber,
		map[string]interface{}{
			"cards": cards,
		},
	)
}

func (r *ReplayLogger) CreateGameEndLog(winnerID string, playerScores interface{}, turnNumber int32) *pb.GameOperation {
	return r.CreateOperation(
		pb.OperationType_OP_GAME_END,
		"",
		turnNumber,
		map[string]interface{}{
			"winner_id":     winnerID,
			"player_scores": playerScores,
		},
	)
}
