package player

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"cardgame/internal/card"
	redis_client "cardgame/internal/redis"
	pb "cardgame/proto/player"

	"github.com/google/uuid"
)

const (
	playerPrefix      = "player:"
	playerStatsPrefix = "player:stats:"
	cardCollection    = "player:cards:"
	allPlayers        = "players:all"
)

type Service struct {
	pb.UnimplementedPlayerServiceServer
	redisClient *redis_client.Client
}

func NewService(redisClient *redis_client.Client) *Service {
	return &Service{
		redisClient: redisClient,
	}
}

func (s *Service) CreatePlayer(ctx context.Context, req *pb.CreatePlayerRequest) (*pb.CreatePlayerResponse, error) {
	player, err := s.createPlayerInternal(ctx, req.Username, req.Avatar)
	if err != nil {
		return &pb.CreatePlayerResponse{Success: false}, err
	}
	return &pb.CreatePlayerResponse{
		Success: true,
		Player:  player,
	}, nil
}

func (s *Service) GetPlayerInfo(ctx context.Context, req *pb.GetPlayerInfoRequest) (*pb.GetPlayerInfoResponse, error) {
	key := playerPrefix + req.PlayerId
	data, err := s.redisClient.HGetAll(key)
	if err != nil || len(data) == 0 {
		return &pb.GetPlayerInfoResponse{}, fmt.Errorf("player not found")
	}

	createdAt, _ := strconv.ParseInt(data["created_at"], 10, 64)
	lastOnline, _ := strconv.ParseInt(data["last_online"], 10, 64)

	player := &pb.Player{
		PlayerId:   req.PlayerId,
		Username:   data["username"],
		Avatar:     data["avatar"],
		CreatedAt:  createdAt,
		LastOnline: lastOnline,
	}

	return &pb.GetPlayerInfoResponse{Player: player}, nil
}

func (s *Service) UpdatePlayerInfo(ctx context.Context, req *pb.UpdatePlayerInfoRequest) (*pb.UpdatePlayerInfoResponse, error) {
	key := playerPrefix + req.PlayerId

	if !s.redisClient.Exists(key) {
		return &pb.UpdatePlayerInfoResponse{Success: false}, fmt.Errorf("player not found")
	}

	fields := map[string]interface{}{
		"last_online": time.Now().Unix(),
	}
	if req.Username != "" {
		fields["username"] = req.Username
	}
	if req.Avatar != "" {
		fields["avatar"] = req.Avatar
	}

	err := s.redisClient.HSet(key, fields)
	if err != nil {
		return &pb.UpdatePlayerInfoResponse{Success: false}, err
	}

	return &pb.UpdatePlayerInfoResponse{Success: true}, nil
}

func (s *Service) GetPlayerStats(ctx context.Context, req *pb.GetPlayerStatsRequest) (*pb.GetPlayerStatsResponse, error) {
	key := playerStatsPrefix + req.PlayerId
	data, err := s.redisClient.HGetAll(key)
	if err != nil || len(data) == 0 {
		return &pb.GetPlayerStatsResponse{
			Stats: &pb.PlayerStats{
				PlayerId:   req.PlayerId,
				TotalGames: 0,
				Wins:       0,
				Losses:     0,
				RankScore:  1000,
			},
		}, nil
	}

	totalGames, _ := strconv.Atoi(data["total_games"])
	wins, _ := strconv.Atoi(data["wins"])
	losses, _ := strconv.Atoi(data["losses"])
	rankScore, _ := strconv.Atoi(data["rank_score"])

	stats := &pb.PlayerStats{
		PlayerId:   req.PlayerId,
		TotalGames: int32(totalGames),
		Wins:       int32(wins),
		Losses:     int32(losses),
		RankScore:  int32(rankScore),
	}

	return &pb.GetPlayerStatsResponse{Stats: stats}, nil
}

func (s *Service) GetCardCollection(ctx context.Context, req *pb.GetCardCollectionRequest) (*pb.GetCardCollectionResponse, error) {
	key := cardCollection + req.PlayerId
	cardData, err := s.redisClient.SMembers(key)
	if err != nil {
		return &pb.GetCardCollectionResponse{}, err
	}

	var cards []*pb.Card
	for _, cardID := range cardData {
		template := card.GetCardTemplate(cardID)
		if template != nil {
			cards = append(cards, &pb.Card{
				CardId:      template.CardID,
				Name:        template.Name,
				Attack:      template.Attack,
				Defense:     template.Defense,
				Rarity:      template.Rarity,
				Description: template.Description,
				Level:       1,
			})
		}
	}

	if len(cards) == 0 {
		defaultCards := card.GetRandomCardTemplates(5)
		for _, template := range defaultCards {
			s.redisClient.SAdd(key, template.CardID)
			cards = append(cards, &pb.Card{
				CardId:      template.CardID,
				Name:        template.Name,
				Attack:      template.Attack,
				Defense:     template.Defense,
				Rarity:      template.Rarity,
				Description: template.Description,
				Level:       1,
			})
		}
	}

	return &pb.GetCardCollectionResponse{Cards: cards}, nil
}

func (s *Service) AddCardToCollection(ctx context.Context, req *pb.AddCardToCollectionRequest) (*pb.AddCardToCollectionResponse, error) {
	key := cardCollection + req.PlayerId
	template := card.GetCardTemplate(req.CardId)
	if template == nil {
		return &pb.AddCardToCollectionResponse{Success: false}, fmt.Errorf("card not found")
	}

	err := s.redisClient.SAdd(key, req.CardId)
	if err != nil {
		return &pb.AddCardToCollectionResponse{Success: false}, err
	}

	return &pb.AddCardToCollectionResponse{
		Success: true,
		Card: &pb.Card{
			CardId:      template.CardID,
			Name:        template.Name,
			Attack:      template.Attack,
			Defense:     template.Defense,
			Rarity:      template.Rarity,
			Description: template.Description,
			Level:       1,
		},
	}, nil
}

func (s *Service) UpdatePlayerStats(ctx context.Context, req *pb.UpdatePlayerStatsRequest) (*pb.UpdatePlayerStatsResponse, error) {
	key := playerStatsPrefix + req.PlayerId

	data, _ := s.redisClient.HGetAll(key)
	totalGames, _ := strconv.Atoi(data["total_games"])
	wins, _ := strconv.Atoi(data["wins"])
	losses, _ := strconv.Atoi(data["losses"])
	rankScore, _ := strconv.Atoi(data["rank_score"])
	if rankScore == 0 {
		rankScore = 1000
	}

	totalGames++
	if req.Won {
		wins++
		rankScore += int(req.RankChange)
	} else {
		losses++
		rankScore -= int(req.RankChange)
		if rankScore < 0 {
			rankScore = 0
		}
	}

	fields := map[string]interface{}{
		"total_games": totalGames,
		"wins":        wins,
		"losses":      losses,
		"rank_score":  rankScore,
	}

	err := s.redisClient.HSet(key, fields)
	if err != nil {
		return &pb.UpdatePlayerStatsResponse{Success: false}, err
	}

	return &pb.UpdatePlayerStatsResponse{
		Success: true,
		Stats: &pb.PlayerStats{
			PlayerId:   req.PlayerId,
			TotalGames: int32(totalGames),
			Wins:       int32(wins),
			Losses:     int32(losses),
			RankScore:  int32(rankScore),
		},
	}, nil
}

func (s *Service) createPlayerInternal(ctx context.Context, username, avatar string) (*pb.Player, error) {
	playerID := uuid.New().String()
	now := time.Now().Unix()

	key := playerPrefix + playerID
	fields := map[string]interface{}{
		"player_id":   playerID,
		"username":    username,
		"avatar":      avatar,
		"created_at":  now,
		"last_online": now,
	}

	err := s.redisClient.HSet(key, fields)
	if err != nil {
		return nil, err
	}

	err = s.redisClient.SAdd(allPlayers, playerID)
	if err != nil {
		return nil, err
	}

	collectionKey := cardCollection + playerID
	defaultCards := card.GetRandomCardTemplates(5)
	for _, ct := range defaultCards {
		s.redisClient.SAdd(collectionKey, ct.CardID)
	}

	statsKey := playerStatsPrefix + playerID
	statsFields := map[string]interface{}{
		"player_id":   playerID,
		"total_games": 0,
		"wins":        0,
		"losses":      0,
		"rank_score":  1000,
	}
	s.redisClient.HSet(statsKey, statsFields)

	return &pb.Player{
		PlayerId:   playerID,
		Username:   username,
		Avatar:     avatar,
		CreatedAt:  now,
		LastOnline: now,
	}, nil
}

func (s *Service) GetPlayerStatsJSON(ctx context.Context, playerID string) (string, error) {
	resp, err := s.GetPlayerStats(ctx, &pb.GetPlayerStatsRequest{PlayerId: playerID})
	if err != nil {
		return "", err
	}
	data, err := json.Marshal(resp.Stats)
	return string(data), err
}
