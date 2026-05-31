using Unity.Entities;
using Unity.Collections;

public class TurnManagementSystem : SystemBase
{
    private EndSimulationEntityCommandBufferSystem _ecbSystem;

    public struct EndTurnRequest : IComponentData
    {
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
            .ForEach((Entity requestEntity, int entityInQueryIndex, in EndTurnRequest request) =>
            {
                ExecuteEndTurn(request.PlayerId);
                ecb.DestroyEntity(entityInQueryIndex, requestEntity);
            }).ScheduleParallel();

        _ecbSystem.AddJobHandleForProducer(Dependency);
    }

    public void StartGame()
    {
        var gameState = GetSingleton<GameStateComponent>();
        gameState.GameStarted = true;
        gameState.TurnNumber = 1;
        SetSingleton(gameState);

        SetCurrentPlayer(0);
        StartTurn(0);
    }

    private void SetCurrentPlayer(int playerId)
    {
        Entities
            .ForEach((Entity entity, ref PlayerComponent player) =>
            {
                player.IsCurrentTurn = player.PlayerId == playerId;
            }).Run();

        var gameState = GetSingleton<GameStateComponent>();
        gameState.CurrentPlayerId = playerId;
        SetSingleton(gameState);
    }

    private void StartTurn(int playerId)
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

        playerData.Actions = 1;
        playerData.Buys = 1;
        playerData.Coins = 0;
        EntityManager.SetComponentData(playerEntity, playerData);

        var gameState = GetSingleton<GameStateComponent>();
        gameState.CurrentPhase = GameStateComponent.Phase.Action;
        SetSingleton(gameState);

        var drawSystem = World.GetOrCreateSystem<CardDrawSystem>();
        drawSystem.DrawCards(playerId, 5);
    }

    private void ExecuteEndTurn(int playerId)
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
        if (!playerData.IsCurrentTurn) return;

        CleanupTurn(playerId);

        int nextPlayerId = GetNextPlayerId(playerId);
        SetCurrentPlayer(nextPlayerId);

        var gameState = GetSingleton<GameStateComponent>();
        if (nextPlayerId == 0)
        {
            gameState.TurnNumber++;
        }
        SetSingleton(gameState);

        StartTurn(nextPlayerId);
    }

    private void CleanupTurn(int playerId)
    {
        var drawSystem = World.GetOrCreateSystem<CardDrawSystem>();
        
        drawSystem.DiscardHand(playerId);
        drawSystem.DiscardPlayArea(playerId);

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

        playerData.Actions = 0;
        playerData.Buys = 0;
        playerData.Coins = 0;
        EntityManager.SetComponentData(playerEntity, playerData);
    }

    private int GetNextPlayerId(int currentPlayerId)
    {
        NativeList<int> playerIds = new NativeList<int>(Allocator.Temp);
        
        Entities
            .ForEach((in PlayerComponent player) =>
            {
                playerIds.Add(player.PlayerId);
            }).Run();

        playerIds.Sort();

        int currentIndex = playerIds.IndexOf(currentPlayerId);
        int nextIndex = (currentIndex + 1) % playerIds.Length;
        int nextPlayerId = playerIds[nextIndex];

        playerIds.Dispose();
        return nextPlayerId;
    }

    public void RequestEndTurn(int playerId)
    {
        Entity requestEntity = EntityManager.CreateEntity();
        EntityManager.AddComponentData(requestEntity, new EndTurnRequest
        {
            PlayerId = playerId
        });
    }

    public bool IsPlayersTurn(int playerId)
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

        if (playerEntity == Entity.Null) return false;
        return playerData.IsCurrentTurn;
    }

    public GameStateComponent.Phase GetCurrentPhase()
    {
        var gameState = GetSingleton<GameStateComponent>();
        return gameState.CurrentPhase;
    }

    public void SetPhase(GameStateComponent.Phase phase)
    {
        var gameState = GetSingleton<GameStateComponent>();
        gameState.CurrentPhase = phase;
        SetSingleton(gameState);
    }
}
