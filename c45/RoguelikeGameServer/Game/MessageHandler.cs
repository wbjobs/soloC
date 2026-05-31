using RoguelikeGameServer.Network;
using RoguelikeGameServer.Protocol;

namespace RoguelikeGameServer.Game;

public static class MessageHandler
{
    public static async Task HandleMessageAsync(ClientSession session, string json)
    {
        try
        {
            var message = MessageBase.Deserialize(json);
            if (message == null)
            {
                Console.WriteLine($"无法解析消息: {json}");
                return;
            }

            switch (message)
            {
                case C2S_Login login:
                    await HandleLogin(session, login);
                    break;
                case C2S_CreateRoom createRoom:
                    await HandleCreateRoom(session, createRoom);
                    break;
                case C2S_JoinRoom joinRoom:
                    await HandleJoinRoom(session, joinRoom);
                    break;
                case C2S_StartGame startGame:
                    await HandleStartGame(session);
                    break;
                case C2S_PlayerMove playerMove:
                    await HandlePlayerMove(session, playerMove);
                    break;
                case C2S_PlayerAttack playerAttack:
                    await HandlePlayerAttack(session, playerAttack);
                    break;
                default:
                    Console.WriteLine($"未知消息类型: {message.Type}");
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"处理消息异常: {ex.Message}");
        }
    }

    private static async Task HandleLogin(ClientSession session, C2S_Login login)
    {
        session.PlayerId = login.PlayerId;
        session.PlayerName = login.PlayerName;

        await session.SendMessageAsync(new S2C_LoginResult
        {
            Success = true,
            Message = "登录成功",
            SessionId = session.SessionId
        });

        Console.WriteLine($"玩家登录: {login.PlayerName} ({login.PlayerId})");
    }

    private static async Task HandleCreateRoom(ClientSession session, C2S_CreateRoom createRoom)
    {
        if (!session.IsLoggedIn)
        {
            await session.SendMessageAsync(new S2C_CreateRoomResult { Success = false });
            return;
        }

        var room = GameRoomManager.Instance.CreateRoom(createRoom.RoomName, createRoom.MaxPlayers, session);
        await session.SendMessageAsync(new S2C_CreateRoomResult
        {
            Success = true,
            RoomId = room.RoomId,
            RoomName = room.RoomName
        });

        Console.WriteLine($"房间创建: {room.RoomName} ({room.RoomId}) by {session.PlayerName}");
    }

    private static async Task HandleJoinRoom(ClientSession session, C2S_JoinRoom joinRoom)
    {
        if (!session.IsLoggedIn)
        {
            await session.SendMessageAsync(new S2C_JoinRoomResult { Success = false, Message = "未登录" });
            return;
        }

        var result = GameRoomManager.Instance.JoinRoom(joinRoom.RoomId, session);
        await session.SendMessageAsync(new S2C_JoinRoomResult
        {
            Success = result.Success,
            Message = result.Message,
            Players = result.Players
        });

        if (result.Success)
        {
            Console.WriteLine($"玩家 {session.PlayerName} 加入房间 {joinRoom.RoomId}");
        }
    }

    private static async Task HandleStartGame(ClientSession session)
    {
        if (!session.IsLoggedIn) return;

        var room = GameRoomManager.Instance.GetPlayerRoom(session.PlayerId!);
        if (room == null || !room.IsHost(session)) return;

        await room.StartGameAsync();
        Console.WriteLine($"房间 {room.RoomName} 游戏开始");
    }

    private static async Task HandlePlayerMove(ClientSession session, C2S_PlayerMove playerMove)
    {
        if (!session.IsLoggedIn) return;

        var room = GameRoomManager.Instance.GetPlayerRoom(session.PlayerId!);
        if (room == null || !room.GameStarted) return;

        await room.HandlePlayerMoveAsync(session, playerMove.DirX, playerMove.DirY);
    }

    private static async Task HandlePlayerAttack(ClientSession session, C2S_PlayerAttack playerAttack)
    {
        if (!session.IsLoggedIn) return;

        var room = GameRoomManager.Instance.GetPlayerRoom(session.PlayerId!);
        if (room == null || !room.GameStarted) return;

        await room.HandlePlayerAttackAsync(session, playerAttack.TargetId);
    }
}
