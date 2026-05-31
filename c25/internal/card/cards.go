package card

import (
	"math/rand"
	"time"

	pb "cardgame/proto/game"
)

type CardTemplate struct {
	CardID      string
	Name        string
	Attack      int32
	Defense     int32
	Rarity      string
	CardType    pb.CardType
	Description string
}

var cardTemplates = []CardTemplate{
	{CardID: "c001", Name: "炎龙战士", Attack: 5, Defense: 3, Rarity: "rare", CardType: pb.CardType_ATTACK, Description: "召唤时造成2点伤害"},
	{CardID: "c002", Name: "冰霜法师", Attack: 3, Defense: 4, Rarity: "rare", CardType: pb.CardType_MAGIC, Description: "冻结敌方一张卡牌"},
	{CardID: "c003", Name: "岩石巨人", Attack: 2, Defense: 8, Rarity: "common", CardType: pb.CardType_DEFENSE, Description: "嘲讽，必须优先攻击"},
	{CardID: "c004", Name: "闪电刺客", Attack: 7, Defense: 1, Rarity: "epic", CardType: pb.CardType_ATTACK, Description: "冲锋，可立即攻击"},
	{CardID: "c005", Name: "神圣牧师", Attack: 1, Defense: 5, Rarity: "common", CardType: pb.CardType_MAGIC, Description: "回合结束时恢复3点生命"},
	{CardID: "c006", Name: "暗影骑士", Attack: 4, Defense: 5, Rarity: "epic", CardType: pb.CardType_ATTACK, Description: "死亡时召唤一只1/1小兵"},
	{CardID: "c007", Name: "精灵射手", Attack: 3, Defense: 3, Rarity: "common", CardType: pb.CardType_ATTACK, Description: "攻击时造成1点额外伤害"},
	{CardID: "c008", Name: "守护天使", Attack: 2, Defense: 6, Rarity: "rare", CardType: pb.CardType_DEFENSE, Description: "圣盾，免疫首次伤害"},
	{CardID: "c009", Name: "地狱火", Attack: 6, Defense: 6, Rarity: "legendary", CardType: pb.CardType_MAGIC, Description: "对所有敌方单位造成2点伤害"},
	{CardID: "c010", Name: "时空术士", Attack: 4, Defense: 4, Rarity: "legendary", CardType: pb.CardType_SPECIAL, Description: "抽取两张卡牌"},
	{CardID: "c011", Name: "狂战士", Attack: 8, Defense: 2, Rarity: "rare", CardType: pb.CardType_ATTACK, Description: "生命值越低攻击力越高"},
	{CardID: "c012", Name: "冰霜元素", Attack: 3, Defense: 5, Rarity: "common", CardType: pb.CardType_DEFENSE, Description: "攻击时使攻击者冻结"},
}

func GetCardTemplate(cardID string) *CardTemplate {
	for _, ct := range cardTemplates {
		if ct.CardID == cardID {
			return &ct
		}
	}
	return nil
}

func GetAllCardTemplates() []CardTemplate {
	return cardTemplates
}

func GetRandomCardTemplates(count int) []CardTemplate {
	rand.Seed(time.Now().UnixNano())
	shuffled := make([]CardTemplate, len(cardTemplates))
	copy(shuffled, cardTemplates)
	rand.Shuffle(len(shuffled), func(i, j int) {
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	})
	if count > len(shuffled) {
		count = len(shuffled)
	}
	return shuffled[:count]
}
