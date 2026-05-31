using UnityEngine;
using Mirror;
using System.Collections.Generic;

public class SpectatorNetworkObject : NetworkBehaviour
{
    [SyncVar]
    public int SpectatorId;
    
    [SyncVar]
    public string SpectatorName;

    private int _localSpectatorId = -1;
    private bool _isSpectatorMode;

    public delegate void OnPlayerActionLogDelegate(PlayerActionLog logEntry);
    public event OnPlayerActionLogDelegate OnActionLogReceived;

    public delegate void OnGameStateUpdatedDelegate();
    public event OnGameStateUpdatedDelegate OnGameStateUpdated;

    public override void OnStartLocalPlayer()
    {
        base.OnStartLocalPlayer();
        _localSpectatorId = SpectatorId;
        _isSpectatorMode = true;
        
        UIManager.Instance?.OnSpectatorModeStarted();
    }

    [TargetRpc]
    public void TargetReceiveInitialState(NetworkConnection target, int currentTurnPlayerId, 
                                        string[] playerNames,
                                        int[] playerIds,
                                        int[] victoryPoints,
                                        int[] handCounts,
                                        int[] deckCounts,
                                        int[] discardCounts,
                                        bool[] isCurrentTurn,
                                        int[] shopSlotIndices,
                                        int[] shopCardTypes,
                                        int[] shopCosts,
                                        int[] shopRemainingCounts,
                                        string[] shopNames,
                                        int logCount,
                                        int[] logPlayerIds,
                                        int[] logActionTypes,
                                        string[] logDescriptions,
                                        string[] logDetails,
                                        int[] logTurnNumbers,
                                        int[] logCardTypes,
                                        int[] logCardCosts,
                                        int[] logShopSlots)
    {
        UpdateFromServerState(currentTurnPlayerId, playerNames, playerIds, victoryPoints, 
                             handCounts, deckCounts, discardCounts, isCurrentTurn,
                             shopSlotIndices, shopCardTypes, shopCosts, shopRemainingCounts, shopNames,
                             logCount, logPlayerIds, logActionTypes, logDescriptions, logDetails,
                             logTurnNumbers, logCardTypes, logCardCosts, logShopSlots);
    }

    [ClientRpc]
    public void RpcPlayerActionLogged(int playerId, string playerName, int actionTypeInt, 
                                     string description, string details, int turnNumber,
                                     int cardTypeInt, int cardCost, int shopSlotIndex)
    {
        PlayerActionLog logEntry = new PlayerActionLog
        {
            PlayerId = playerId,
            PlayerName = playerName,
            ActionType = (ActionType)actionTypeInt,
            Description = description,
            Details = details,
            TurnNumber = turnNumber,
            Timestamp = System.DateTime.Now,
            CardTypeInt = cardTypeInt,
            CardCost = cardCost,
            ShopSlotIndex = shopSlotIndex
        };
        
        OnActionLogReceived?.Invoke(logEntry);
        UIManager.Instance?.OnActionLogReceived(logEntry);
    }

    [ClientRpc]
    public void RpcGameStateUpdated(int currentTurnPlayerId, int turnNumber, 
                                   bool gameEnded, int winnerPlayerId)
    {
        SpectatorGameState newState = new SpectatorGameState
        {
            CurrentTurnPlayerId = currentTurnPlayerId,
            TurnNumber = turnNumber,
            GameEnded = gameEnded,
            WinnerPlayerId = winnerPlayerId
        };
        
        OnGameStateUpdated?.Invoke();
        UIManager.Instance?.OnSpectatorGameStateUpdated(newState);
    }

    private void UpdateFromServerState(int currentTurnPlayerId, 
                                       string[] playerNames,
                                       int[] playerIds,
                                       int[] victoryPoints,
                                       int[] handCounts,
                                       int[] deckCounts,
                                       int[] discardCounts,
                                       bool[] isCurrentTurn,
                                       int[] shopSlotIndices,
                                       int[] shopCardTypes,
                                       int[] shopCosts,
                                       int[] shopRemainingCounts,
                                       string[] shopNames,
                                       int logCount,
                                       int[] logPlayerIds,
                                       int[] logActionTypes,
                                       string[] logDescriptions,
                                       string[] logDetails,
                                       int[] logTurnNumbers,
                                       int[] logCardTypes,
                                       int[] logCardCosts,
                                       int[] logShopSlots)
    {
        List<SpectatorPlayerData> playersData = new List<SpectatorPlayerData>();
        for (int i = 0; i < playerNames.Length; i++)
        {
            playersData.Add(new SpectatorPlayerData
            {
                PlayerId = playerIds[i],
                PlayerName = playerNames[i],
                VictoryPoints = victoryPoints[i],
                HandCount = handCounts[i],
                DeckCount = deckCounts[i],
                DiscardCount = discardCounts[i],
                IsCurrentTurn = isCurrentTurn[i]
            });
        }

        List<ShopItemData> shopData = new List<ShopItemData>();
        for (int i = 0; i < shopSlotIndices.Length; i++)
        {
            shopData.Add(new ShopItemData
            {
                SlotIndex = shopSlotIndices[i],
                CardType = shopCardTypes[i],
                Cost = shopCosts[i],
                RemainingCount = shopRemainingCounts[i],
                Name = shopNames[i]
            });
        }

        List<PlayerActionLog> recentLogs = new List<PlayerActionLog>();
        for (int i = 0; i < logCount; i++)
        {
            recentLogs.Add(new PlayerActionLog
            {
                PlayerId = logPlayerIds[i],
                ActionType = (ActionType)logActionTypes[i],
                Description = logDescriptions[i],
                Details = logDetails[i],
                TurnNumber = logTurnNumbers[i],
                Timestamp = System.DateTime.Now,
                CardTypeInt = logCardTypes[i],
                CardCost = logCardCosts[i],
                ShopSlotIndex = logShopSlots[i]
            });
        }

        UIManager.Instance?.InitializeSpectatorView(currentTurnPlayerId, playersData, shopData, recentLogs);

        foreach (var log in recentLogs)
        {
            OnActionLogReceived?.Invoke(log);
        }
    }

    public bool IsSpectatorMode()
    {
        return _isSpectatorMode;
    }

    public int GetLocalSpectatorId()
    {
        return _localSpectatorId;
    }
}

[System.Serializable]
public struct SpectatorPlayerData
{
    public int PlayerId;
    public string PlayerName;
    public int VictoryPoints;
    public int HandCount;
    public int DeckCount;
    public int DiscardCount;
    public bool IsCurrentTurn;
}

[System.Serializable]
public struct ShopItemData
{
    public int SlotIndex;
    public int CardType;
    public int Cost;
    public int RemainingCount;
    public string Name;
}

[System.Serializable]
public struct SpectatorGameState
{
    public int CurrentTurnPlayerId;
    public int TurnNumber;
    public bool GameEnded;
    public int WinnerPlayerId;
}

public enum ActionType
{
    DrawCards,
    PlayCard,
    PurchaseCard,
    EndTurn,
    StartTurn,
    GameEnd
}

[System.Serializable]
public struct PlayerActionLog
{
    public int PlayerId;
    public string PlayerName;
    public ActionType ActionType;
    public string Description;
    public string Details;
    public int TurnNumber;
    public System.DateTime Timestamp;
    public int CardTypeInt;
    public int CardCost;
    public int ShopSlotIndex;
}
