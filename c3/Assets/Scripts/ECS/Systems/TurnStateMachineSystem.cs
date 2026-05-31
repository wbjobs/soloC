using Unity.Entities;
using UnityEngine;

public struct TurnStateChangedEvent : IComponentData
{
    public int PlayerId;
    public TurnState OldState;
    public TurnState NewState;
}

public class TurnStateMachineSystem : SystemBase
{
    private EndSimulationEntityCommandBufferSystem _ecbSystem;
    private bool _isServer;

    protected override void OnCreate()
    {
        _ecbSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
        _isServer = Mirror.NetworkServer.active;
    }

    protected override void OnUpdate()
    {
        if (!_isServer)
        {
            _isServer = Mirror.NetworkServer.active;
        }

        if (!_isServer) return;

        var ecb = _ecbSystem.CreateCommandBuffer().AsParallelWriter();

        Entities
            .ForEach((Entity eventEntity, int entityInQueryIndex, in TurnStateChangedEvent turnEvent) =>
            {
                ProcessTurnStateChange(turnEvent);
                ecb.DestroyEntity(entityInQueryIndex, eventEntity);
            }).ScheduleParallel();

        _ecbSystem.AddJobHandleForProducer(Dependency);
    }

    private void ProcessTurnStateChange(TurnStateChangedEvent turnEvent)
    {
        UpdatePlayerNetworkState(turnEvent.PlayerId, turnEvent.NewState);
    }

    private void UpdatePlayerNetworkState(int playerId, TurnState newState)
    {
        var players = Object.FindObjectsOfType<PlayerNetworkObject>();
        foreach (var player in players)
        {
            if (player.PlayerId == playerId && player.isServer)
            {
                player.CurrentTurnState.Value = newState;
                break;
            }
        }
    }

    public void RequestStateChange(int playerId, TurnState newState)
    {
        if (!_isServer) return;

        Entity currentPlayerEntity = FindPlayerEntity(playerId);
        if (currentPlayerEntity == Entity.Null) return;

        PlayerComponent playerData = EntityManager.GetComponentData<PlayerComponent>(currentPlayerEntity);
        if (!playerData.IsCurrentTurn) return;

        TurnState currentState = GetPlayerCurrentState(playerId);
        if (currentState == newState) return;

        if (!IsValidStateTransition(currentState, newState))
        {
            Debug.LogWarning($"Invalid state transition: {currentState} -> {newState}");
            return;
        }

        Entity eventEntity = EntityManager.CreateEntity();
        EntityManager.AddComponentData(eventEntity, new TurnStateChangedEvent
        {
            PlayerId = playerId,
            OldState = currentState,
            NewState = newState
        });
    }

    private TurnState GetPlayerCurrentState(int playerId)
    {
        var players = Object.FindObjectsOfType<PlayerNetworkObject>();
        foreach (var player in players)
        {
            if (player.PlayerId == playerId)
            {
                return player.CurrentTurnState.Value;
            }
        }
        return TurnState.Waiting;
    }

    private bool IsValidStateTransition(TurnState currentState, TurnState newState)
    {
        switch (currentState)
        {
            case TurnState.Waiting:
                return newState == TurnState.Action;

            case TurnState.Action:
                return newState == TurnState.Buy || newState == TurnState.Cleanup;

            case TurnState.Buy:
                return newState == TurnState.Cleanup;

            case TurnState.Cleanup:
                return newState == TurnState.Waiting;

            default:
                return false;
        }
    }

    private Entity FindPlayerEntity(int playerId)
    {
        Entity result = Entity.Null;
        
        Entities
            .ForEach((Entity entity, in PlayerComponent player) =>
            {
                if (player.PlayerId == playerId)
                {
                    result = entity;
                }
            }).Run();

        return result;
    }

    public void StartPlayerTurn(int playerId)
    {
        if (!_isServer) return;

        var players = Object.FindObjectsOfType<PlayerNetworkObject>();
        foreach (var player in players)
        {
            if (player.PlayerId == playerId)
            {
                player.IsCurrentTurn.Value = true;
                player.Actions.Value = 1;
                player.Buys.Value = 1;
                player.Coins.Value = 0;
                break;
            }
        }

        RequestStateChange(playerId, TurnState.Action);
    }

    public void EndPlayerTurn(int playerId)
    {
        if (!_isServer) return;

        RequestStateChange(playerId, TurnState.Cleanup);

        var players = Object.FindObjectsOfType<PlayerNetworkObject>();
        foreach (var player in players)
        {
            if (player.PlayerId == playerId)
            {
                player.IsCurrentTurn.Value = false;
                player.Actions.Value = 0;
                player.Buys.Value = 0;
                player.Coins.Value = 0;
                break;
            }
        }

        RequestStateChange(playerId, TurnState.Waiting);
    }

    public void SwitchToBuyPhase(int playerId)
    {
        if (!_isServer) return;
        RequestStateChange(playerId, TurnState.Buy);
    }

    public TurnState GetPlayerState(int playerId)
    {
        return GetPlayerCurrentState(playerId);
    }

    public bool CanPlayActionCards(int playerId)
    {
        TurnState state = GetPlayerCurrentState(playerId);
        return state == TurnState.Action;
    }

    public bool CanPlayTreasureCards(int playerId)
    {
        TurnState state = GetPlayerCurrentState(playerId);
        return state == TurnState.Action || state == TurnState.Buy;
    }

    public bool CanMakePurchases(int playerId)
    {
        TurnState state = GetPlayerCurrentState(playerId);
        return state == TurnState.Buy;
    }

    public bool CanEndTurn(int playerId)
    {
        TurnState state = GetPlayerCurrentState(playerId);
        return state == TurnState.Action || state == TurnState.Buy;
    }
}
