using Unity.Entities;

public struct PlayerComponent : IComponentData
{
    public int PlayerId;
    public int VictoryPoints;
    public int Coins;
    public int Actions;
    public int Buys;
    public bool IsLocalPlayer;
    public bool IsCurrentTurn;
    public string PlayerName;
}

public struct DeckSizeComponent : IComponentData
{
    public int Value;
}

public struct HandSizeComponent : IComponentData
{
    public int Value;
}

public struct DiscardSizeComponent : IComponentData
{
    public int Value;
}

public struct GameStateComponent : IComponentData
{
    public enum Phase
    {
        Waiting,
        Action,
        Buy,
        Cleanup
    }

    public Phase CurrentPhase;
    public int CurrentPlayerId;
    public int TurnNumber;
    public bool GameStarted;
    public bool GameEnded;
    public int WinnerPlayerId;
}

public struct ShopCardComponent : IComponentData
{
    public CardData CardData;
    public int RemainingCount;
    public int ShopSlotIndex;
}

public struct CardArchetypeComponent : IComponentData
{
    public CardType Type;
    public Entity PrefabEntity;
}
