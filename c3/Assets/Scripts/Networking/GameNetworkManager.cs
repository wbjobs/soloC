using UnityEngine;
using Mirror;
using System.Collections.Generic;
using Unity.Entities;
using Unity.Collections;

public class GameNetworkManager : NetworkManager
{
    public static GameNetworkManager Instance { get; private set; }

    public int MaxPlayers = 4;
    public int MinPlayers = 2;
    public int MaxSpectators = 10;
    
    public GameObject SpectatorPrefab;

    private List<PlayerNetworkObject> _connectedPlayers = new List<PlayerNetworkObject>();
    private List<SpectatorNetworkObject> _connectedSpectators = new List<SpectatorNetworkObject>();
    private bool _gameStarted;
    private World _ecsWorld;
    private EffectSystem _effectSystem;
    private TurnStateMachineSystem _turnStateSystem;
    private System.DateTime _gameStartTime;

    public override void Awake()
    {
        base.Awake();
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

    private void Start()
    {
        InitializeECSWorld();
        InitializeGameSystems();
    }

    private void InitializeECSWorld()
    {
        if (_ecsWorld == null)
        {
            _ecsWorld = new World("GameWorld");
            
            var initializationSystemGroup = _ecsWorld.GetOrCreateSystem<InitializationSystemGroup>();
            var simulationSystemGroup = _ecsWorld.GetOrCreateSystem<SimulationSystemGroup>();
            var presentationSystemGroup = _ecsWorld.GetOrCreateSystem<PresentationSystemGroup>();

            var gameInitSystem = _ecsWorld.GetOrCreateSystem<GameInitializationSystem>();
            var cardDrawSystem = _ecsWorld.GetOrCreateSystem<CardDrawSystem>();
            var cardPlaySystem = _ecsWorld.GetOrCreateSystem<CardPlaySystem>();
            var purchaseSystem = _ecsWorld.GetOrCreateSystem<PurchaseSystem>();
            var turnSystem = _ecsWorld.GetOrCreateSystem<TurnManagementSystem>();
            
            _effectSystem = _ecsWorld.GetOrCreateSystem<EffectSystem>();
            _turnStateSystem = _ecsWorld.GetOrCreateSystem<TurnStateMachineSystem>();

            simulationSystemGroup.AddSystemToUpdateList(gameInitSystem);
            simulationSystemGroup.AddSystemToUpdateList(cardDrawSystem);
            simulationSystemGroup.AddSystemToUpdateList(cardPlaySystem);
            simulationSystemGroup.AddSystemToUpdateList(purchaseSystem);
            simulationSystemGroup.AddSystemToUpdateList(turnSystem);
            simulationSystemGroup.AddSystemToUpdateList(_effectSystem);
            simulationSystemGroup.AddSystemToUpdateList(_turnStateSystem);

            CreateGameStateEntity();
        }
    }

    private void InitializeGameSystems()
    {
        if (ActionLoggerSystem.Instance == null)
        {
            GameObject loggerObj = new GameObject("ActionLoggerSystem");
            loggerObj.AddComponent<ActionLoggerSystem>();
        }

        if (GameSnapshotSystem.Instance == null)
        {
            GameObject snapshotObj = new GameObject("GameSnapshotSystem");
            snapshotObj.AddComponent<GameSnapshotSystem>();
        }

        if (ReplayStorageSystem.Instance == null)
        {
            GameObject storageObj = new GameObject("ReplayStorageSystem");
            storageObj.AddComponent<ReplayStorageSystem>();
        }

        if (ReplayPlayerSystem.Instance == null)
        {
            GameObject playerObj = new GameObject("ReplayPlayerSystem");
            playerObj.AddComponent<ReplayPlayerSystem>();
        }
    }

    private void CreateGameStateEntity()
    {
        var entityManager = _ecsWorld.EntityManager;
        Entity gameStateEntity = entityManager.CreateEntity();
        entityManager.AddComponentData(gameStateEntity, new GameStateComponent
        {
            CurrentPhase = GameStateComponent.Phase.Waiting,
            CurrentPlayerId = -1,
            TurnNumber = 0,
            GameStarted = false,
            GameEnded = false,
            WinnerPlayerId = -1
        });
    }

    public override void OnServerAddPlayer(NetworkConnection conn)
    {
        if (_gameStarted)
        {
            AddSpectator(conn);
            return;
        }

        if (_connectedPlayers.Count >= MaxPlayers)
        {
            AddSpectator(conn);
            return;
        }

        int playerId = _connectedPlayers.Count;
        GameObject playerObj = Instantiate(playerPrefab);
        NetworkServer.AddPlayerForConnection(conn, playerObj);

        PlayerNetworkObject playerNet = playerObj.GetComponent<PlayerNetworkObject>();
        if (playerNet != null)
        {
            playerNet.PlayerId = playerId;
            playerNet.PlayerName = $"Player {playerId + 1}";
            _connectedPlayers.Add(playerNet);

            CreatePlayerEntity(playerId, playerNet.PlayerName);

            NotifyAllPlayersUpdated();
        }
    }

    private void AddSpectator(NetworkConnection conn)
    {
        if (_connectedSpectators.Count >= MaxSpectators)
        {
            conn.Disconnect();
            return;
        }

        int spectatorId = _connectedSpectators.Count;
        GameObject spectatorObj = Instantiate(SpectatorPrefab);
        NetworkServer.AddPlayerForConnection(conn, spectatorObj);

        SpectatorNetworkObject spectatorNet = spectatorObj.GetComponent<SpectatorNetworkObject>();
        if (spectatorNet != null)
        {
            spectatorNet.SpectatorId = spectatorId;
            spectatorNet.SpectatorName = $"Spectator {spectatorId + 1}";
            _connectedSpectators.Add(spectatorNet);

            SendInitialStateToSpectator(spectatorNet);
            NotifySpectatorsUpdated();
        }
    }

    private void SendInitialStateToSpectator(SpectatorNetworkObject spectator)
    {
        if (spectator == null) return;

        int currentTurnPlayerId = GetCurrentTurnPlayerId();
        
        var playersData = GetSpectatorPlayerData();
        var shopData = GetSpectatorShopData();
        var recentLogs = GetRecentLogs();

        List<string> playerNames = new List<string>();
        List<int> playerIds = new List<int>();
        List<int> victoryPoints = new List<int>();
        List<int> handCounts = new List<int>();
        List<int> deckCounts = new List<int>();
        List<int> discardCounts = new List<int>();
        List<bool> isCurrentTurn = new List<bool>();

        foreach (var pd in playersData)
        {
            playerNames.Add(pd.PlayerName);
            playerIds.Add(pd.PlayerId);
            victoryPoints.Add(pd.VictoryPoints);
            handCounts.Add(pd.HandCount);
            deckCounts.Add(pd.DeckCount);
            discardCounts.Add(pd.DiscardCount);
            isCurrentTurn.Add(pd.IsCurrentTurn);
        }

        List<int> shopSlotIndices = new List<int>();
        List<int> shopCardTypes = new List<int>();
        List<int> shopCosts = new List<int>();
        List<int> shopRemainingCounts = new List<int>();
        List<string> shopNames = new List<string>();

        foreach (var sd in shopData)
        {
            shopSlotIndices.Add(sd.SlotIndex);
            shopCardTypes.Add(sd.CardType);
            shopCosts.Add(sd.Cost);
            shopRemainingCounts.Add(sd.RemainingCount);
            shopNames.Add(sd.Name);
        }

        List<int> logPlayerIds = new List<int>();
        List<int> logActionTypes = new List<int>();
        List<string> logDescriptions = new List<string>();
        List<string> logDetails = new List<string>();
        List<int> logTurnNumbers = new List<int>();
        List<int> logCardTypes = new List<int>();
        List<int> logCardCosts = new List<int>();
        List<int> logShopSlots = new List<int>();

        foreach (var log in recentLogs)
        {
            logPlayerIds.Add(log.PlayerId);
            logActionTypes.Add((int)log.ActionType);
            logDescriptions.Add(log.Description);
            logDetails.Add(log.Details);
            logTurnNumbers.Add(log.TurnNumber);
            logCardTypes.Add(log.CardTypeInt);
            logCardCosts.Add(log.CardCost);
            logShopSlots.Add(log.ShopSlotIndex);
        }

        spectator.TargetReceiveInitialState(
            spectator.connectionToClient,
            currentTurnPlayerId,
            playerNames.ToArray(),
            playerIds.ToArray(),
            victoryPoints.ToArray(),
            handCounts.ToArray(),
            deckCounts.ToArray(),
            discardCounts.ToArray(),
            isCurrentTurn.ToArray(),
            shopSlotIndices.ToArray(),
            shopCardTypes.ToArray(),
            shopCosts.ToArray(),
            shopRemainingCounts.ToArray(),
            shopNames.ToArray(),
            recentLogs.Count,
            logPlayerIds.ToArray(),
            logActionTypes.ToArray(),
            logDescriptions.ToArray(),
            logDetails.ToArray(),
            logTurnNumbers.ToArray(),
            logCardTypes.ToArray(),
            logCardCosts.ToArray(),
            logShopSlots.ToArray()
        );
    }

    private List<SpectatorPlayerData> GetSpectatorPlayerData()
    {
        var playerData = new List<SpectatorPlayerData>();
        var entityManager = _ecsWorld.EntityManager;

        foreach (var player in _connectedPlayers)
        {
            playerData.Add(new SpectatorPlayerData
            {
                PlayerId = player.PlayerId,
                PlayerName = player.PlayerName,
                VictoryPoints = player.VictoryPoints.Value,
                HandCount = player.HandCount.Value,
                DeckCount = player.DeckCount.Value,
                DiscardCount = player.DiscardCount.Value,
                IsCurrentTurn = player.IsCurrentTurn.Value
            });
        }

        return playerData;
    }

    private List<ShopItemData> GetSpectatorShopData()
    {
        var shopData = new List<ShopItemData>();
        var entityManager = _ecsWorld.EntityManager;

        var shopQuery = entityManager.CreateEntityQuery(typeof(ShopCardComponent));
        var shopItems = shopQuery.ToEntityArray(Allocator.Temp);

        foreach (var entity in shopItems)
        {
            var shopCard = entityManager.GetComponentData<ShopCardComponent>(entity);
            shopData.Add(new ShopItemData
            {
                SlotIndex = shopCard.ShopSlotIndex,
                CardType = (int)shopCard.CardData.CardType,
                Cost = shopCard.CardData.Cost,
                RemainingCount = shopCard.RemainingCount,
                Name = shopCard.CardData.Name
            });
        }

        shopItems.Dispose();
        return shopData;
    }

    private List<PlayerActionLog> GetRecentLogs()
    {
        if (ActionLoggerSystem.Instance == null)
        {
            return new List<PlayerActionLog>();
        }
        return ActionLoggerSystem.Instance.GetRecentLogs(50);
    }

    private int GetCurrentTurnPlayerId()
    {
        var entityManager = _ecsWorld.EntityManager;
        var gameStateQuery = entityManager.CreateEntityQuery(typeof(GameStateComponent));
        
        if (gameStateQuery.IsEmpty) return -1;

        var gameState = gameStateQuery.GetSingleton<GameStateComponent>();
        return gameState.CurrentPlayerId;
    }

    private void CreatePlayerEntity(int playerId, string playerName)
    {
        var entityManager = _ecsWorld.EntityManager;
        Entity playerEntity = entityManager.CreateEntity();
        entityManager.AddComponentData(playerEntity, new PlayerComponent
        {
            PlayerId = playerId,
            VictoryPoints = 0,
            Coins = 0,
            Actions = 1,
            Buys = 1,
            IsLocalPlayer = false,
            IsCurrentTurn = false,
            PlayerName = playerName
        });
        entityManager.AddComponentData(playerEntity, new DeckSizeComponent { Value = 0 });
        entityManager.AddComponentData(playerEntity, new HandSizeComponent { Value = 0 });
        entityManager.AddComponentData(playerEntity, new DiscardSizeComponent { Value = 0 });
    }

    public override void OnServerDisconnect(NetworkConnection conn)
    {
        PlayerNetworkObject player = conn.identity?.GetComponent<PlayerNetworkObject>();
        if (player != null)
        {
            _connectedPlayers.Remove(player);
            NotifyAllPlayersUpdated();
        }

        SpectatorNetworkObject spectator = conn.identity?.GetComponent<SpectatorNetworkObject>();
        if (spectator != null)
        {
            _connectedSpectators.Remove(spectator);
            NotifySpectatorsUpdated();
        }

        base.OnServerDisconnect(conn);
    }

    public void StartHostGame()
    {
        StartHost();
    }

    public void JoinGame(string ipAddress)
    {
        networkAddress = ipAddress;
        StartClient();
    }

    [Server]
    public bool CanStartGame()
    {
        return _connectedPlayers.Count >= MinPlayers && _connectedPlayers.Count <= MaxPlayers && !_gameStarted;
    }

    [Server]
    public void ServerStartGame()
    {
        if (!CanStartGame()) return;

        _gameStarted = true;
        _effectSystem.IsServer = true;
        _gameStartTime = System.DateTime.Now;

        if (ActionLoggerSystem.Instance != null)
        {
            ActionLoggerSystem.Instance.StartRecording();
        }

        if (GameSnapshotSystem.Instance != null)
        {
            GameSnapshotSystem.Instance.SetWorld(_ecsWorld);
            GameSnapshotSystem.Instance.StartRecording();
        }

        var gameState = _ecsWorld.EntityManager.CreateEntityQuery(typeof(GameStateComponent)).GetSingleton<GameStateComponent>();
        gameState.GameStarted = true;
        _ecsWorld.EntityManager.CreateEntityQuery(typeof(GameStateComponent)).SetSingleton(gameState);

        var gameInitSystem = _ecsWorld.GetOrCreateSystem<GameInitializationSystem>();
        _ecsWorld.Update();

        InitializeAllPlayersDecks();
        StartFirstPlayerTurn();

        RpcGameStarted();
    }

    private void InitializeAllPlayersDecks()
    {
        var entityManager = _ecsWorld.EntityManager;
        
        foreach (var player in _connectedPlayers)
        {
            for (int i = 0; i < 7; i++)
            {
                CardData copperData = CardFactory.CreateCardData(CardType.Copper);
                CardFactory.CreateCardEntityInDeck(entityManager, copperData, player.PlayerId, i);
            }

            for (int i = 7; i < 10; i++)
            {
                CardData estateData = CardFactory.CreateCardData(CardType.Estate);
                CardFactory.CreateCardEntityInDeck(entityManager, estateData, player.PlayerId, i);
            }

            ShufflePlayerDeck(player.PlayerId);
            UpdatePlayerNetworkStats(player);
        }
    }

    private void ShufflePlayerDeck(int playerId)
    {
        var entityManager = _ecsWorld.EntityManager;
        NativeList<Entity> deckCards = new NativeList<Entity>(Allocator.Temp);
        
        Entities
            .WithWorld(_ecsWorld)
            .ForEach((Entity entity, in InDeckComponent inDeck, in CardDataComponent cardData) =>
            {
                if (inDeck.PlayerId == playerId)
                {
                    deckCards.Add(entity);
                }
            }).Run();

        for (int i = 0; i < deckCards.Length; i++)
        {
            int j = Random.Range(i, deckCards.Length);
            var temp = deckCards[i];
            deckCards[i] = deckCards[j];
            deckCards[j] = temp;
        }

        for (int i = 0; i < deckCards.Length; i++)
        {
            var inDeck = entityManager.GetComponentData<InDeckComponent>(deckCards[i]);
            inDeck.DeckIndex = i;
            entityManager.SetComponentData(deckCards[i], inDeck);
        }

        deckCards.Dispose();
    }

    private void StartFirstPlayerTurn()
    {
        if (_connectedPlayers.Count == 0) return;

        int firstPlayerId = 0;
        var firstPlayer = _connectedPlayers[0];

        SetPlayerAsCurrent(firstPlayerId);
        _turnStateSystem.StartPlayerTurn(firstPlayerId);
        DrawInitialCards(firstPlayerId);
        UpdatePlayerNetworkStats(firstPlayer);

        if (ActionLoggerSystem.Instance != null)
        {
            ActionLoggerSystem.Instance.SetCurrentTurnNumber(1);
            ActionLoggerSystem.Instance.LogStartTurn(firstPlayerId, firstPlayer.PlayerName);
        }

        if (GameSnapshotSystem.Instance != null)
        {
            GameSnapshotSystem.Instance.CaptureSnapshot(1, firstPlayerId);
        }

        SyncHandToClient(firstPlayer);
        BroadcastGameStateToSpectators();
    }

    private void SetPlayerAsCurrent(int playerId)
    {
        var entityManager = _ecsWorld.EntityManager;

        var playerQuery = entityManager.CreateEntityQuery(typeof(PlayerComponent));
        var players = playerQuery.ToEntityArray(Allocator.Temp);

        foreach (var entity in players)
        {
            var player = entityManager.GetComponentData<PlayerComponent>(entity);
            player.IsCurrentTurn = player.PlayerId == playerId;
            entityManager.SetComponentData(entity, player);
        }

        players.Dispose();

        var gameState = entityManager.CreateEntityQuery(typeof(GameStateComponent)).GetSingleton<GameStateComponent>();
        gameState.CurrentPlayerId = playerId;
        entityManager.CreateEntityQuery(typeof(GameStateComponent)).SetSingleton(gameState);
    }

    private void DrawInitialCards(int playerId)
    {
        var drawSystem = _ecsWorld.GetOrCreateSystem<CardDrawSystem>();
        drawSystem.DrawCards(playerId, 5);
    }

    [Server]
    public void ServerPlayCard(int playerId, int cardIndex)
    {
        if (!_gameStarted) return;

        var entityManager = _ecsWorld.EntityManager;
        
        Entity cardEntity = FindCardInHand(playerId, cardIndex);
        if (cardEntity == Entity.Null) return;

        var cardData = entityManager.GetComponentData<CardDataComponent>(cardEntity);
        var effect = entityManager.GetComponentData<EffectComponent>(cardEntity);
        var player = GetPlayerById(playerId);

        if (ActionLoggerSystem.Instance != null)
        {
            ActionLoggerSystem.Instance.LogPlayCard(
                playerId,
                player?.PlayerName ?? $"Player {playerId}",
                cardData.Value.CardType,
                cardData.Value.Cost,
                cardData.Value.Description
            );
        }

        _effectSystem.RequestApplyEffect(
            playerId,
            effect.Type,
            effect.Value,
            (int)cardData.Value.CardType,
            cardEntity
        );

        MoveCardToPlayArea(cardEntity, playerId);
        UpdatePlayerNetworkStats(player);
        SyncHandToClient(player);

        _ecsWorld.Update();
        BroadcastGameStateToSpectators();
        RpcUpdateGameState();
    }

    private Entity FindCardInHand(int playerId, int cardIndex)
    {
        var entityManager = _ecsWorld.EntityManager;
        var result = Entity.Null;

        var handQuery = entityManager.CreateEntityQuery(
            typeof(InHandComponent),
            typeof(CardDataComponent)
        );

        var cards = handQuery.ToEntityArray(Allocator.Temp);

        foreach (var card in cards)
        {
            var inHand = entityManager.GetComponentData<InHandComponent>(card);
            if (inHand.PlayerId == playerId && inHand.HandIndex == cardIndex)
            {
                result = card;
                break;
            }
        }

        cards.Dispose();
        return result;
    }

    private void MoveCardToPlayArea(Entity cardEntity, int playerId)
    {
        var entityManager = _ecsWorld.EntityManager;
        
        entityManager.RemoveComponent<InHandComponent>(cardEntity);
        entityManager.AddComponentData(cardEntity, new InPlayComponent
        {
            PlayerId = playerId
        });

        ReindexHand(playerId);
    }

    private void ReindexHand(int playerId)
    {
        var entityManager = _ecsWorld.EntityManager;
        NativeList<Entity> handCards = new NativeList<Entity>(Allocator.Temp);
        
        var handQuery = entityManager.CreateEntityQuery(typeof(InHandComponent));
        var cards = handQuery.ToEntityArray(Allocator.Temp);

        foreach (var card in cards)
        {
            var inHand = entityManager.GetComponentData<InHandComponent>(card);
            if (inHand.PlayerId == playerId)
            {
                handCards.Add(card);
            }
        }

        cards.Dispose();

        for (int i = 0; i < handCards.Length; i++)
        {
            var inHand = entityManager.GetComponentData<InHandComponent>(handCards[i]);
            inHand.HandIndex = i;
            entityManager.SetComponentData(handCards[i], inHand);
        }

        handCards.Dispose();
    }

    [Server]
    public void ServerPurchaseCard(int playerId, int shopSlotIndex)
    {
        if (!_gameStarted) return;

        var entityManager = _ecsWorld.EntityManager;
        var shopQuery = entityManager.CreateEntityQuery(typeof(ShopCardComponent));
        var shopItems = shopQuery.ToEntityArray(Allocator.Temp);
        
        CardType cardType = CardType.Copper;
        int cost = 0;
        Entity shopEntity = Entity.Null;

        foreach (var entity in shopItems)
        {
            var shopCard = entityManager.GetComponentData<ShopCardComponent>(entity);
            if (shopCard.ShopSlotIndex == shopSlotIndex)
            {
                cardType = shopCard.CardData.CardType;
                cost = shopCard.CardData.Cost;
                shopEntity = entity;
                break;
            }
        }

        shopItems.Dispose();

        var player = GetPlayerById(playerId);

        if (ActionLoggerSystem.Instance != null)
        {
            ActionLoggerSystem.Instance.LogPurchaseCard(
                playerId,
                player?.PlayerName ?? $"Player {playerId}",
                cardType,
                cost,
                shopSlotIndex
            );
        }

        _effectSystem.RequestPurchase(playerId, shopSlotIndex);
        _ecsWorld.Update();

        UpdatePlayerNetworkStats(player);
        
        BroadcastGameStateToSpectators();
        RpcUpdateGameState();
    }

    [Server]
    public void ServerEndTurn(int playerId)
    {
        if (!_gameStarted) return;

        var player = GetPlayerById(playerId);
        if (player == null) return;

        if (ActionLoggerSystem.Instance != null)
        {
            ActionLoggerSystem.Instance.LogEndTurn(playerId, player.PlayerName);
        }

        _effectSystem.RequestTurnEnd(playerId);
        _ecsWorld.Update();

        _turnStateSystem.EndPlayerTurn(playerId);
        
        int nextPlayerId = GetNextPlayerId(playerId);
        StartPlayerTurn(nextPlayerId);
        
        BroadcastGameStateToSpectators();
        RpcUpdateGameState();
    }

    private void StartPlayerTurn(int playerId)
    {
        var player = GetPlayerById(playerId);
        if (player == null) return;

        SetPlayerAsCurrent(playerId);
        _turnStateSystem.StartPlayerTurn(playerId);
        DrawInitialCards(playerId);
        UpdatePlayerNetworkStats(player);

        var entityManager = _ecsWorld.EntityManager;
        var gameState = entityManager.CreateEntityQuery(typeof(GameStateComponent)).GetSingleton<GameStateComponent>();

        if (ActionLoggerSystem.Instance != null)
        {
            ActionLoggerSystem.Instance.SetCurrentTurnNumber(gameState.TurnNumber);
            ActionLoggerSystem.Instance.LogStartTurn(playerId, player.PlayerName);
        }

        if (GameSnapshotSystem.Instance != null)
        {
            GameSnapshotSystem.Instance.CaptureSnapshot(gameState.TurnNumber, playerId);
        }

        SyncHandToClient(player);
    }

    private int GetNextPlayerId(int currentPlayerId)
    {
        int currentIndex = _connectedPlayers.FindIndex(p => p.PlayerId == currentPlayerId);
        int nextIndex = (currentIndex + 1) % _connectedPlayers.Count;
        return _connectedPlayers[nextIndex].PlayerId;
    }

    private PlayerNetworkObject GetPlayerById(int playerId)
    {
        return _connectedPlayers.Find(p => p.PlayerId == playerId);
    }

    private void UpdatePlayerNetworkStats(PlayerNetworkObject player)
    {
        if (player == null) return;

        var entityManager = _ecsWorld.EntityManager;
        
        var playerQuery = entityManager.CreateEntityQuery(typeof(PlayerComponent));
        var players = playerQuery.ToEntityArray(Allocator.Temp);

        foreach (var entity in players)
        {
            var playerData = entityManager.GetComponentData<PlayerComponent>(entity);
            if (playerData.PlayerId == player.PlayerId)
            {
                player.VictoryPoints.Value = playerData.VictoryPoints;
                player.Coins.Value = playerData.Coins;
                player.Actions.Value = playerData.Actions;
                player.Buys.Value = playerData.Buys;
                player.IsCurrentTurn.Value = playerData.IsCurrentTurn;
                break;
            }
        }

        players.Dispose();

        int deckCount = CountCardsInLocation(player.PlayerId, "Deck");
        int handCount = CountCardsInLocation(player.PlayerId, "Hand");
        int discardCount = CountCardsInLocation(player.PlayerId, "Discard");
        int playCount = CountCardsInLocation(player.PlayerId, "Play");

        player.DeckCount.Value = deckCount;
        player.HandCount.Value = handCount;
        player.DiscardCount.Value = discardCount;
        player.PlayAreaCount.Value = playCount;
    }

    private int CountCardsInLocation(int playerId, string location)
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

    private void SyncHandToClient(PlayerNetworkObject player)
    {
        if (player == null || !player.isLocalPlayer) return;

        var entityManager = _ecsWorld.EntityManager;
        var handCards = new List<NetworkCardData>();

        var handQuery = entityManager.CreateEntityQuery(
            typeof(InHandComponent),
            typeof(CardDataComponent)
        );

        var cards = handQuery.ToEntityArray(Allocator.Temp);

        foreach (var card in cards)
        {
            var inHand = entityManager.GetComponentData<InHandComponent>(card);
            if (inHand.PlayerId == player.PlayerId)
            {
                var cardData = entityManager.GetComponentData<CardDataComponent>(card);
                handCards.Add(new NetworkCardData
                {
                    CardId = card.Index,
                    CardTypeInt = (int)cardData.Value.CardType,
                    OwnerId = player.PlayerId,
                    Location = "Hand",
                    LocationIndex = inHand.HandIndex
                });
            }
        }

        cards.Dispose();
    }

    private void BroadcastGameStateToSpectators()
    {
        if (_connectedSpectators.Count == 0) return;

        int currentTurnPlayerId = GetCurrentTurnPlayerId();
        var entityManager = _ecsWorld.EntityManager;
        var gameState = entityManager.CreateEntityQuery(typeof(GameStateComponent)).GetSingleton<GameStateComponent>();

        foreach (var spectator in _connectedSpectators)
        {
            spectator.RpcGameStateUpdated(
                currentTurnPlayerId,
                gameState.TurnNumber,
                gameState.GameEnded,
                gameState.WinnerPlayerId
            );
        }
    }

    public void SaveCurrentReplay()
    {
        if (ReplayStorageSystem.Instance == null || GameSnapshotSystem.Instance == null || ActionLoggerSystem.Instance == null)
        {
            Debug.LogError("Cannot save replay: systems not initialized");
            return;
        }

        var snapshots = GameSnapshotSystem.Instance.GetAllSnapshots();
        var logs = ActionLoggerSystem.Instance.GetAllLogs();

        if (snapshots.Count == 0)
        {
            Debug.LogWarning("No snapshots to save");
            return;
        }

        var lastSnapshot = GameSnapshotSystem.Instance.GetLatestSnapshot();
        var winnerPlayer = GetPlayerById(lastSnapshot.GameState.WinnerPlayerId);

        GameReplayData replayData = new GameReplayData
        {
            GameId = System.Guid.NewGuid().ToString(),
            RecordedAt = System.DateTime.Now,
            PlayerCount = _connectedPlayers.Count,
            TotalTurns = lastSnapshot.TurnNumber,
            WinnerName = winnerPlayer?.PlayerName ?? "Unknown",
            WinnerId = lastSnapshot.GameState.WinnerPlayerId,
            DurationSeconds = (float)(System.DateTime.Now - _gameStartTime).TotalSeconds,
            Snapshots = snapshots,
            ActionLogs = logs,
            PlayerNames = new List<string>()
        };

        foreach (var player in _connectedPlayers)
        {
            replayData.PlayerNames.Add(player.PlayerName);
        }

        ReplayStorageSystem.Instance.SaveReplay(replayData);
        Debug.Log("Replay saved successfully!");
    }

    [ClientRpc]
    private void RpcGameStarted()
    {
        _gameStarted = true;
        UIManager.Instance?.OnGameStarted();
    }

    [ClientRpc]
    private void RpcUpdateGameState()
    {
        UIManager.Instance?.UpdateUI();
    }

    private void NotifyAllPlayersUpdated()
    {
        RpcPlayerListUpdated();
    }

    private void NotifySpectatorsUpdated()
    {
        Debug.Log($"Spectators updated: {_connectedSpectators.Count} connected");
    }

    [ClientRpc]
    private void RpcPlayerListUpdated()
    {
        UIManager.Instance?.UpdatePlayerList(GetPlayersInfo());
    }

    public List<(int Id, string Name, bool Ready)> GetPlayersInfo()
    {
        var players = new List<(int Id, string Name, bool Ready)>();
        foreach (var player in _connectedPlayers)
        {
            players.Add((player.PlayerId, player.PlayerName, true));
        }
        return players;
    }

    public List<(int Id, string Name)> GetSpectatorsInfo()
    {
        var spectators = new List<(int Id, string Name)>();
        foreach (var spectator in _connectedSpectators)
        {
            spectators.Add((spectator.SpectatorId, spectator.SpectatorName));
        }
        return spectators;
    }

    public World GetECSWorld()
    {
        return _ecsWorld;
    }

    public bool IsGameStarted()
    {
        return _gameStarted;
    }

    public int GetPlayerCount()
    {
        return _connectedPlayers.Count;
    }

    public int GetSpectatorCount()
    {
        return _connectedSpectators.Count;
    }

    private void Update()
    {
        if (_ecsWorld != null && _gameStarted)
        {
            _ecsWorld.Update();
        }
    }

    protected override void OnDestroy()
    {
        base.OnDestroy();
        _ecsWorld?.Dispose();
        if (Instance == this)
        {
            Instance = null;
        }
    }
}
