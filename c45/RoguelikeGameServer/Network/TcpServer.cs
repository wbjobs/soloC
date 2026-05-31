using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using RoguelikeGameServer.Protocol;

namespace RoguelikeGameServer.Network;

public class TcpServer
{
    private readonly TcpListener _listener;
    private readonly ConcurrentDictionary<string, ClientSession> _sessions = new();
    private readonly CancellationTokenSource _cts = new();
    private int _port;

    public TcpServer(int port)
    {
        _port = port;
        _listener = new TcpListener(IPAddress.Any, port);
    }

    public async Task StartAsync()
    {
        _listener.Start();
        Console.WriteLine($"服务器启动，监听端口: {_port}");

        try
        {
            while (!_cts.Token.IsCancellationRequested)
            {
                var tcpClient = await _listener.AcceptTcpClientAsync(_cts.Token);
                var session = new ClientSession(tcpClient, this);
                _sessions.TryAdd(session.SessionId, session);
                Console.WriteLine($"客户端连接: {session.SessionId}, 当前连接数: {_sessions.Count}");
                _ = session.StartAsync();
            }
        }
        catch (OperationCanceledException)
        {
            Console.WriteLine("服务器停止监听");
        }
    }

    public void RemoveSession(string sessionId)
    {
        if (_sessions.TryRemove(sessionId, out _))
        {
            Console.WriteLine($"客户端断开: {sessionId}, 当前连接数: {_sessions.Count}");
            GameRoomManager.Instance.HandlePlayerDisconnect(sessionId);
        }
    }

    public ClientSession? GetSession(string sessionId)
    {
        _sessions.TryGetValue(sessionId, out var session);
        return session;
    }

    public IEnumerable<ClientSession> GetAllSessions()
    {
        return _sessions.Values;
    }

    public void Stop()
    {
        _cts.Cancel();
        _listener.Stop();
        foreach (var session in _sessions.Values)
        {
            session.Disconnect();
        }
        _sessions.Clear();
    }
}

public class ClientSession
{
    public string SessionId { get; }
    public string? PlayerId { get; set; }
    public string? PlayerName { get; set; }
    public bool IsLoggedIn => !string.IsNullOrEmpty(PlayerId);

    private readonly TcpClient _client;
    private readonly TcpServer _server;
    private readonly NetworkStream _stream;
    private readonly CancellationTokenSource _cts = new();

    public ClientSession(TcpClient client, TcpServer server)
    {
        SessionId = Guid.NewGuid().ToString("N");
        _client = client;
        _server = server;
        _stream = client.GetStream();
    }

    public async Task StartAsync()
    {
        try
        {
            var buffer = new byte[4096];
            var messageBuffer = new StringBuilder();

            while (!_cts.Token.IsCancellationRequested)
            {
                var bytesRead = await _stream.ReadAsync(buffer, 0, buffer.Length, _cts.Token);
                if (bytesRead == 0) break;

                var text = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                messageBuffer.Append(text);

                string fullMessage = messageBuffer.ToString();
                int newlineIndex;
                while ((newlineIndex = fullMessage.IndexOf('\n')) >= 0)
                {
                    var message = fullMessage.Substring(0, newlineIndex).Trim();
                    fullMessage = fullMessage.Substring(newlineIndex + 1);

                    if (!string.IsNullOrEmpty(message))
                    {
                        await MessageHandler.HandleMessageAsync(this, message);
                    }
                }
                messageBuffer.Clear();
                messageBuffer.Append(fullMessage);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"会话 {SessionId} 异常: {ex.Message}");
        }
        finally
        {
            Disconnect();
            _server.RemoveSession(SessionId);
        }
    }

    public async Task SendMessageAsync<T>(T message) where T : MessageBase
    {
        try
        {
            var json = MessageBase.Serialize(message);
            var data = Encoding.UTF8.GetBytes(json + "\n");
            await _stream.WriteAsync(data, 0, data.Length);
            await _stream.FlushAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"发送消息失败: {ex.Message}");
        }
    }

    public void Disconnect()
    {
        _cts.Cancel();
        _client.Close();
    }
}
