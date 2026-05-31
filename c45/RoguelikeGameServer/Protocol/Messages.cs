namespace RoguelikeGameServer.Protocol;

public class C2S_Login : MessageBase
{
    public C2S_Login() => Type = (int)MessageType.C2S_Login;
    public string PlayerId { get; set; } = string.Empty;
    public string PlayerName { get; set; } = string.Empty;
}

public class S2C_LoginResult : MessageBase
{
    public S2C_LoginResult() => Type = (int)MessageType.S2C_LoginResult;
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string SessionId { get; set; } = string.Empty;
}

public class C2S_CreateRoom : MessageBase
{
    public C2S_CreateRoom() => Type = (int)MessageType.C2S_CreateRoom;
    public string RoomName { get; set; } = string.Empty;
    public int MaxPlayers { get; set; } = 4;
}

public class S2C_CreateRoomResult : MessageBase
{
    public S2C_CreateRoomResult() => Type = (int)MessageType.S2C_CreateRoomResult;
    public bool Success { get; set; }
    public string RoomId { get; set; } = string.Empty;
    public string RoomName { get; set; } = string.Empty;
}

public class C2S_JoinRoom : MessageBase
{
    public C2S_JoinRoom() => Type = (int)MessageType.C2S_JoinRoom;
    public string RoomId { get; set; } = string.Empty;
}

public class S2C_JoinRoomResult : MessageBase
{
    public S2C_JoinRoomResult() => Type = (int)MessageType.S2C_JoinRoomResult;
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public List<PlayerInfo> Players { get; set; } = new();
}

public class S2C_PlayerEnterRoom : MessageBase
{
    public S2C_PlayerEnterRoom() => Type = (int)MessageType.S2C_PlayerEnterRoom;
    public PlayerInfo Player { get; set; } = new();
}

public class S2C_PlayerLeaveRoom : MessageBase
{
    public S2C_PlayerLeaveRoom() => Type = (int)MessageType.S2C_PlayerLeaveRoom;
    public string PlayerId { get; set; } = string.Empty;
}

public class C2S_StartGame : MessageBase
{
    public C2S_StartGame() => Type = (int)MessageType.C2S_StartGame;
}

public class S2C_GameStart : MessageBase
{
    public S2C_GameStart() => Type = (int)MessageType.S2C_GameStart;
}

public class S2C_DungeonData : MessageBase
{
    public S2C_DungeonData() => Type = (int)MessageType.S2C_DungeonData;
    public int MapWidth { get; set; }
    public int MapHeight { get; set; }
    public int[,]? Tiles { get; set; }
    public List<RoomInfo> Rooms { get; set; } = new();
    public List<MonsterInfo> Monsters { get; set; } = new();
    public List<ItemInfo> Items { get; set; } = new();
    public List<PlayerInfo> Players { get; set; } = new();
}

public class C2S_PlayerMove : MessageBase
{
    public C2S_PlayerMove() => Type = (int)MessageType.C2S_PlayerMove;
    public int DirX { get; set; }
    public int DirY { get; set; }
}

public class S2C_PlayerMoveBroadcast : MessageBase
{
    public S2C_PlayerMoveBroadcast() => Type = (int)MessageType.S2C_PlayerMoveBroadcast;
    public string PlayerId { get; set; } = string.Empty;
    public int PosX { get; set; }
    public int PosY { get; set; }
}

public class C2S_PlayerAttack : MessageBase
{
    public C2S_PlayerAttack() => Type = (int)MessageType.C2S_PlayerAttack;
    public string TargetId { get; set; } = string.Empty;
}

public class S2C_AttackResult : MessageBase
{
    public S2C_AttackResult() => Type = (int)MessageType.S2C_AttackResult;
    public string AttackerId { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public int Damage { get; set; }
    public int TargetHp { get; set; }
    public bool TargetDead { get; set; }
}

public class S2C_MonsterState : MessageBase
{
    public S2C_MonsterState() => Type = (int)MessageType.S2C_MonsterState;
    public string MonsterId { get; set; } = string.Empty;
    public int PosX { get; set; }
    public int PosY { get; set; }
    public int Hp { get; set; }
}

public class S2C_MonsterAttack : MessageBase
{
    public S2C_MonsterAttack() => Type = (int)MessageType.S2C_MonsterAttack;
    public string MonsterId { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
    public int Damage { get; set; }
    public int PlayerHp { get; set; }
}

public class S2C_ItemPicked : MessageBase
{
    public S2C_ItemPicked() => Type = (int)MessageType.S2C_ItemPicked;
    public string ItemId { get; set; } = string.Empty;
    public string PlayerId { get; set; } = string.Empty;
    public ItemType ItemType { get; set; }
    public int Value { get; set; }
}

public class S2C_PlayerDeath : MessageBase
{
    public S2C_PlayerDeath() => Type = (int)MessageType.S2C_PlayerDeath;
    public string PlayerId { get; set; } = string.Empty;
}

public class S2C_ItemDropped : MessageBase
{
    public S2C_ItemDropped() => Type = (int)MessageType.S2C_ItemDropped;
    public ItemInfo Item { get; set; } = new();
    public string DroppedByPlayerId { get; set; } = string.Empty;
}

public class S2C_PlayerRespawn : MessageBase
{
    public S2C_PlayerRespawn() => Type = (int)MessageType.S2C_PlayerRespawn;
    public string PlayerId { get; set; } = string.Empty;
    public int PosX { get; set; }
    public int PosY { get; set; }
    public int Hp { get; set; }
    public int MaxHp { get; set; }
    public int Attack { get; set; }
}

public class PlayerInfo
{
    public string PlayerId { get; set; } = string.Empty;
    public string PlayerName { get; set; } = string.Empty;
    public int PosX { get; set; }
    public int PosY { get; set; }
    public int Hp { get; set; }
    public int MaxHp { get; set; }
    public int Attack { get; set; }
    public int Gold { get; set; }
    public List<InventoryItem> Inventory { get; set; } = new();
    public bool IsDead => Hp <= 0;
}

public class InventoryItem
{
    public string ItemId { get; set; } = string.Empty;
    public ItemType Type { get; set; }
    public int Value { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class RoomInfo
{
    public string RoomId { get; set; } = string.Empty;
    public int X { get; set; }
    public int Y { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
}

public class MonsterInfo
{
    public string MonsterId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int PosX { get; set; }
    public int PosY { get; set; }
    public int Hp { get; set; }
    public int MaxHp { get; set; }
    public int Attack { get; set; }
    public int Speed { get; set; }
    public bool IsDead => Hp <= 0;
}

public class ItemInfo
{
    public string ItemId { get; set; } = string.Empty;
    public ItemType Type { get; set; }
    public int PosX { get; set; }
    public int PosY { get; set; }
    public int Value { get; set; }
}

public enum ItemType
{
    HealthPotion,
    AttackBoost,
    Gold
}
