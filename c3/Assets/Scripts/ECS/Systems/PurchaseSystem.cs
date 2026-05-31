using Unity.Entities;
using Unity.Collections;

public class PurchaseSystem : SystemBase
{
    private EndSimulationEntityCommandBufferSystem _ecbSystem;

    public struct PurchaseRequest : IComponentData
    {
        public int ShopSlotIndex;
        public int PlayerId;
    }

    protected override void OnCreate()
    {
        _ecbSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
    }

    protected override void OnUpdate()
    {
        var ecb = _ecbSystem.CreateCommandBuffer().AsParallelWriter();

        Entities
            .ForEach((Entity requestEntity, int entityInQueryIndex, in PurchaseRequest request) =>
            {
                ExecutePurchase(request.ShopSlotIndex, request.PlayerId);
                ecb.DestroyEntity(entityInQueryIndex, requestEntity);
            }).ScheduleParallel();

        _ecbSystem.AddJobHandleForProducer(Dependency);
    }

    private void ExecutePurchase(int shopSlotIndex, int playerId)
    {
        Entity shopCardEntity = Entity.Null;
        ShopCardComponent shopCardData = default;
        bool found = false;

        Entities
            .ForEach((Entity entity, in ShopCardComponent shopCard) =>
            {
                if (shopCard.ShopSlotIndex == shopSlotIndex)
                {
                    shopCardEntity = entity;
                    shopCardData = shopCard;
                    found = true;
                }
            }).Run();

        if (!found) return;

        Entity playerEntity = Entity.Null;
        PlayerComponent playerData = default;

        Entities
            .ForEach((Entity entity, in PlayerComponent player) =>
            {
                if (player.PlayerId == playerId)
                {
                    playerEntity = entity;
                    playerData = player;
                }
            }).Run();

        if (playerEntity == Entity.Null) return;
        if (!playerData.IsCurrentTurn) return;

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
            World.EntityManager, purchasedCardData, playerId);
        
        EntityManager.AddComponentData(purchasedCard, new InDiscardComponent
        {
            PlayerId = playerId
        });
        EntityManager.AddComponentData(purchasedCard, new PurchasedThisTurnComponent());

        CheckGameEnd();
    }

    public bool CanPurchase(int shopSlotIndex, int playerId)
    {
        Entity shopCardEntity = Entity.Null;
        ShopCardComponent shopCardData = default;
        bool found = false;

        Entities
            .ForEach((Entity entity, in ShopCardComponent shopCard) =>
            {
                if (shopCard.ShopSlotIndex == shopSlotIndex)
                {
                    shopCardEntity = entity;
                    shopCardData = shopCard;
                    found = true;
                }
            }).Run();

        if (!found) return false;

        Entity playerEntity = Entity.Null;
        PlayerComponent playerData = default;

        Entities
            .ForEach((Entity entity, in PlayerComponent player) =>
            {
                if (player.PlayerId == playerId)
                {
                    playerEntity = entity;
                    playerData = player;
                }
            }).Run();

        if (playerEntity == Entity.Null) return false;
        if (!playerData.IsCurrentTurn) return false;

        if (playerData.Coins < shopCardData.CardData.Cost) return false;
        if (playerData.Buys <= 0) return false;
        if (shopCardData.RemainingCount <= 0) return false;

        return true;
    }

    public void RequestPurchase(int shopSlotIndex, int playerId)
    {
        Entity requestEntity = EntityManager.CreateEntity();
        EntityManager.AddComponentData(requestEntity, new PurchaseRequest
        {
            ShopSlotIndex = shopSlotIndex,
            PlayerId = playerId
        });
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

        Entity playerEntity = Entity.Null;
        PlayerComponent playerData = default;

        Entities
            .ForEach((Entity entity, in PlayerComponent player) =>
            {
                if (player.PlayerId == playerId)
                {
                    playerEntity = entity;
                    playerData = player;
                }
            }).Run();

        if (playerEntity == Entity.Null) return 0;

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
}
