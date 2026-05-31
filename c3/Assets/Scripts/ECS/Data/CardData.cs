using Unity.Entities;
using Unity.Mathematics;

public enum CardType
{
    Copper,     
    Silver,     
    Gold,       
    Estate,     
    Duchy,     
    Province,   
    Market     
}

public enum CardEffect
{
    Coin,     
    Victory,  
    Draw,     
    Action
}

[System.Serializable]
public struct CardData
{
    public CardType CardType;
    public int Cost;
    public int CoinValue;
    public int VictoryPoints;
    public string Name;
    public string Description;
    public CardEffect Effect;
    public int EffectValue;
}

public struct CardDataComponent : IComponentData
{
    public CardData Value;
    public int OwnerPlayerId;
}

public struct CostComponent : IComponentData
{
    public int Value;
}

public struct EffectComponent : IComponentData
{
    public CardEffect Type;
    public int Value;
}

public struct InHandComponent : IComponentData
{
    public int PlayerId;
    public int HandIndex;
}

public struct InDeckComponent : IComponentData
{
    public int PlayerId;
    public int DeckIndex;
}

public struct InDiscardComponent : IComponentData
{
    public int PlayerId;
}

public struct InPlayComponent : IComponentData
{
    public int PlayerId;
}

public struct InShopComponent : IComponentData
{
    public int ShopIndex;
}

public struct PurchasedThisTurnComponent : IComponentData
{
}