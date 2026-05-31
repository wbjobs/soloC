using UnityEngine;
using Mirror;
using Unity.Entities;
using System.Collections.Generic;

public enum TurnState
{
    Waiting,
    Action,
    Buy,
    Cleanup
}

[System.Serializable]
public struct NetworkCardData
{
    public int CardId;
    public int CardTypeInt;
    public int OwnerId;
    public string Location;
    public int LocationIndex;
}

public class PlayerNetworkObject : NetworkBehaviour
{
    [SyncVar]
    public int PlayerId;
    
    [SyncVar]
    public string PlayerName;

    public readonly NetworkVariable<int> VictoryPoints = new NetworkVariable<int>();
    public readonly NetworkVariable<int> Coins = new NetworkVariable<int>();
    public readonly NetworkVariable<int> Actions = new NetworkVariable<int>();
    public readonly NetworkVariable<int> Buys = new NetworkVariable<int>();
    public readonly NetworkVariable<bool> IsCurrentTurn = new NetworkVariable<bool>();
    public readonly NetworkVariable<TurnState> CurrentTurnState = new NetworkVariable<TurnState>(TurnState.Waiting);

    public readonly NetworkVariable<int> DeckCount = new NetworkVariable<int>();
    public readonly NetworkVariable<int> HandCount = new NetworkVariable<int>();
    public readonly NetworkVariable<int> DiscardCount = new NetworkVariable<int>();
    public readonly NetworkVariable<int> PlayAreaCount = new NetworkVariable<int>();

    private int _localPlayerId = -1;
    private List<NetworkCardData> _handCards = new List<NetworkCardData>();
    private bool _isInitialized;

    public delegate void OnHandChangedDelegate();
    public event OnHandChangedDelegate OnHandChanged;

    public delegate void OnResourcesChangedDelegate();
    public event OnResourcesChangedDelegate OnResourcesChanged;

    public override void OnStartLocalPlayer()
    {
        base.OnStartLocalPlayer();
        _localPlayerId = PlayerId;
        _isInitialized = true;

        VictoryPoints.OnValueChanged += OnVictoryPointsChanged;
        Coins.OnValueChanged += OnCoinsChanged;
        Actions.OnValueChanged += OnActionsChanged;
        Buys.OnValueChanged += OnBuysChanged;
        IsCurrentTurn.OnValueChanged += OnTurnChanged;
        CurrentTurnState.OnValueChanged += OnTurnStateChanged;
        HandCount.OnValueChanged += OnHandCountChanged;
    }

    public override void OnStopClient()
    {
        if (_isInitialized && isLocalPlayer)
        {
            VictoryPoints.OnValueChanged -= OnVictoryPointsChanged;
            Coins.OnValueChanged -= OnCoinsChanged;
            Actions.OnValueChanged -= OnActionsChanged;
            Buys.OnValueChanged -= OnBuysChanged;
            IsCurrentTurn.OnValueChanged -= OnTurnChanged;
            CurrentTurnState.OnValueChanged -= OnTurnStateChanged;
            HandCount.OnValueChanged -= OnHandCountChanged;
        }
    }

    [Command]
    public void CmdRequestPlayCard(int cardIndex)
    {
        if (!isServer) return;
        
        var networkManager = GameNetworkManager.Instance as GameNetworkManager;
        if (networkManager != null && IsCurrentTurn.Value)
        {
            networkManager.ServerPlayCard(PlayerId, cardIndex);
        }
    }

    [Command]
    public void CmdRequestPurchaseCard(int shopSlotIndex)
    {
        if (!isServer) return;
        
        var networkManager = GameNetworkManager.Instance as GameNetworkManager;
        if (networkManager != null && IsCurrentTurn.Value)
        {
            networkManager.ServerPurchaseCard(PlayerId, shopSlotIndex);
        }
    }

    [Command]
    public void CmdRequestEndTurn()
    {
        if (!isServer) return;
        
        var networkManager = GameNetworkManager.Instance as GameNetworkManager;
        if (networkManager != null && IsCurrentTurn.Value)
        {
            networkManager.ServerEndTurn(PlayerId);
        }
    }

    [Command]
    public void CmdRequestStartGame()
    {
        if (!isServer) return;
        
        var networkManager = GameNetworkManager.Instance as GameNetworkManager;
        if (networkManager != null && isServer)
        {
            networkManager.ServerStartGame();
        }
    }

    [TargetRpc]
    public void TargetSyncHandData(NetworkConnection target, NetworkCardData[] cards)
    {
        _handCards.Clear();
        _handCards.AddRange(cards);
        OnHandChanged?.Invoke();
    }

    [ClientRpc]
    public void RpcCardPlayed(int playerId, int cardType, int effectValue)
    {
        UIManager.Instance?.OnCardPlayed(playerId, cardType);
    }

    [ClientRpc]
    public void RpcCardPurchased(int playerId, int cardType, int cost)
    {
        UIManager.Instance?.OnCardPurchased(playerId, cardType);
    }

    [ClientRpc]
    public void RpcTurnChanged(int newCurrentPlayerId)
    {
        UIManager.Instance?.OnTurnChanged(newCurrentPlayerId);
    }

    private void OnVictoryPointsChanged(int oldValue, int newValue)
    {
        OnResourcesChanged?.Invoke();
    }

    private void OnCoinsChanged(int oldValue, int newValue)
    {
        OnResourcesChanged?.Invoke();
    }

    private void OnActionsChanged(int oldValue, int newValue)
    {
        OnResourcesChanged?.Invoke();
    }

    private void OnBuysChanged(int oldValue, int newValue)
    {
        OnResourcesChanged?.Invoke();
    }

    private void OnTurnChanged(bool oldValue, bool newValue)
    {
        OnResourcesChanged?.Invoke();
    }

    private void OnTurnStateChanged(TurnState oldState, TurnState newState)
    {
        OnResourcesChanged?.Invoke();
    }

    private void OnHandCountChanged(int oldCount, int newCount)
    {
        OnHandChanged?.Invoke();
    }

    public void PlayCard(int cardIndex)
    {
        if (isLocalPlayer && CanInteract())
        {
            CmdRequestPlayCard(cardIndex);
        }
    }

    public void PurchaseCard(int shopSlotIndex)
    {
        if (isLocalPlayer && CanInteract())
        {
            CmdRequestPurchaseCard(shopSlotIndex);
        }
    }

    public void EndTurn()
    {
        if (isLocalPlayer && CanInteract())
        {
            CmdRequestEndTurn();
        }
    }

    public void StartGame()
    {
        if (isLocalPlayer && isServer)
        {
            CmdRequestStartGame();
        }
    }

    public bool CanInteract()
    {
        return IsCurrentTurn.Value && 
               CurrentTurnState.Value != TurnState.Waiting &&
               CurrentTurnState.Value != TurnState.Cleanup;
    }

    public bool CanPlayCardType(CardEffect effectType)
    {
        if (!CanInteract()) return false;
        
        if (effectType == CardEffect.Action)
        {
            return CurrentTurnState.Value == TurnState.Action && Actions.Value > 0;
        }
        
        if (effectType == CardEffect.Coin)
        {
            return CurrentTurnState.Value == TurnState.Buy || 
                   CurrentTurnState.Value == TurnState.Action;
        }
        
        return false;
    }

    public bool CanPurchase(int cost)
    {
        return CanInteract() && 
               CurrentTurnState.Value == TurnState.Buy &&
               Coins.Value >= cost && 
               Buys.Value > 0;
    }

    public int GetLocalPlayerId()
    {
        return _localPlayerId;
    }

    public List<NetworkCardData> GetHandCards()
    {
        return _handCards;
    }

    public TurnState GetTurnState()
    {
        return CurrentTurnState.Value;
    }
}
