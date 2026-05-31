using System.Collections.Concurrent;
using RoguelikeGameServer.Network;

namespace RoguelikeGameServer.Game;

public class GameRoomManager
{
    public static GameRoomManager Instance { get; } = new();

    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();
    private readonly ConcurrentDictionary<string, string> _playerRoomMap = new();

    private GameRoomManager() { }

    public GameRoom CreateRoom(string roomName, int maxPlayers, ClientSession host)
    {
        var room = new GameRoom(roomName, maxPlayers, host);
        _rooms.TryAdd(room.RoomId, room);
        _playerRoomMap.TryAdd(host.PlayerId!, room.RoomId);
        return room;
    }

    public JoinRoomResult JoinRoom(string roomId, ClientSession session)
    {
        if (!_rooms.TryGetValue(roomId, out var room))
        {
            return new JoinRoomResult { Success = false, Message = "房间不存在" };
        }

        if (!room.AddPlayer(session))
        {
            return new JoinRoomResult { Success = false, Message = "房间已满或游戏已开始" };
        }

        _playerRoomMap.TryAdd(session.PlayerId!, roomId);
        return new JoinRoomResult
        {
            Success = true,
            Message = "加入成功",
            Players = room.GetPlayerInfos()
        };
    }

    public GameRoom? GetPlayerRoom(string playerId)
    {
        if (_playerRoomMap.TryGetValue(playerId, out var roomId) && _rooms.TryGetValue(roomId, out var room))
        {
            return room;
        }
        return null;
    }

    public void HandlePlayerDisconnect(string sessionId)
    {
        
    }

    public void RemoveRoom(string roomId)
    {
        _rooms.TryRemove(roomId, out _);
    }
}

public class JoinRoomResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public List<PlayerInfo> Players { get; set; } = new();
}
