using Unity.Entities;
using Unity.Collections;
using UnityEngine;

public struct ApplyEffectRequest : IComponentData
{
    public int PlayerId;
    public CardEffect EffectType;
    public int EffectValue;
    public int CardType;
    public Entity SourceCard;
}

public struct PurchaseEffectRequest : IComponentData
{
    public int PlayerId;
    public int ShopSlotIndex;
}

public struct TurnEndRequest : IComponentData
{
    public int PlayerId;
}

public class EffectSystem : SystemBase
{
    private EndSimulationEntityCommandBufferSystem _ecbSystem;
    private bool _isServer;

    public bool IsServer
    {
        get => _isServer;
        set => _isServer = value;
    }

    protected override void OnCreate()
    {
        _ecbSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
        _isServer = Mirror.NetworkServer.active;
    }

    protected override void OnUpdate()
    {
        if (!_isServer)
        {
            _isServer = Mirror.NetworkServer.active;
        }

        if (!_isServer) return;

        var ecb = _ecbSystem.CreateCommandBuffer().AsParallelWriter();

        Entities
            .ForEach((Entity requestEntity, int entityInQueryIndex, in ApplyEffectRequest request) =>
            {
                ProcessApplyEffectRequest(request);
                ecb.DestroyEntity(entityInQueryIndex, requestEntity);
            }).ScheduleParallel();

        Entities
            .ForEach((Entity requestEntity, int entityInQueryIndex, in PurchaseEffectRequest request) =>
            {
                ProcessPurchaseEffectRequest(request);
                ecb.DestroyEntity(entityInQueryIndex, requestEntity);
            }).ScheduleParallel();

        Entities
            .ForEach((Entity requestEntity, int entityInQueryIndex, in TurnEndRequest request) =>
            {
                ProcessTurnEndRequest(request);
                ecb.DestroyEntity(entityInQueryIndex, requestEntity);
            }).ScheduleParallel();

        _ecbSystem.AddJobHandleForProducer(Dependency);
    }

    private void ProcessApplyEffectRequest(ApplyEffectRequest request)
    {
        Entity playerEntity = FindPlayerEntity(request.PlayerId);
        if (playerEntity == Entity.Null) return;

        PlayerComponent playerData = EntityManager.GetComponentData<PlayerComponent>(playerEntity);

        switch (request.EffectType)
        {
            case CardEffect.Coin:
                playerData.Coins += request.EffectValue;
                break;

            case CardEffect.Action:
                playerData.Actions += request.EffectValue;
                playerData.Buys += request.EffectValue;
                playerData.Coins += GetCardCoinValue(request.CardType);
                DrawCardsForPlayer(request.PlayerId, 1);
                break;

            case CardEffect.Draw:
                DrawCardsForPlayer(request.PlayerId, request.EffectValue);
                break;

            case CardEffect.Victory:
                break;
        }

        EntityManager.SetComponentData(playerEntity, playerData);
        BroadcastCardPlayed(request.PlayerId, request.CardType, request.EffectValue);
    }

    private void ProcessPurchaseEffectRequest(PurchaseEffectRequest request)
    {
        Entity shopCardEntity = FindShopCardEntity(request.ShopSlotIndex);
        if (shopCardEntity == Entity.Null) return;

        ShopCardComponent shopCardData = EntityManager.GetComponentData<ShopCardComponent>(shopCardEntity);
        Entity playerEntity = FindPlayerEntity(request.PlayerId);
        if (playerEntity == Entity.Null) return;

        PlayerComponent playerData = EntityManager.GetComponentData<PlayerComponent>(playerEntity);

        if (playerData.Coins < shopCardData.CardData.Cost) return;
        if (playerData.Buys <= 0) return;
        if (shopCardData.RemainingCount <= 0) return;

        playerData.Coins -= shopCardData.CardData.Cost;
        playerData.Buys -= 1;
        EntityManager.SetComponentData(playerEntity, playerData);

        shopCardData.RemainingCount -= 1;
        EntityManager.SetComponentData(shopCardEntity, shopCardData);

        CardData purchasedCardData = shopCardData.CardData;
        Entity purchasedCard = CardFactory.CreateCardEntity(
            World.EntityManager, purchasedCardData, request.PlayerId);
        
        EntityManager.AddComponentData(purchasedCard, new InDiscardComponent
        {
            PlayerId = request.PlayerId
        });
        EntityManager.AddComponentData(purchasedCard, new PurchasedThisTurnComponent());

        BroadcastCardPurchased(request.PlayerId, (int)shopCardData.CardData.CardType, shopCardData.CardData.Cost);
        CheckGameEnd();
    }

    private void ProcessTurnEndRequest(TurnEndRequest request)
    {
        Entity playerEntity = FindPlayerEntity(request.PlayerId);
        if (playerEntity == Entity.Null) return;

        PlayerComponent playerData = EntityManager.GetComponentData<PlayerComponent>(playerEntity);
        if (!playerData.IsCurrentTurn) return;

        var drawSystem = World.GetOrCreateSystem<CardDrawSystem>();
        drawSystem.DiscardHand(request.PlayerId);
        drawSystem.DiscardPlayArea(request.PlayerId);

        playerData.Actions = 0;
        playerData.Buys = 0;
        playerData.Coins = 0;
        EntityManager.SetComponentData(playerEntity, playerData);

        int nextPlayerId = GetNextPlayerId(request.PlayerId);
        SwitchToPlayerTurn(nextPlayerId);
    }

    private Entity FindPlayerEntity(int playerId)
    {
        Entity result = Entity.Null;
        
        Entities
            .ForEach((Entity entity, in PlayerComponent player) =>
            {
                if (player.PlayerId == playerId)
                {
                    result = entity;
                }
            }).Run();

        return result;
    }

    private Entity FindShopCardEntity(int shopSlotIndex)
    {
        Entity result = Entity.Null;
        
        Entities
            .ForEach((Entity entity, in ShopCardComponent shopCard) =>
            {
                if (shopCard.ShopSlotIndex == shopSlotIndex)
                {
                    result = entity;
                }
            }).Run();

        return result;
    }

    private int GetCardCoinValue(int cardTypeInt)
    {
        CardType cardType = (CardType)cardTypeInt;
        return cardType switch
        {
            CardType.Copper => 1,
            CardType.Silver => 2,
            CardType.Gold => 3,
            CardType.Market => 1,
            _ => 0
        };
    }

    private void DrawCardsForPlayer(int playerId, int count)
    {
        var drawSystem = World.GetOrCreateSystem<CardDrawSystem>();
        drawSystem.DrawCards(playerId, count);
    }

    private int GetNextPlayerId(int currentPlayerId)
    {
        NativeList<int> playerIds = new NativeList<int>(Allocator.Temp);
        
        Entities
            .ForEach((in PlayerComponent player) =>
            {
                playerIds.Add(player.PlayerId);
            }).Run();

        playerIds.Sort();

        int currentIndex = playerIds.IndexOf(currentPlayerId);
        int nextIndex = (currentIndex + 1) % playerIds.Length;
        int nextPlayerId = playerIds[nextIndex];

        playerIds.Dispose();
        return nextPlayerId;
    }

    private void SwitchToPlayerTurn(int playerId)
    {
        Entities
            .ForEach((Entity entity, ref PlayerComponent player) =>
            {
                player.IsCurrentTurn = player.PlayerId == playerId;
            }).Run();

        var gameState = GetSingleton<GameStateComponent>();
        gameState.CurrentPlayerId = playerId;
        if (playerId == 0)
        {
            gameState.TurnNumber++;
        }
        SetSingleton(gameState);

        Entity playerEntity = FindPlayerEntity(playerId);
        if (playerEntity != Entity.Null)
        {
            PlayerComponent playerData = EntityManager.GetComponentData<PlayerComponent>(playerEntity);
            playerData.Actions = 1;
            playerData.Buys = 1;
            playerData.Coins = 0;
            EntityManager.SetComponentData(playerEntity, playerData);

            var drawSystem = World.GetOrCreateSystem<CardDrawSystem>();
            drawSystem.DrawCards(playerId, 5);
        }

        BroadcastTurnChanged(playerId);
    }

    private void BroadcastCardPlayed(int playerId, int cardType, int effectValue)
    {
        if (Mirror.NetworkServer.active)
        {
            var players = Object.FindObjectsOfType<PlayerNetworkObject>();
            foreach (var player in players)
            {
                if (player.isServer)
                {
                    player.RpcCardPlayed(playerId, cardType, effectValue);
                }
            }
        }
    }

    private void BroadcastCardPurchased(int playerId, int cardType, int cost)
    {
        if (Mirror.NetworkServer.active)
        {
            var players = Object.FindObjectsOfType<PlayerNetworkObject>();
            foreach (var player in players)
            {
                if (player.isServer)
                {
                    player.RpcCardPurchased(playerId, cardType, cost);
                }
            }
        }
    }

    private void BroadcastTurnChanged(int newCurrentPlayerId)
    {
        if (Mirror.NetworkServer.active)
        {
            var players = Object.FindObjectsOfType<PlayerNetworkObject>();
            foreach (var player in players)
            {
                if (player.isServer)
                {
                    player.RpcTurnChanged(newCurrentPlayerId);
                }
            }
        }
    }

    private void CheckGameEnd()
    {
        bool gameEnded = false;
        int emptyProvinces = 0;
        int emptyPiles = 0;

        NativeList<ShopCardComponent> shopCards = new NativeList<ShopCardComponent>(Allocator.Temp);
        
        Entities
            .ForEach((in ShopCardComponent shopCard) =>
            {
                shopCards.Add(shopCard);
            }).Run();

        foreach (var shopCard in shopCards)
        {
            if (shopCard.CardData.CardType == CardType.Province && shopCard.RemainingCount == 0)
            {
                emptyProvinces++;
            }
            if (shopCard.RemainingCount == 0)
            {
                emptyPiles++;
            }
        }

        if (emptyProvinces > 0 || emptyPiles >= 3)
        {
            gameEnded = true;
        }

        if (gameEnded)
        {
            var gameState = GetSingleton<GameStateComponent>();
            gameState.GameEnded = true;
            gameState.WinnerPlayerId = CalculateWinner();
            SetSingleton(gameState);
        }

        shopCards.Dispose();
    }

    private int CalculateWinner()
    {
        int highestVP = -1;
        int winnerPlayerId = 0;

        NativeList<(int PlayerId, int TotalVP)> playerScores = new NativeList<(int, int)>(Allocator.Temp);
        
        Entities
            .ForEach((in PlayerComponent player) =>
            {
                int totalVP = CalculatePlayerVictoryPoints(player.PlayerId);
                playerScores.Add((player.PlayerId, totalVP));
            }).Run();

        foreach (var (playerId, totalVP) in playerScores)
        {
            if (totalVP > highestVP)
            {
                highestVP = totalVP;
                winnerPlayerId = playerId;
            }
        }

        playerScores.Dispose();
        return winnerPlayerId;
    }

    private int CalculatePlayerVictoryPoints(int playerId)
    {
        int totalVP = 0;

        Entity playerEntity = FindPlayerEntity(playerId);
        if (playerEntity == Entity.Null) return 0;

        PlayerComponent playerData = EntityManager.GetComponentData<PlayerComponent>(playerEntity);
        totalVP += playerData.VictoryPoints;

        Entities
            .ForEach((in CardDataComponent cardData, in InDeckComponent inDeck) =>
            {
                if (inDeck.PlayerId == playerId)
                {
                    totalVP += cardData.Value.VictoryPoints;
                }
            }).Run();

        Entities
            .ForEach((in CardDataComponent cardData, in InHandComponent inHand) =>
            {
                if (inHand.PlayerId == playerId)
                {
                    totalVP += cardData.Value.VictoryPoints;
                }
            }).Run();

        Entities
            .ForEach((in CardDataComponent cardData, in InDiscardComponent inDiscard) =>
            {
                if (inDiscard.PlayerId == playerId)
                {
                    totalVP += cardData.Value.VictoryPoints;
                }
            }).Run();

        return totalVP;
    }

    public void RequestApplyEffect(int playerId, CardEffect effectType, int effectValue, int cardType, Entity sourceCard)
    {
        if (!_isServer) return;

        Entity requestEntity = EntityManager.CreateEntity();
        EntityManager.AddComponentData(requestEntity, new ApplyEffectRequest
        {
            PlayerId = playerId,
            EffectType = effectType,
            EffectValue = effectValue,
            CardType = cardType,
            SourceCard = sourceCard
        });
    }

    public void RequestPurchase(int playerId, int shopSlotIndex)
    {
        if (!_isServer) return;

        Entity requestEntity = EntityManager.CreateEntity();
        EntityManager.AddComponentData(requestEntity, new PurchaseEffectRequest
        {
            PlayerId = playerId,
            ShopSlotIndex = shopSlotIndex
        });
    }

    public void RequestTurnEnd(int playerId)
    {
        if (!_isServer) return;

        Entity requestEntity = EntityManager.CreateEntity();
        EntityManager.AddComponentData(requestEntity, new TurnEndRequest
        {
            PlayerId = playerId
        });
    }
}
