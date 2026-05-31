using Unity.Entities;
using Unity.Collections;

public class GameInitializationSystem : SystemBase
{
    private EndSimulationEntityCommandBufferSystem _ecbSystem;
    private bool _initialized;

    protected override void OnCreate()
    {
        _ecbSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
        RequireSingletonForUpdate<GameStateComponent>();
    }

    protected override void OnUpdate()
    {
        if (_initialized) return;

        var gameState = GetSingleton<GameStateComponent>();
        if (!gameState.GameStarted) return;

        var ecb = _ecbSystem.CreateCommandBuffer();

        NativeArray<Entity> playerEntities = new NativeArray<Entity>();
        
        Entities
            .ForEach((Entity entity, in PlayerComponent player) =>
            {
                InitializePlayerDeck(ecb, player.PlayerId);
            }).Run();

        InitializeShop(ecb);

        _initialized = true;
    }

    private void InitializePlayerDeck(EntityCommandBuffer ecb, int playerId)
    {
        for (int i = 0; i < 7; i++)
        {
            CardData copperData = CardFactory.CreateCardData(CardType.Copper);
            Entity copperEntity = CardFactory.CreateCardEntityInDeck(
                World.EntityManager, copperData, playerId, i);
        }

        for (int i = 7; i < 10; i++)
        {
            CardData estateData = CardFactory.CreateCardData(CardType.Estate);
            Entity estateEntity = CardFactory.CreateCardEntityInDeck(
                World.EntityManager, estateData, playerId, i);
        }

        ShuffleDeck(playerId);
    }

    private void ShuffleDeck(int playerId)
    {
        NativeList<Entity> deckCards = new NativeList<Entity>(Allocator.Temp);
        
        Entities
            .ForEach((Entity entity, in InDeckComponent inDeck, in CardDataComponent cardData) =>
            {
                if (inDeck.PlayerId == playerId)
                {
                    deckCards.Add(entity);
                }
            }).Run();

        for (int i = 0; i < deckCards.Length; i++)
        {
            int j = UnityEngine.Random.Range(i, deckCards.Length);
            var card = deckCards[i];
            deckCards[i] = deckCards[j];
            deckCards[j] = card;
        }

        for (int i = 0; i < deckCards.Length; i++)
        {
            var inDeck = EntityManager.GetComponentData<InDeckComponent>(deckCards[i]);
            inDeck.DeckIndex = i;
            EntityManager.SetComponentData(deckCards[i], inDeck);
        }

        deckCards.Dispose();
    }

    private void InitializeShop(EntityCommandBuffer ecb)
    {
        var shopItems = new (CardType, int)[]
        {
            (CardType.Province, 12),
            (CardType.Duchy, 12),
            (CardType.Estate, 12),
            (CardType.Gold, 30),
            (CardType.Silver, 40),
            (CardType.Copper, 60),
            (CardType.Market, 10)
        };

        for (int i = 0; i < shopItems.Length; i++)
        {
            var (cardType, count) = shopItems[i];
            Entity shopEntity = ecb.CreateEntity();
            
            ecb.AddComponentData(shopEntity, new ShopCardComponent
            {
                CardData = CardFactory.CreateCardData(cardType),
                RemainingCount = count,
                ShopSlotIndex = i
            });
        }
    }
}
