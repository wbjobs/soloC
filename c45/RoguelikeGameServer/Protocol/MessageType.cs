namespace RoguelikeGameServer.Protocol;

public enum MessageType
{
    C2S_Login = 1001,
    S2C_LoginResult = 1002,
    
    C2S_CreateRoom = 2001,
    S2C_CreateRoomResult = 2002,
    
    C2S_JoinRoom = 2003,
    S2C_JoinRoomResult = 2004,
    
    S2C_PlayerEnterRoom = 2005,
    S2C_PlayerLeaveRoom = 2006,
    
    C2S_StartGame = 3001,
    S2C_GameStart = 3002,
    S2C_DungeonData = 3003,
    
    C2S_PlayerMove = 4001,
    S2C_PlayerMoveBroadcast = 4002,
    
    C2S_PlayerAttack = 4003,
    S2C_AttackResult = 4004,
    
    S2C_MonsterState = 5001,
    S2C_MonsterAttack = 5002,
    
    S2C_ItemPicked = 6001,
    S2C_ItemDropped = 6002,
    
    S2C_PlayerDeath = 7001,
    S2C_PlayerRespawn = 7002,
}
