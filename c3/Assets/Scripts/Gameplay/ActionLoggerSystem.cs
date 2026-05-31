using UnityEngine;
using Mirror;
using System.Collections.Generic;

public class ActionLoggerSystem : MonoBehaviour
{
    public static ActionLoggerSystem Instance { get; private set; }

    private List<PlayerActionLog> _actionLogs = new List<PlayerActionLog>();
    private int _currentTurnNumber = 1;
    private bool _isRecording;

    public int MaxLogCount = 500;

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

    public void StartRecording()
    {
        _actionLogs.Clear();
        _currentTurnNumber = 1;
        _isRecording = true;
    }

    public void StopRecording()
    {
        _isRecording = false;
    }

    public void SetCurrentTurnNumber(int turnNumber)
    {
        _currentTurnNumber = turnNumber;
    }

    public void LogDrawCards(int playerId, string playerName, int cardCount)
    {
        if (!_isRecording) return;

        PlayerActionLog log = new PlayerActionLog
        {
            PlayerId = playerId,
            PlayerName = playerName,
            ActionType = ActionType.DrawCards,
            Description = $"{playerName} 抽了 {cardCount} 张牌",
            Details = $"抽牌数量: {cardCount}",
            TurnNumber = _currentTurnNumber,
            Timestamp = System.DateTime.Now,
            CardTypeInt = -1,
            CardCost = 0,
            ShopSlotIndex = -1
        };

        AddLog(log);
        BroadcastLog(log);
    }

    public void LogPlayCard(int playerId, string playerName, CardType cardType, int cost, string description)
    {
        if (!_isRecording) return;

        PlayerActionLog log = new PlayerActionLog
        {
            PlayerId = playerId,
            PlayerName = playerName,
            ActionType = ActionType.PlayCard,
            Description = $"{playerName} 打出了 {GetCardName(cardType)}",
            Details = description,
            TurnNumber = _currentTurnNumber,
            Timestamp = System.DateTime.Now,
            CardTypeInt = (int)cardType,
            CardCost = cost,
            ShopSlotIndex = -1
        };

        AddLog(log);
        BroadcastLog(log);
    }

    public void LogPurchaseCard(int playerId, string playerName, CardType cardType, int cost, int shopSlotIndex)
    {
        if (!_isRecording) return;

        PlayerActionLog log = new PlayerActionLog
        {
            PlayerId = playerId,
            PlayerName = playerName,
            ActionType = ActionType.PurchaseCard,
            Description = $"{playerName} 购买了 {GetCardName(cardType)}",
            Details = $"花费: {cost} 钱币",
            TurnNumber = _currentTurnNumber,
            Timestamp = System.DateTime.Now,
            CardTypeInt = (int)cardType,
            CardCost = cost,
            ShopSlotIndex = shopSlotIndex
        };

        AddLog(log);
        BroadcastLog(log);
    }

    public void LogEndTurn(int playerId, string playerName)
    {
        if (!_isRecording) return;

        PlayerActionLog log = new PlayerActionLog
        {
            PlayerId = playerId,
            PlayerName = playerName,
            ActionType = ActionType.EndTurn,
            Description = $"{playerName} 结束了回合",
            Details = $"回合 {_currentTurnNumber} 结束",
            TurnNumber = _currentTurnNumber,
            Timestamp = System.DateTime.Now,
            CardTypeInt = -1,
            CardCost = 0,
            ShopSlotIndex = -1
        };

        AddLog(log);
        BroadcastLog(log);
    }

    public void LogStartTurn(int playerId, string playerName)
    {
        if (!_isRecording) return;

        PlayerActionLog log = new PlayerActionLog
        {
            PlayerId = playerId,
            PlayerName = playerName,
            ActionType = ActionType.StartTurn,
            Description = $"{playerName} 开始了回合",
            Details = $"回合 {_currentTurnNumber} 开始",
            TurnNumber = _currentTurnNumber,
            Timestamp = System.DateTime.Now,
            CardTypeInt = -1,
            CardCost = 0,
            ShopSlotIndex = -1
        };

        AddLog(log);
        BroadcastLog(log);
    }

    public void LogGameEnd(int winnerPlayerId, string winnerName)
    {
        if (!_isRecording) return;

        PlayerActionLog log = new PlayerActionLog
        {
            PlayerId = winnerPlayerId,
            PlayerName = winnerName,
            ActionType = ActionType.GameEnd,
            Description = $"游戏结束！{winnerName} 获胜！",
            Details = $"最终胜利者: {winnerName}",
            TurnNumber = _currentTurnNumber,
            Timestamp = System.DateTime.Now,
            CardTypeInt = -1,
            CardCost = 0,
            ShopSlotIndex = -1
        };

        AddLog(log);
        BroadcastLog(log);
        StopRecording();
    }

    private void AddLog(PlayerActionLog log)
    {
        _actionLogs.Add(log);
        
        if (_actionLogs.Count > MaxLogCount)
        {
            _actionLogs.RemoveAt(0);
        }
    }

    private void BroadcastLog(PlayerActionLog log)
    {
        if (!NetworkServer.active) return;

        var spectatorObjects = FindObjectsOfType<SpectatorNetworkObject>();
        foreach (var spectator in spectatorObjects)
        {
            if (spectator.isServer)
            {
                spectator.RpcPlayerActionLogged(
                    log.PlayerId,
                    log.PlayerName,
                    (int)log.ActionType,
                    log.Description,
                    log.Details,
                    log.TurnNumber,
                    log.CardTypeInt,
                    log.CardCost,
                    log.ShopSlotIndex
                );
            }
        }

        var playerObjects = FindObjectsOfType<PlayerNetworkObject>();
        foreach (var player in playerObjects)
        {
            if (player.isServer)
            {
                player.RpcCardPlayed(log.PlayerId, log.CardTypeInt, 0);
            }
        }
    }

    private string GetCardName(CardType cardType)
    {
        return cardType switch
        {
            CardType.Copper => "铜币",
            CardType.Silver => "银币",
            CardType.Gold => "金币",
            CardType.Estate => "庄园",
            CardType.Duchy => "公国",
            CardType.Province => "行省",
            CardType.Market => "市场",
            _ => "未知卡牌"
        };
    }

    public List<PlayerActionLog> GetAllLogs()
    {
        return new List<PlayerActionLog>(_actionLogs);
    }

    public List<PlayerActionLog> GetLogsForTurn(int turnNumber)
    {
        return _actionLogs.FindAll(log => log.TurnNumber == turnNumber);
    }

    public List<PlayerActionLog> GetLogsForPlayer(int playerId)
    {
        return _actionLogs.FindAll(log => log.PlayerId == playerId);
    }

    public List<PlayerActionLog> GetRecentLogs(int count)
    {
        int startIndex = Mathf.Max(0, _actionLogs.Count - count);
        return _actionLogs.GetRange(startIndex, Mathf.Min(count, _actionLogs.Count - startIndex));
    }

    public int GetLogCount()
    {
        return _actionLogs.Count;
    }

    public bool IsRecording()
    {
        return _isRecording;
    }

    public void ClearLogs()
    {
        _actionLogs.Clear();
    }
}
