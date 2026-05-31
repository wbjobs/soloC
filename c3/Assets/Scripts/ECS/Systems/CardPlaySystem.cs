using Unity.Entities;
using Unity.Collections;

public class CardPlaySystem : SystemBase
{
    private EndSimulationEntityCommandBufferSystem _ecbSystem;

    public struct PlayCardRequest : IComponentData
    {
        public Entity CardEntity;
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
            .ForEach((Entity requestEntity, int entityInQueryIndex, in PlayCardRequest request) =>
            {
                PlayCard(request.CardEntity, request.PlayerId);
                ecb.DestroyEntity(entityInQueryIndex, requestEntity);
            }).ScheduleParallel();

        _ecbSystem.AddJobHandleForProducer(Dependency);
    }

    public void PlayCard(Entity cardEntity, int playerId)
    {
        if (!EntityManager.HasComponent<CardDataComponent>(cardEntity)) return;
        if (!EntityManager.HasComponent<InHandComponent>(cardEntity)) return;
        
        var inHand = EntityManager.GetComponentData<InHandComponent>(cardEntity);
        if (inHand.PlayerId != playerId) return;

        var cardData = EntityManager.GetComponentData<CardDataComponent>(cardEntity);
        var effect = EntityManager.GetComponentData<EffectComponent>(cardEntity);

        EntityManager.RemoveComponent<InHandComponent>(cardEntity);
        EntityManager.AddComponentData(cardEntity, new InPlayComponent
        {
            PlayerId = playerId
        });

        ApplyCardEffect(playerId, cardData.Value, effect);

        ReindexHand(playerId);
    }

    private void ApplyCardEffect(int playerId, CardData cardData, EffectComponent effect)
    {
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

        switch (effect.Type)
        {
            case CardEffect.Coin:
                playerData.Coins += effect.Value;
                break;

            case CardEffect.Victory:
                break;

            case CardEffect.Action:
                playerData.Actions += effect.Value;
                playerData.Buys += effect.Value;
                playerData.Coins += cardData.CoinValue;
                DrawExtraCard(playerId, 1);
                break;
        }

        playerData.Coins += cardData.CoinValue;
        EntityManager.SetComponentData(playerEntity, playerData);
    }

    private void DrawExtraCard(int playerId, int count)
    {
        var drawSystem = World.GetOrCreateSystem<CardDrawSystem>();
        drawSystem.DrawCards(playerId, count);
    }

    private void ReindexHand(int playerId)
    {
        NativeList<Entity> handCards = new NativeList<Entity>(Allocator.Temp);
        
        Entities
            .ForEach((Entity entity, in InHandComponent inHand) =>
            {
                if (inHand.PlayerId == playerId)
                {
                    handCards.Add(entity);
                }
            }).Run();

        for (int i = 0; i < handCards.Length; i++)
        {
            var inHand = EntityManager.GetComponentData<InHandComponent>(handCards[i]);
            inHand.HandIndex = i;
            EntityManager.SetComponentData(handCards[i], inHand);
        }

        handCards.Dispose();
    }

    public bool CanPlayCard(Entity cardEntity, int playerId)
    {
        if (!EntityManager.HasComponent<InHandComponent>(cardEntity)) return false;
        var inHand = EntityManager.GetComponentData<InHandComponent>(cardEntity);
        if (inHand.PlayerId != playerId) return false;

        if (!EntityManager.HasComponent<CardDataComponent>(cardEntity)) return false;
        var cardData = EntityManager.GetComponentData<CardDataComponent>(cardEntity);
        
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

        var gameState = GetSingleton<GameStateComponent>();
        if (!playerData.IsCurrentTurn) return false;

        var effect = EntityManager.GetComponentData<EffectComponent>(cardEntity);
        
        if (effect.Type == CardEffect.Action)
        {
            if (playerData.Actions <= 0) return false;
        }

        return true;
    }

    public void RequestPlayCard(Entity cardEntity, int playerId)
    {
        Entity requestEntity = EntityManager.CreateEntity();
        EntityManager.AddComponentData(requestEntity, new PlayCardRequest
        {
            CardEntity = cardEntity,
            PlayerId = playerId
        });
    }
}
