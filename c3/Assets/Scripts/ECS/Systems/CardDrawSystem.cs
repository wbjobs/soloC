using Unity.Entities;
using Unity.Collections;

public class CardDrawSystem : SystemBase
{
    private EndSimulationEntityCommandBufferSystem _ecbSystem;

    protected override void OnCreate()
    {
        _ecbSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
    }

    protected override void OnUpdate()
    {
    }

    public void DrawCards(int playerId, int count)
    {
        var ecb = _ecbSystem.CreateCommandBuffer();

        for (int i = 0; i < count; i++)
        {
            DrawSingleCard(playerId, ecb);
        }
    }

    private void DrawSingleCard(int playerId, EntityCommandBuffer ecb)
    {
        NativeList<Entity> deckCards = new NativeList<Entity>(Allocator.Temp);
        
        Entities
            .ForEach((Entity entity, in InDeckComponent inDeck) =>
            {
                if (inDeck.PlayerId == playerId)
                {
                    deckCards.Add(entity);
                }
            }).Run();

        if (deckCards.Length == 0)
        {
            ReshuffleDiscardIntoDeck(playerId);
            return;
        }

        deckCards.Sort((a, b) =>
        {
            var aDeck = EntityManager.GetComponentData<InDeckComponent>(a);
            var bDeck = EntityManager.GetComponentData<InDeckComponent>(b);
            return aDeck.DeckIndex.CompareTo(bDeck.DeckIndex);
        });

        if (deckCards.Length > 0)
        {
            Entity drawnCard = deckCards[0];
            MoveCardToHand(drawnCard, playerId, ecb);
        }

        deckCards.Dispose();
    }

    private void ReshuffleDiscardIntoDeck(int playerId)
    {
        NativeList<Entity> discardCards = new NativeList<Entity>(Allocator.Temp);
        
        Entities
            .ForEach((Entity entity, in InDiscardComponent inDiscard) =>
            {
                if (inDiscard.PlayerId == playerId)
                {
                    discardCards.Add(entity);
                }
            }).Run();

        for (int i = 0; i < discardCards.Length; i++)
        {
            int j = UnityEngine.Random.Range(i, discardCards.Length);
            var temp = discardCards[i];
            discardCards[i] = discardCards[j];
            discardCards[j] = temp;
        }

        for (int i = 0; i < discardCards.Length; i++)
        {
            Entity card = discardCards[i];
            EntityManager.RemoveComponent<InDiscardComponent>(card);
            EntityManager.AddComponentData(card, new InDeckComponent
            {
                PlayerId = playerId,
                DeckIndex = i
            });
        }

        discardCards.Dispose();
    }

    private void MoveCardToHand(Entity cardEntity, int playerId, EntityCommandBuffer ecb)
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

        int newHandIndex = handCards.Length;
        
        ecb.RemoveComponent<InDeckComponent>(cardEntity);
        ecb.AddComponentData(cardEntity, new InHandComponent
        {
            PlayerId = playerId,
            HandIndex = newHandIndex
        });

        handCards.Dispose();
    }

    public void DiscardHand(int playerId)
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

        var ecb = _ecbSystem.CreateCommandBuffer();

        foreach (var card in handCards)
        {
            ecb.RemoveComponent<InHandComponent>(card);
            ecb.AddComponentData(card, new InDiscardComponent
            {
                PlayerId = playerId
            });
        }

        handCards.Dispose();
    }

    public void DiscardPlayArea(int playerId)
    {
        NativeList<Entity> playCards = new NativeList<Entity>(Allocator.Temp);
        
        Entities
            .ForEach((Entity entity, in InPlayComponent inPlay) =>
            {
                if (inPlay.PlayerId == playerId)
                {
                    playCards.Add(entity);
                }
            }).Run();

        var ecb = _ecbSystem.CreateCommandBuffer();

        foreach (var card in playCards)
        {
            ecb.RemoveComponent<InPlayComponent>(card);
            ecb.AddComponentData(card, new InDiscardComponent
            {
                PlayerId = playerId
            });
        }

        playCards.Dispose();
    }
}
