using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;
using Unity.Entities;
using Mirror;

public class UIManager : MonoBehaviour
{
    public static UIManager Instance { get; private set; }

    [Header("主菜单")]
    public GameObject MainMenuPanel;
    public Button HostButton;
    public Button JoinButton;
    public Button JoinAsSpectatorButton;
    public Button LoadReplayButton;
    public InputField IPInputField;

    [Header("等待房间")]
    public GameObject LobbyPanel;
    public Transform PlayerListContent;
    public GameObject PlayerListItemPrefab;
    public Button StartGameButton;
    public Text SpectatorCountText;

    [Header("游戏界面")]
    public GameObject GamePanel;
    public Transform HandContainer;
    public Transform ShopContainer;
    public Transform ScoreboardContainer;
    public GameObject CardUIPrefab;
    public GameObject ShopItemPrefab;
    public GameObject PlayerScorePrefab;
    public Text TurnInfoText;
    public Text PlayerInfoText;
    public Text TurnStateText;
    public Button EndTurnButton;
    public Button SkipToBuyPhaseButton;

    [Header("观众界面")]
    public GameObject SpectatorPanel;
    public Transform SpectatorPlayerContainer;
    public GameObject SpectatorPlayerItemPrefab;
    public Transform SpectatorShopContainer;
    public GameObject SpectatorShopItemPrefab;
    public Transform ActionLogContainer;
    public GameObject ActionLogItemPrefab;
    public Text SpectatorTurnInfoText;

    [Header("回放界面")]
    public GameObject ReplayPanel;
    public Transform ReplayPlayerContainer;
    public Transform ReplayShopContainer;
    public Transform ReplayLogContainer;
    public Button PlayPauseButton;
    public Button NextFrameButton;
    public Button PrevFrameButton;
    public Button FirstFrameButton;
    public Button LastFrameButton;
    public Slider PlaybackSpeedSlider;
    public Text ReplayTurnInfoText;
    public Text ReplayProgressText;
    public Button CloseReplayButton;
    public GameObject ReplayPlayerItemPrefab;
    public GameObject ReplayShopItemPrefab;
    public GameObject ReplayLogItemPrefab;

    [Header("游戏结束")]
    public GameObject GameOverPanel;
    public Text WinnerText;
    public Button SaveReplayButton;

    [Header("回放列表")]
    public GameObject ReplayListPanel;
    public Transform ReplayListContent;
    public GameObject ReplayListItemPrefab;
    public Button CloseReplayListButton;

    [Header("通知")]
    public Text NotificationText;
    public GameObject NotificationPanel;

    private List<GameObject> _handCards = new List<GameObject>();
    private List<GameObject> _shopItems = new List<GameObject>();
    private List<GameObject> _scoreItems = new List<GameObject>();
    private List<GameObject> _spectatorPlayerItems = new List<GameObject>();
    private List<GameObject> _spectatorShopItems = new List<GameObject>();
    private List<GameObject> _actionLogItems = new List<GameObject>();
    private List<GameObject> _replayPlayerItems = new List<GameObject>();
    private List<GameObject> _replayShopItems = new List<GameObject>();
    private List<GameObject> _replayLogItems = new List<GameObject>();

    private PlayerNetworkObject _localPlayer;
    private SpectatorNetworkObject _localSpectator;
    private bool _isInitialized;
    private bool _isSpectatorMode;

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
        }
        else
        {
            Destroy(gameObject);
        }
    }

    private void Start()
    {
        SetupButtons();
        ShowMainMenu();
    }

    private void SetupButtons()
    {
        if (HostButton != null)
        {
            HostButton.onClick.AddListener(OnHostButtonClicked);
        }

        if (JoinButton != null)
        {
            JoinButton.onClick.AddListener(OnJoinButtonClicked);
        }

        if (JoinAsSpectatorButton != null)
        {
            JoinAsSpectatorButton.onClick.AddListener(OnJoinAsSpectatorButtonClicked);
        }

        if (LoadReplayButton != null)
        {
            LoadReplayButton.onClick.AddListener(OnLoadReplayButtonClicked);
        }

        if (StartGameButton != null)
        {
            StartGameButton.onClick.AddListener(OnStartGameButtonClicked);
        }

        if (EndTurnButton != null)
        {
            EndTurnButton.onClick.AddListener(OnEndTurnButtonClicked);
        }

        if (SkipToBuyPhaseButton != null)
        {
            SkipToBuyPhaseButton.onClick.AddListener(OnSkipToBuyPhaseClicked);
        }

        if (SaveReplayButton != null)
        {
            SaveReplayButton.onClick.AddListener(OnSaveReplayButtonClicked);
        }

        if (PlayPauseButton != null)
        {
            PlayPauseButton.onClick.AddListener(OnPlayPauseButtonClicked);
        }

        if (NextFrameButton != null)
        {
            NextFrameButton.onClick.AddListener(OnNextFrameButtonClicked);
        }

        if (PrevFrameButton != null)
        {
            PrevFrameButton.onClick.AddListener(OnPrevFrameButtonClicked);
        }

        if (FirstFrameButton != null)
        {
            FirstFrameButton.onClick.AddListener(OnFirstFrameButtonClicked);
        }

        if (LastFrameButton != null)
        {
            LastFrameButton.onClick.AddListener(OnLastFrameButtonClicked);
        }

        if (CloseReplayButton != null)
        {
            CloseReplayButton.onClick.AddListener(OnCloseReplayButtonClicked);
        }

        if (CloseReplayListButton != null)
        {
            CloseReplayListButton.onClick.AddListener(OnCloseReplayListButtonClicked);
        }

        if (PlaybackSpeedSlider != null)
        {
            PlaybackSpeedSlider.onValueChanged.AddListener(OnPlaybackSpeedChanged);
        }
    }

    private void OnHostButtonClicked()
    {
        if (GameNetworkManager.Instance != null)
        {
            GameNetworkManager.Instance.StartHostGame();
            ShowLobby();
        }
    }

    private void OnJoinButtonClicked()
    {
        if (GameNetworkManager.Instance != null && IPInputField != null)
        {
            string ip = string.IsNullOrEmpty(IPInputField.text) ? "localhost" : IPInputField.text;
            GameNetworkManager.Instance.JoinGame(ip);
            _isSpectatorMode = false;
            ShowLobby();
        }
    }

    private void OnJoinAsSpectatorButtonClicked()
    {
        if (GameNetworkManager.Instance != null && IPInputField != null)
        {
            string ip = string.IsNullOrEmpty(IPInputField.text) ? "localhost" : IPInputField.text;
            GameNetworkManager.Instance.JoinGame(ip);
            _isSpectatorMode = true;
            ShowLobby();
        }
    }

    private void OnLoadReplayButtonClicked()
    {
        ShowReplayList();
        LoadReplayFiles();
    }

    private void OnStartGameButtonClicked()
    {
        if (_localPlayer != null)
        {
            _localPlayer.StartGame();
        }
    }

    private void OnEndTurnButtonClicked()
    {
        if (_localPlayer != null && _localPlayer.CanInteract())
        {
            _localPlayer.EndTurn();
        }
    }

    private void OnSkipToBuyPhaseClicked()
    {
        if (_localPlayer != null && _localPlayer.IsCurrentTurn.Value && _localPlayer.GetTurnState() == TurnState.Action)
        {
            ShowNotification("切换到购买阶段");
        }
    }

    private void OnSaveReplayButtonClicked()
    {
        if (GameNetworkManager.Instance != null)
        {
            GameNetworkManager.Instance.SaveCurrentReplay();
            ShowNotification("回放已保存！");
        }
    }

    private void OnPlayPauseButtonClicked()
    {
        if (ReplayPlayerSystem.Instance != null)
        {
            ReplayPlayerSystem.Instance.TogglePause();
            UpdatePlayPauseButton();
        }
    }

    private void OnNextFrameButtonClicked()
    {
        if (ReplayPlayerSystem.Instance != null)
        {
            ReplayPlayerSystem.Instance.NextSnapshot();
        }
    }

    private void OnPrevFrameButtonClicked()
    {
        if (ReplayPlayerSystem.Instance != null)
        {
            ReplayPlayerSystem.Instance.PreviousSnapshot();
        }
    }

    private void OnFirstFrameButtonClicked()
    {
        if (ReplayPlayerSystem.Instance != null)
        {
            ReplayPlayerSystem.Instance.GoToFirstSnapshot();
        }
    }

    private void OnLastFrameButtonClicked()
    {
        if (ReplayPlayerSystem.Instance != null)
        {
            ReplayPlayerSystem.Instance.GoToLastSnapshot();
        }
    }

    private void OnCloseReplayButtonClicked()
    {
        if (ReplayPlayerSystem.Instance != null)
        {
            ReplayPlayerSystem.Instance.StopReplay();
        }
        ShowMainMenu();
    }

    private void OnCloseReplayListButtonClicked()
    {
        ShowMainMenu();
    }

    private void OnPlaybackSpeedChanged(float value)
    {
        if (ReplayPlayerSystem.Instance != null)
        {
            ReplayPlayerSystem.Instance.SetPlaybackSpeed(value);
        }
    }

    private void UpdatePlayPauseButton()
    {
        if (PlayPauseButton != null && ReplayPlayerSystem.Instance != null)
        {
            var text = PlayPauseButton.GetComponentInChildren<Text>();
            if (text != null)
            {
                text.text = ReplayPlayerSystem.Instance.IsPaused() ? "▶ 播放" : "⏸ 暂停";
            }
        }
    }

    public void ShowMainMenu()
    {
        HideAllPanels();
        if (MainMenuPanel != null) MainMenuPanel.SetActive(true);
        if (NotificationPanel != null) NotificationPanel.SetActive(false);
    }

    public void ShowLobby()
    {
        HideAllPanels();
        if (LobbyPanel != null) LobbyPanel.SetActive(true);
    }

    public void OnGameStarted()
    {
        HideAllPanels();
        
        if (_isSpectatorMode)
        {
            if (SpectatorPanel != null) SpectatorPanel.SetActive(true);
        }
        else
        {
            if (GamePanel != null) GamePanel.SetActive(true);
        }

        FindLocalPlayerOrSpectator();
        SubscribeToEvents();
        UpdateUI();
    }

    public void ShowReplayPanel()
    {
        HideAllPanels();
        if (ReplayPanel != null) ReplayPanel.SetActive(true);
    }

    public void ShowReplayList()
    {
        HideAllPanels();
        if (ReplayListPanel != null) ReplayListPanel.SetActive(true);
    }

    public void ShowGameOver(int winnerId)
    {
        HideAllPanels();
        if (GameOverPanel != null) GameOverPanel.SetActive(true);

        if (WinnerText != null)
        {
            WinnerText.text = $"玩家 {winnerId + 1} 获胜！";
        }
    }

    private void HideAllPanels()
    {
        if (MainMenuPanel != null) MainMenuPanel.SetActive(false);
        if (LobbyPanel != null) LobbyPanel.SetActive(false);
        if (GamePanel != null) GamePanel.SetActive(false);
        if (SpectatorPanel != null) SpectatorPanel.SetActive(false);
        if (ReplayPanel != null) ReplayPanel.SetActive(false);
        if (GameOverPanel != null) GameOverPanel.SetActive(false);
        if (ReplayListPanel != null) ReplayListPanel.SetActive(false);
        if (NotificationPanel != null) NotificationPanel.SetActive(false);
    }

    private void FindLocalPlayerOrSpectator()
    {
        var players = FindObjectsOfType<PlayerNetworkObject>();
        foreach (var player in players)
        {
            if (player.isLocalPlayer)
            {
                _localPlayer = player;
                _isInitialized = true;
                break;
            }
        }

        if (_localPlayer == null)
        {
            var spectators = FindObjectsOfType<SpectatorNetworkObject>();
            foreach (var spectator in spectators)
            {
                if (spectator.isLocalPlayer)
                {
                    _localSpectator = spectator;
                    _isSpectatorMode = true;
                    _isInitialized = true;
                    break;
                }
            }
        }
    }

    private void SubscribeToEvents()
    {
        if (_localPlayer != null)
        {
            _localPlayer.OnHandChanged += OnHandChanged;
            _localPlayer.OnResourcesChanged += OnResourcesChanged;
        }

        if (_localSpectator != null)
        {
            _localSpectator.OnActionLogReceived += OnActionLogReceived;
            _localSpectator.OnGameStateUpdated += OnSpectatorGameStateUpdated;
        }
    }

    private void UnsubscribeFromEvents()
    {
        if (_localPlayer != null)
        {
            _localPlayer.OnHandChanged -= OnHandChanged;
            _localPlayer.OnResourcesChanged -= OnResourcesChanged;
        }

        if (_localSpectator != null)
        {
            _localSpectator.OnActionLogReceived -= OnActionLogReceived;
            _localSpectator.OnGameStateUpdated -= OnSpectatorGameStateUpdated;
        }
    }

    private void OnHandChanged()
    {
        UpdateUI();
    }

    private void OnResourcesChanged()
    {
        UpdateUI();
    }

    public void OnActionLogReceived(PlayerActionLog logEntry)
    {
        AddActionLogItem(logEntry);
    }

    public void OnSpectatorGameStateUpdated(SpectatorGameState newState)
    {
        UpdateSpectatorUI();
    }

    public void OnSpectatorModeStarted()
    {
        _isSpectatorMode = true;
        Debug.Log("Spectator mode started");
    }

    public void OnCardPlayed(int playerId, int cardType)
    {
        ShowNotification($"玩家 {playerId + 1} 打出了一张卡牌");
    }

    public void OnCardPurchased(int playerId, int cardType)
    {
        ShowNotification($"玩家 {playerId + 1} 购买了一张卡牌");
    }

    public void OnTurnChanged(int newCurrentPlayerId)
    {
        if (_localPlayer != null)
        {
            if (newCurrentPlayerId == _localPlayer.PlayerId)
            {
                ShowNotification("轮到你的回合！");
            }
            else
            {
                ShowNotification($"轮到玩家 {newCurrentPlayerId + 1} 的回合");
            }
        }
        else
        {
            ShowNotification($"轮到玩家 {newCurrentPlayerId + 1} 的回合");
        }
        UpdateUI();
    }

    public void InitializeSpectatorView(int currentTurnPlayerId, 
                                       List<SpectatorPlayerData> playersData, 
                                       List<ShopItemData> shopData,
                                       List<PlayerActionLog> recentLogs)
    {
        UpdateSpectatorPlayerUI(playersData);
        UpdateSpectatorShopUI(shopData);
        
        foreach (var log in recentLogs)
        {
            AddActionLogItem(log);
        }

        if (SpectatorTurnInfoText != null)
        {
            SpectatorTurnInfoText.text = $"当前回合: 玩家 {currentTurnPlayerId + 1}";
        }
    }

    private void UpdateSpectatorUI()
    {
        if (GameNetworkManager.Instance == null) return;

        var ecsWorld = GameNetworkManager.Instance.GetECSWorld();
        if (ecsWorld == null) return;

        var entityManager = ecsWorld.EntityManager;

        var playersData = GetSpectatorPlayerData();
        var shopData = GetSpectatorShopData();

        UpdateSpectatorPlayerUI(playersData);
        UpdateSpectatorShopUI(shopData);
    }

    private List<SpectatorPlayerData> GetSpectatorPlayerData()
    {
        var players = FindObjectsOfType<PlayerNetworkObject>();
        var data = new List<SpectatorPlayerData>();

        foreach (var player in players)
        {
            data.Add(new SpectatorPlayerData
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

        return data;
    }

    private List<ShopItemData> GetSpectatorShopData()
    {
        if (GameNetworkManager.Instance == null) return new List<ShopItemData>();

        var ecsWorld = GameNetworkManager.Instance.GetECSWorld();
        if (ecsWorld == null) return new List<ShopItemData>();

        var entityManager = ecsWorld.EntityManager;
        var shopData = new List<ShopItemData>();

        var shopQuery = entityManager.CreateEntityQuery(typeof(ShopCardComponent));
        var shopItems = shopQuery.ToEntityArray(Unity.Collections.Allocator.Temp);

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

    private void UpdateSpectatorPlayerUI(List<SpectatorPlayerData> playersData)
    {
        if (SpectatorPlayerContainer == null || SpectatorPlayerItemPrefab == null) return;

        foreach (var item in _spectatorPlayerItems)
        {
            Destroy(item);
        }
        _spectatorPlayerItems.Clear();

        foreach (var player in playersData)
        {
            GameObject playerItem = Instantiate(SpectatorPlayerItemPrefab, SpectatorPlayerContainer);
            _spectatorPlayerItems.Add(playerItem);

            var texts = playerItem.GetComponentsInChildren<Text>();
            foreach (var text in texts)
            {
                if (text.name == "PlayerName")
                {
                    text.text = player.PlayerName;
                    text.color = player.IsCurrentTurn ? Color.green : Color.white;
                }
                else if (text.name == "VictoryPoints")
                {
                    text.text = $"荣誉点: {player.VictoryPoints}";
                }
                else if (text.name == "CardCounts")
                {
                    text.text = $"手牌: {player.HandCount} | 牌库: {player.DeckCount} | 弃牌: {player.DiscardCount}";
                }
            }
        }
    }

    private void UpdateSpectatorShopUI(List<ShopItemData> shopData)
    {
        if (SpectatorShopContainer == null || SpectatorShopItemPrefab == null) return;

        foreach (var item in _spectatorShopItems)
        {
            Destroy(item);
        }
        _spectatorShopItems.Clear();

        foreach (var shop in shopData)
        {
            GameObject shopItem = Instantiate(SpectatorShopItemPrefab, SpectatorShopContainer);
            _spectatorShopItems.Add(shopItem);

            var texts = shopItem.GetComponentsInChildren<Text>();
            foreach (var text in texts)
            {
                if (text.name == "CardName")
                {
                    text.text = shop.Name;
                }
                else if (text.name == "Cost")
                {
                    text.text = $"费用: {shop.Cost}";
                }
                else if (text.name == "Count")
                {
                    text.text = $"剩余: {shop.RemainingCount}";
                }
            }
        }
    }

    private void AddActionLogItem(PlayerActionLog logEntry)
    {
        if (ActionLogContainer == null || ActionLogItemPrefab == null) return;

        GameObject logItem = Instantiate(ActionLogItemPrefab, ActionLogContainer);
        _actionLogItems.Add(logItem);

        var text = logItem.GetComponentInChildren<Text>();
        if (text != null)
        {
            string timeString = logEntry.Timestamp.ToString("HH:mm:ss");
            text.text = $"[{timeString}] {logEntry.Description}";
        }

        if (_actionLogItems.Count > 100)
        {
            Destroy(_actionLogItems[0]);
            _actionLogItems.RemoveAt(0);
        }

        var scrollRect = ActionLogContainer.GetComponentInParent<ScrollRect>();
        if (scrollRect != null)
        {
            scrollRect.verticalNormalizedPosition = 0;
        }
    }

    private void ShowNotification(string message)
    {
        if (NotificationText != null && NotificationPanel != null)
        {
            NotificationText.text = message;
            NotificationPanel.SetActive(true);
            CancelInvoke(nameof(HideNotification));
            Invoke(nameof(HideNotification), 2.0f);
        }
    }

    private void HideNotification()
    {
        if (NotificationPanel != null)
        {
            NotificationPanel.SetActive(false);
        }
    }

    public void UpdatePlayerList(List<(int Id, string Name, bool Ready)> players)
    {
        if (PlayerListContent == null || PlayerListItemPrefab == null) return;

        foreach (Transform child in PlayerListContent)
        {
            Destroy(child.gameObject);
        }

        foreach (var player in players)
        {
            GameObject item = Instantiate(PlayerListItemPrefab, PlayerListContent);
            var text = item.GetComponentInChildren<Text>();
            if (text != null)
            {
                text.text = $"{player.Name} {(player.Ready ? "(已就绪)" : "")}";
            }
        }

        if (SpectatorCountText != null && GameNetworkManager.Instance != null)
        {
            int spectatorCount = GameNetworkManager.Instance.GetSpectatorCount();
            SpectatorCountText.text = $"观众人数: {spectatorCount}";
        }

        if (StartGameButton != null)
        {
            if (NetworkServer.active)
            {
                StartGameButton.gameObject.SetActive(!_isSpectatorMode);
                StartGameButton.interactable = players.Count >= 2;
            }
            else
            {
                StartGameButton.gameObject.SetActive(false);
            }
        }
    }

    public void UpdateUI()
    {
        if (_isSpectatorMode)
        {
            UpdateSpectatorUI();
            return;
        }

        if (GameNetworkManager.Instance == null) return;

        var ecsWorld = GameNetworkManager.Instance.GetECSWorld();
        if (ecsWorld == null) return;

        var entityManager = ecsWorld.EntityManager;

        UpdateGameState(entityManager);
        UpdateHandCards(entityManager);
        UpdateShop(entityManager);
        UpdateScoreboard(entityManager);
    }

    private void UpdateGameState(EntityManager entityManager)
    {
        var gameStateQuery = entityManager.CreateEntityQuery(typeof(GameStateComponent));
        if (gameStateQuery.IsEmpty) return;

        var gameState = gameStateQuery.GetSingleton<GameStateComponent>();

        if (gameState.GameEnded)
        {
            ShowGameOver(gameState.WinnerPlayerId);
            return;
        }

        if (TurnInfoText != null)
        {
            TurnInfoText.text = $"回合: {gameState.TurnNumber} | 当前玩家: {gameState.CurrentPlayerId + 1}";
        }

        if (_localPlayer != null && PlayerInfoText != null)
        {
            PlayerInfoText.text = $"钱币: {_localPlayer.Coins.Value} | 行动: {_localPlayer.Actions.Value} | 买: {_localPlayer.Buys.Value}";
        }

        if (_localPlayer != null && TurnStateText != null)
        {
            TurnStateText.text = GetTurnStateText(_localPlayer.GetTurnState());
            TurnStateText.color = _localPlayer.IsCurrentTurn.Value ? Color.green : Color.gray;
        }

        if (EndTurnButton != null && _localPlayer != null)
        {
            EndTurnButton.interactable = _localPlayer.CanInteract();
            EndTurnButton.gameObject.SetActive(_localPlayer.IsCurrentTurn.Value);
        }

        if (SkipToBuyPhaseButton != null && _localPlayer != null)
        {
            SkipToBuyPhaseButton.interactable = _localPlayer.IsCurrentTurn.Value && _localPlayer.GetTurnState() == TurnState.Action;
            SkipToBuyPhaseButton.gameObject.SetActive(_localPlayer.IsCurrentTurn.Value && _localPlayer.GetTurnState() == TurnState.Action);
        }
    }

    private string GetTurnStateText(TurnState state)
    {
        switch (state)
        {
            case TurnState.Waiting:
                return "等待中";
            case TurnState.Action:
                return "行动阶段";
            case TurnState.Buy:
                return "购买阶段";
            case TurnState.Cleanup:
                return "清理阶段";
            default:
                return "未知";
        }
    }

    private void UpdateHandCards(EntityManager entityManager)
    {
        if (HandContainer == null || CardUIPrefab == null || _localPlayer == null) return;

        foreach (var card in _handCards)
        {
            Destroy(card);
        }
        _handCards.Clear();

        int localPlayerId = _localPlayer.GetLocalPlayerId();

        var handQuery = entityManager.CreateEntityQuery(
            typeof(InHandComponent),
            typeof(CardDataComponent)
        );

        var cards = handQuery.ToEntityArray(Unity.Collections.Allocator.Temp);
        var sortedCards = new List<Entity>();

        foreach (var cardEntity in cards)
        {
            var inHand = entityManager.GetComponentData<InHandComponent>(cardEntity);
            if (inHand.PlayerId == localPlayerId)
            {
                sortedCards.Add(cardEntity);
            }
        }

        sortedCards.Sort((a, b) =>
        {
            var aHand = entityManager.GetComponentData<InHandComponent>(a);
            var bHand = entityManager.GetComponentData<InHandComponent>(b);
            return aHand.HandIndex.CompareTo(bHand.HandIndex);
        });

        for (int i = 0; i < sortedCards.Count; i++)
        {
            var cardEntity = sortedCards[i];
            var cardData = entityManager.GetComponentData<CardDataComponent>(cardEntity);
            
            GameObject cardUI = Instantiate(CardUIPrefab, HandContainer);
            _handCards.Add(cardUI);

            var cardUIComponent = cardUI.GetComponent<CardUI>();
            if (cardUIComponent != null)
            {
                cardUIComponent.Setup(cardData.Value, i, _localPlayer);
            }
        }

        cards.Dispose();
    }

    private void UpdateShop(EntityManager entityManager)
    {
        if (ShopContainer == null || ShopItemPrefab == null) return;

        foreach (var item in _shopItems)
        {
            Destroy(item);
        }
        _shopItems.Clear();

        var shopQuery = entityManager.CreateEntityQuery(typeof(ShopCardComponent));
        var shopItems = shopQuery.ToEntityArray(Unity.Collections.Allocator.Temp);

        foreach (var shopEntity in shopItems)
        {
            var shopCard = entityManager.GetComponentData<ShopCardComponent>(shopEntity);
            
            GameObject shopItemUI = Instantiate(ShopItemPrefab, ShopContainer);
            _shopItems.Add(shopItemUI);

            var shopItemComponent = shopItemUI.GetComponent<ShopItemUI>();
            if (shopItemComponent != null)
            {
                shopItemComponent.Setup(shopCard, _localPlayer);
            }
        }

        shopItems.Dispose();
    }

    private void UpdateScoreboard(EntityManager entityManager)
    {
        if (ScoreboardContainer == null || PlayerScorePrefab == null) return;

        foreach (var item in _scoreItems)
        {
            Destroy(item);
        }
        _scoreItems.Clear();

        var playerQuery = entityManager.CreateEntityQuery(typeof(PlayerComponent));
        var players = playerQuery.ToEntityArray(Unity.Collections.Allocator.Temp);

        foreach (var playerEntity in players)
        {
            var player = entityManager.GetComponentData<PlayerComponent>(playerEntity);
            
            GameObject scoreItemUI = Instantiate(PlayerScorePrefab, ScoreboardContainer);
            _scoreItems.Add(scoreItemUI);

            var text = scoreItemUI.GetComponentInChildren<Text>();
            if (text != null)
            {
                bool isCurrentTurn = _localPlayer != null && player.PlayerId == _localPlayer.PlayerId && _localPlayer.IsCurrentTurn.Value;
                string turnIndicator = isCurrentTurn ? " (当前回合)" : "";
                text.text = $"{player.PlayerName}{turnIndicator}: 荣誉点 {player.VictoryPoints}";
                
                if (isCurrentTurn)
                {
                    text.color = Color.green;
                }
            }
        }

        players.Dispose();
    }

    public void UpdateReplayUI(GameSnapshot snapshot, GameReplayData replayData)
    {
        if (ReplayTurnInfoText != null)
        {
            ReplayTurnInfoText.text = $"回放 - 回合 {snapshot.TurnNumber}";
        }

        if (ReplayProgressText != null && ReplayPlayerSystem.Instance != null)
        {
            int current = ReplayPlayerSystem.Instance.GetCurrentSnapshotIndex() + 1;
            int total = ReplayPlayerSystem.Instance.GetTotalSnapshots();
            ReplayProgressText.text = $"{current} / {total}";
        }

        UpdateReplayPlayers(snapshot);
        UpdateReplayShop(snapshot);
        UpdateReplayLogs(snapshot, replayData);
    }

    private void UpdateReplayPlayers(GameSnapshot snapshot)
    {
        if (ReplayPlayerContainer == null || ReplayPlayerItemPrefab == null) return;

        foreach (var item in _replayPlayerItems)
        {
            Destroy(item);
        }
        _replayPlayerItems.Clear();

        foreach (var player in snapshot.PlayerSnapshots)
        {
            GameObject playerItem = Instantiate(ReplayPlayerItemPrefab, ReplayPlayerContainer);
            _replayPlayerItems.Add(playerItem);

            var texts = playerItem.GetComponentsInChildren<Text>();
            foreach (var text in texts)
            {
                if (text.name == "PlayerName")
                {
                    text.text = player.PlayerName;
                    text.color = player.IsCurrentTurn ? Color.green : Color.white;
                }
                else if (text.name == "VictoryPoints")
                {
                    text.text = $"荣誉点: {player.VictoryPoints}";
                }
                else if (text.name == "CardCounts")
                {
                    text.text = $"手牌: {player.HandCount} | 牌库: {player.DeckCount} | 弃牌: {player.DiscardCount}";
                }
            }
        }
    }

    private void UpdateReplayShop(GameSnapshot snapshot)
    {
        if (ReplayShopContainer == null || ReplayShopItemPrefab == null) return;

        foreach (var item in _replayShopItems)
        {
            Destroy(item);
        }
        _replayShopItems.Clear();

        foreach (var shop in snapshot.ShopSnapshots)
        {
            GameObject shopItem = Instantiate(ReplayShopItemPrefab, ReplayShopContainer);
            _replayShopItems.Add(shopItem);

            var texts = shopItem.GetComponentsInChildren<Text>();
            foreach (var text in texts)
            {
                if (text.name == "CardName")
                {
                    text.text = shop.CardName;
                }
                else if (text.name == "Cost")
                {
                    text.text = $"费用: {shop.Cost}";
                }
                else if (text.name == "Count")
                {
                    text.text = $"剩余: {shop.RemainingCount}";
                }
            }
        }
    }

    private void UpdateReplayLogs(GameSnapshot snapshot, GameReplayData replayData)
    {
        if (ReplayLogContainer == null || ReplayLogItemPrefab == null) return;

        foreach (var item in _replayLogItems)
        {
            Destroy(item);
        }
        _replayLogItems.Clear();

        var logs = ReplayPlayerSystem.Instance?.GetLogsForCurrentSnapshot();
        if (logs == null) return;

        foreach (var log in logs)
        {
            GameObject logItem = Instantiate(ReplayLogItemPrefab, ReplayLogContainer);
            _replayLogItems.Add(logItem);

            var text = logItem.GetComponentInChildren<Text>();
            if (text != null)
            {
                text.text = log.Description;
            }
        }
    }

    private void LoadReplayFiles()
    {
        if (ReplayStorageSystem.Instance == null || ReplayListContent == null || ReplayListItemPrefab == null) return;

        foreach (Transform child in ReplayListContent)
        {
            Destroy(child.gameObject);
        }

        var replays = ReplayStorageSystem.Instance.GetAllReplaysInfo();
        
        foreach (var replay in replays)
        {
            GameObject replayItem = Instantiate(ReplayListItemPrefab, ReplayListContent);
            
            var texts = replayItem.GetComponentsInChildren<Text>();
            foreach (var text in texts)
            {
                if (text.name == "FileName")
                {
                    text.text = replay.FileName;
                }
                else if (text.name == "Info")
                {
                    text.text = $"{replay.Timestamp:yyyy-MM-dd HH:mm} | {replay.PlayerCount}人 | {replay.TotalTurns}回合 | 胜者: {replay.WinnerName}";
                }
            }

            var button = replayItem.GetComponentInChildren<Button>();
            if (button != null)
            {
                string filePath = replay.FilePath;
                button.onClick.AddListener(() => OnLoadReplayClicked(filePath));
            }
        }
    }

    private void OnLoadReplayClicked(string filePath)
    {
        if (ReplayStorageSystem.Instance == null) return;

        var replayData = ReplayStorageSystem.Instance.LoadReplay(filePath);
        if (replayData != null)
        {
            ShowReplayPanel();
            ReplayPlayerSystem.Instance?.PlayReplay(replayData);
        }
    }

    private void OnDestroy()
    {
        UnsubscribeFromEvents();
        if (Instance == this)
        {
            Instance = null;
        }
    }
}
