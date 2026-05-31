using System;
using Unity.Entities;

public static class CardFactory
{
    public static CardData CreateCardData(CardType cardType)
    {
        switch (cardType)
        {
            case CardType.Copper:
                return new CardData
                {
                    CardType = CardType.Copper,
                    Cost = 0,
                    CoinValue = 1,
                    VictoryPoints = 0,
                    Name = "铜币",
                    Description = "+1 钱币",
                    Effect = CardEffect.Coin,
                    EffectValue = 1
                };

            case CardType.Silver:
                return new CardData
                {
                    CardType = CardType.Silver,
                    Cost = 3,
                    CoinValue = 2,
                    VictoryPoints = 0,
                    Name = "银币",
                    Description = "+2 钱币",
                    Effect = CardEffect.Coin,
                    EffectValue = 2
                };

            case CardType.Gold:
                return new CardData
                {
                    CardType = CardType.Gold,
                    Cost = 6,
                    CoinValue = 3,
                    VictoryPoints = 0,
                    Name = "金币",
                    Description = "+3 钱币",
                    Effect = CardEffect.Coin,
                    EffectValue = 3
                };

            case CardType.Estate:
                return new CardData
                {
                    CardType = CardType.Estate,
                    Cost = 2,
                    CoinValue = 0,
                    VictoryPoints = 1,
                    Name = "庄园",
                    Description = "1 胜利点",
                    Effect = CardEffect.Victory,
                    EffectValue = 1
                };

            case CardType.Duchy:
                return new CardData
                {
                    CardType = CardType.Duchy,
                    Cost = 5,
                    CoinValue = 0,
                    VictoryPoints = 3,
                    Name = "公国",
                    Description = "3 胜利点",
                    Effect = CardEffect.Victory,
                    EffectValue = 3
                };

            case CardType.Province:
                return new CardData
                {
                    CardType = CardType.Province,
                    Cost = 8,
                    CoinValue = 0,
                    VictoryPoints = 6,
                    Name = "行省",
                    Description = "6 胜利点",
                    Effect = CardEffect.Victory,
                    EffectValue = 6
                };

            case CardType.Market:
                return new CardData
                {
                    CardType = CardType.Market,
                    Cost = 5,
                    CoinValue = 1,
                    VictoryPoints = 0,
                    Name = "市场",
                    Description = "+1 行动, +1 买, +1 钱, 抽1张牌",
                    Effect = CardEffect.Action,
                    EffectValue = 1
                };

            default:
                return new CardData
                {
                    CardType = CardType.Copper,
                    Cost = 0,
                    CoinValue = 1,
                    VictoryPoints = 0,
                    Name = "铜币",
                    Description = "+1 钱币",
                    Effect = CardEffect.Coin,
                    EffectValue = 1
                };
        }
    }

    public static Entity CreateCardEntity(EntityManager entityManager, CardData cardData, int ownerPlayerId)
    {
        Entity cardEntity = entityManager.CreateEntity();
        
        entityManager.AddComponentData(cardEntity, new CardDataComponent
        {
            Value = cardData,
            OwnerPlayerId = ownerPlayerId
        });
        
        entityManager.AddComponentData(cardEntity, new CostComponent
        {
            Value = cardData.Cost
        });
        
        entityManager.AddComponentData(cardEntity, new EffectComponent
        {
            Type = cardData.Effect,
            Value = cardData.EffectValue
        });

        return cardEntity;
    }

    public static Entity CreateCardEntityInHand(EntityManager entityManager, CardData cardData, int ownerPlayerId, int handIndex)
    {
        Entity cardEntity = CreateCardEntity(entityManager, cardData, ownerPlayerId);
        entityManager.AddComponentData(cardEntity, new InHandComponent
        {
            PlayerId = ownerPlayerId,
            HandIndex = handIndex
        });
        return cardEntity;
    }

    public static Entity CreateCardEntityInDeck(EntityManager entityManager, CardData cardData, int ownerPlayerId, int deckIndex)
    {
        Entity cardEntity = CreateCardEntity(entityManager, cardData, ownerPlayerId);
        entityManager.AddComponentData(cardEntity, new InDeckComponent
        {
            PlayerId = ownerPlayerId,
            DeckIndex = deckIndex
        });
        return cardEntity;
    }

    public static Entity CreateCardEntityInShop(EntityManager entityManager, CardData cardData, int shopIndex)
    {
        Entity cardEntity = CreateCardEntity(entityManager, cardData, -1);
        entityManager.AddComponentData(cardEntity, new InShopComponent
        {
            ShopIndex = shopIndex
        });
        return cardEntity;
    }
}
