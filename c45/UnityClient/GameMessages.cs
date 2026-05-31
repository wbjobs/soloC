using System;
using System.Collections.Generic;
using UnityEngine;

#region 客户端到服务器消息

[Serializable]
public class C2S_Login
{
    public int type = 1001;
    public string PlayerId;
    public string PlayerName;
}

[Serializable]
public class C2S_CreateRoom
{
    public int type = 2001;
    public string RoomName;
    public int MaxPlayers = 4;
}

[Serializable]
public class C2S_JoinRoom
{
    public int type = 2003;
    public string RoomId;
}

[Serializable]
public class C2S_StartGame
{
    public int type = 3001;
}

[Serializable]
public class C2S_PlayerMove
{
    public int type = 4001;
    public int DirX;
    public int DirY;
}

[Serializable]
public class C2S_PlayerAttack
{
    public int type = 4003;
    public string TargetId;
}

#endregion

#region 服务器到客户端消息

[Serializable]
public class S2C_LoginResult
{
    public int type = 1002;
    public bool Success;
    public string Message;
    public string SessionId;
}

[Serializable]
public class S2C_CreateRoomResult
{
    public int type = 2002;
    public bool Success;
    public string RoomId;
    public string RoomName;
}

[Serializable]
public class S2C_JoinRoomResult
{
    public int type = 2004;
    public bool Success;
    public string Message;
    public List<PlayerInfo> Players;
}

[Serializable]
public class S2C_PlayerEnterRoom
{
    public int type = 2005;
    public PlayerInfo Player;
}

[Serializable]
public class S2C_PlayerLeaveRoom
{
    public int type = 2006;
    public string PlayerId;
}

[Serializable]
public class S2C_GameStart
{
    public int type = 3002;
}

[Serializable]
public class S2C_DungeonData
{
    public int type = 3003;
    public int MapWidth;
    public int MapHeight;
    public List<RoomInfo> Rooms;
    public List<MonsterInfo> Monsters;
    public List<ItemInfo> Items;
    public List<PlayerInfo> Players;
}

[Serializable]
public class S2C_PlayerMoveBroadcast
{
    public int type = 4002;
    public string PlayerId;
    public int PosX;
    public int PosY;
}

[Serializable]
public class S2C_AttackResult
{
    public int type = 4004;
    public string AttackerId;
    public string TargetId;
    public int Damage;
    public int TargetHp;
    public bool TargetDead;
}

[Serializable]
public class S2C_MonsterState
{
    public int type = 5001;
    public string MonsterId;
    public int PosX;
    public int PosY;
    public int Hp;
}

[Serializable]
public class S2C_MonsterAttack
{
    public int type = 5002;
    public string MonsterId;
    public string PlayerId;
    public int Damage;
    public int PlayerHp;
}

[Serializable]
public class S2C_ItemPicked
{
    public int type = 6001;
    public string ItemId;
    public string PlayerId;
    public ItemType ItemType;
    public int Value;
}

[Serializable]
public class S2C_PlayerDeath
{
    public int type = 7001;
    public string PlayerId;
}

[Serializable]
public class S2C_ItemDropped
{
    public int type = 6002;
    public ItemInfo Item;
    public string DroppedByPlayerId;
}

[Serializable]
public class S2C_PlayerRespawn
{
    public int type = 7002;
    public string PlayerId;
    public int PosX;
    public int PosY;
    public int Hp;
    public int MaxHp;
    public int Attack;
}

#endregion

#region 通用数据结构

[Serializable]
public class PlayerInfo
{
    public string PlayerId;
    public string PlayerName;
    public int PosX;
    public int PosY;
    public int Hp;
    public int MaxHp;
    public int Attack;
    public int Gold;
    public List<InventoryItem> Inventory;
    public bool IsDead => Hp <= 0;
}

[Serializable]
public class InventoryItem
{
    public string ItemId;
    public ItemType Type;
    public int Value;
    public string Name;
}

[Serializable]
public class RoomInfo
{
    public string RoomId;
    public int X;
    public int Y;
    public int Width;
    public int Height;
}

[Serializable]
public class MonsterInfo
{
    public string MonsterId;
    public string Name;
    public int PosX;
    public int PosY;
    public int Hp;
    public int MaxHp;
    public int Attack;
    public int Speed;
    public bool IsDead => Hp <= 0;
}

[Serializable]
public class ItemInfo
{
    public string ItemId;
    public ItemType Type;
    public int PosX;
    public int PosY;
    public int Value;
}

public enum ItemType
{
    HealthPotion,
    AttackBoost,
    Gold
}

#endregion
