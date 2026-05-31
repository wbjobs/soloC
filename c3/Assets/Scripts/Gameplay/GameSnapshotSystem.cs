using UnityEngine;
using Mirror;
using Unity.Entities;
using Unity.Collections;
using System.Collections.Generic;

[System.Serializable]
public class GameSnapshot
{
    public string SnapshotId;
    public int TurnNumber;
    public int CurrentPlayerId;
    public System.DateTime Timestamp;
    public List<PlayerSnapshot> PlayerSnapshots;
    public List<ShopSnapshot> ShopSnapshots;
    public GameStateSnapshot GameState;
}

[System.Serializable]
public class PlayerSnapshot
{
    public int PlayerId;
    public string PlayerName;
    public int VictoryPoints;
    public int Coins;
    public int Actions;
    public int Buys;
    public int DeckCount;
    public int HandCount;
    public int DiscardCount;
    public int PlayAreaCount;
    public bool IsCurrentTurn;
    public List<int> HandCardTypes;
    public List<int> DeckCardTypes;
    public List<int> DiscardCardTypes;
}

[System.Serializable]
public class ShopSnapshot
{
    public int SlotIndex;
    public int CardType;
    public int Cost;
    public int RemainingCount;
    public string CardName;
}

[System.Serializable]
public class GameStateSnapshot
{
    public bool GameStarted;
    public bool GameEnded;
    public int WinnerPlayerId;
}

public class GameSnapshotSystem : MonoBehaviour
{
    public static GameSnapshotSystem Instance { get; private set; }

    private List<GameSnapshot> _snapshots = new List<GameSnapshot>();
    private bool _isRecording;
    private World _ecsWorld;

    public int MaxSnapshots = 100;

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }
        else
        {
            Destroy(gameObject);
        }
    }

    public void Initialize(World ecsWorld)
    {
        _ecsWorld = ecsWorld;
    }

    public void StartRecording()
    {
        _snapshots.Clear();
        _isRecording = true;
    }

    public void StopRecording()
    {
        _isRecording = false;
    }

    public GameSnapshot CaptureSnapshot(int turnNumber, int currentPlayerId)
    {
        if (!_isRecording || _ecsWorld == null) return null;

        var entityManager = _ecsWorld.EntityManager;
        
        GameSnapshot snapshot = new GameSnapshot
        {
            SnapshotId = System.Guid.NewGuid().ToString(),
            TurnNumber = turnNumber,
            CurrentPlayerId = currentPlayerId,
            Timestamp = System.DateTime.Now,
            PlayerSnapshots = new List<PlayerSnapshot>(),
            ShopSnapshots = new List<ShopSnapshot>()
        };

        CapturePlayerData(entityManager, snapshot);
        CaptureShopData(entityManager, snapshot);
        CaptureGameState(entityManager, snapshot);

        _snapshots.Add(snapshot);

        if (_snapshots.Count > MaxSnapshots)
        {
            _snapshots.RemoveAt(0);
        }

        return snapshot;
    }

    private void CapturePlayerData(EntityManager entityManager, GameSnapshot snapshot)
    {
        var playerQuery = entityManager.CreateEntityQuery(typeof(PlayerComponent));
        var players = playerQuery.ToEntityArray(Allocator.Temp);

        foreach (var entity in players)
        {
            var player = entityManager.GetComponentData<PlayerComponent>(entity);
            
            PlayerSnapshot playerSnapshot = new PlayerSnapshot
            {
                PlayerId = player.PlayerId,
                PlayerName = player.PlayerName,
                VictoryPoints = player.VictoryPoints,
                Coins = player.Coins,
                Actions = player.Actions,
                Buys = player.Buys,
                DeckCount = CountCardsInLocation(entityManager, player.PlayerId, "Deck"),
                HandCount = CountCardsInLocation(entityManager, player.PlayerId, "Hand"),
                DiscardCount = CountCardsInLocation(entityManager, player.PlayerId, "Discard"),
                PlayAreaCount = CountCardsInLocation(entityManager, player.PlayerId, "Play"),
                IsCurrentTurn = player.IsCurrentTurn,
                HandCardTypes = GetCardTypesInLocation(entityManager, player.PlayerId, "Hand"),
                DeckCardTypes = GetCardTypesInLocation(entityManager, player.PlayerId, "Deck"),
                DiscardCardTypes = GetCardTypesInLocation(entityManager, player.PlayerId, "Discard")
            };

            snapshot.PlayerSnapshots.Add(playerSnapshot);
        }

        players.Dispose();
    }

    private void CaptureShopData(EntityManager entityManager, GameSnapshot snapshot)
    {
        var shopQuery = entityManager.CreateEntityQuery(typeof(ShopCardComponent));
        var shopItems = shopQuery.ToEntityArray(Allocator.Temp);

        foreach (var entity in shopItems)
        {
            var shopCard = entityManager.GetComponentData<ShopCardComponent>(entity);
            
            ShopSnapshot shopSnapshot = new ShopSnapshot
            {
                SlotIndex = shopCard.ShopSlotIndex,
                CardType = (int)shopCard.CardData.CardType,
                Cost = shopCard.CardData.Cost,
                RemainingCount = shopCard.RemainingCount,
                CardName = shopCard.CardData.Name
            };

            snapshot.ShopSnapshots.Add(shopSnapshot);
        }

        shopItems.Dispose();
    }

    private void CaptureGameState(EntityManager entityManager, GameSnapshot snapshot)
    {
        var gameStateQuery = entityManager.CreateEntityQuery(typeof(GameStateComponent));
        if (!gameStateQuery.IsEmpty)
        {
            var gameState = gameStateQuery.GetSingleton<GameStateComponent>();
            snapshot.GameState = new GameStateSnapshot
            {
                GameStarted = gameState.GameStarted,
                GameEnded = gameState.GameEnded,
                WinnerPlayerId = gameState.WinnerPlayerId
            };
        }
    }

    private int CountCardsInLocation(EntityManager entityManager, int playerId, string location)
    {
        int count = 0;

        switch (location)
        {
            case "Deck":
                Entities
                    .WithWorld(_ecsWorld)
                    .ForEach((in InDeckComponent inDeck) =>
                    {
                        if (inDeck.PlayerId == playerId) count++;
                    }).Run();
                break;

            case "Hand":
                Entities
                    .WithWorld(_ecsWorld)
                    .ForEach((in InHandComponent inHand) =>
                    {
                        if (inHand.PlayerId == playerId) count++;
                    }).Run();
                break;

            case "Discard":
                Entities
                    .WithWorld(_ecsWorld)
                    .ForEach((in InDiscardComponent inDiscard) =>
                    {
                        if (inDiscard.PlayerId == playerId) count++;
                    }).Run();
                break;

            case "Play":
                Entities
                    .WithWorld(_ecsWorld)
                    .ForEach((in InPlayComponent inPlay) =>
                    {
                        if (inPlay.PlayerId == playerId) count++;
                    }).Run();
                break;
        }

        return count;
    }

    private List<int> GetCardTypesInLocation(EntityManager entityManager, int playerId, string location)
    {
        List<int> cardTypes = new List<int>();

        switch (location)
        {
            case "Hand":
                var handQuery = entityManager.CreateEntityQuery(
                    typeof(InHandComponent),
                    typeof(CardDataComponent)
                );
                var handCards = handQuery.ToEntityArray(Allocator.Temp);
                foreach (var card in handCards)
                {
                    var inHand = entityManager.GetComponentData<InHandComponent>(card);
                    if (inHand.PlayerId == playerId)
                    {
                        var cardData = entityManager.GetComponentData<CardDataComponent>(card);
                        cardTypes.Add((int)cardData.Value.CardType);
                    }
                }
                handCards.Dispose();
                break;

            case "Deck":
                var deckQuery = entityManager.CreateEntityQuery(
                    typeof(InDeckComponent),
                    typeof(CardDataComponent)
                );
                var deckCards = deckQuery.ToEntityArray(Allocator.Temp);
                foreach (var card in deckCards)
                {
                    var inDeck = entityManager.GetComponentData<InDeckComponent>(card);
                    if (inDeck.PlayerId == playerId)
                    {
                        var cardData = entityManager.GetComponentData<CardDataComponent>(card);
                        cardTypes.Add((int)cardData.Value.CardType);
                    }
                }
                deckCards.Dispose();
                break;

            case "Discard":
                var discardQuery = entityManager.CreateEntityQuery(
                    typeof(InDiscardComponent),
                    typeof(CardDataComponent)
                );
                var discardCards = discardQuery.ToEntityArray(Allocator.Temp);
                foreach (var card in discardCards)
                {
                    var inDiscard = entityManager.GetComponentData<InDiscardComponent>(card);
                    if (inDiscard.PlayerId == playerId)
                    {
                        var cardData = entityManager.GetComponentData<CardDataComponent>(card);
                        cardTypes.Add((int)cardData.Value.CardType);
                    }
                }
                discardCards.Dispose();
                break;
        }

        return cardTypes;
    }

    public GameSnapshot GetSnapshotByTurn(int turnNumber)
    {
        return _snapshots.Find(s => s.TurnNumber == turnNumber);
    }

    public GameSnapshot GetLatestSnapshot()
    {
        if (_snapshots.Count == 0) return null;
        return _snapshots[_snapshots.Count - 1];
    }

    public List<GameSnapshot> GetAllSnapshots()
    {
        return new List<GameSnapshot>(_snapshots);
    }

    public int GetSnapshotCount()
    {
        return _snapshots.Count;
    }

    public bool IsRecording()
    {
        return _isRecording;
    }

    public void ClearSnapshots()
    {
        _snapshots.Clear();
    }

    public void SetWorld(World world)
    {
        _ecsWorld = world;
    }
}
