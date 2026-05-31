using System;
using System.Collections;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using UnityEngine;

public class NetworkManager : MonoBehaviour
{
    public static NetworkManager Instance { get; private set; }

    [Header("Server Settings")]
    public string serverIp = "127.0.0.1";
    public int serverPort = 8888;

    private TcpClient _client;
    private NetworkStream _stream;
    private Thread _receiveThread;
    private bool _isConnected;

    private readonly Queue<Action> _mainThreadActions = new();

    public event Action OnConnected;
    public event Action OnDisconnected;
    public event Action<S2C_LoginResult> OnLoginResult;
    public event Action<S2C_CreateRoomResult> OnCreateRoomResult;
    public event Action<S2C_JoinRoomResult> OnJoinRoomResult;
    public event Action<S2C_PlayerEnterRoom> OnPlayerEnterRoom;
    public event Action<S2C_GameStart> OnGameStart;
    public event Action<S2C_DungeonData> OnDungeonData;
    public event Action<S2C_PlayerMoveBroadcast> OnPlayerMove;
    public event Action<S2C_AttackResult> OnAttackResult;
    public event Action<S2C_MonsterState> OnMonsterState;
    public event Action<S2C_MonsterAttack> OnMonsterAttack;
    public event Action<S2C_ItemPicked> OnItemPicked;
    public event Action<S2C_PlayerDeath> OnPlayerDeath;
    public event Action<S2C_ItemDropped> OnItemDropped;
    public event Action<S2C_PlayerRespawn> OnPlayerRespawn;

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }
        else
        {
            Destroy(gameObject);
        }
    }

    private void Update()
    {
        lock (_mainThreadActions)
        {
            while (_mainThreadActions.Count > 0)
            {
                _mainThreadActions.Dequeue()?.Invoke();
            }
        }
    }

    public void Connect()
    {
        try
        {
            _client = new TcpClient();
            _client.BeginConnect(serverIp, serverPort, OnConnectCallback, null);
        }
        catch (Exception ex)
        {
            Debug.LogError($"连接失败: {ex.Message}");
        }
    }

    private void OnConnectCallback(IAsyncResult ar)
    {
        try
        {
            _client.EndConnect(ar);
            _isConnected = _client.Connected;

            if (_isConnected)
            {
                _stream = _client.GetStream();
                _receiveThread = new Thread(ReceiveLoop);
                _receiveThread.IsBackground = true;
                _receiveThread.Start();

                RunOnMainThread(() => OnConnected?.Invoke());
                Debug.Log("连接服务器成功");
            }
        }
        catch (Exception ex)
        {
            Debug.LogError($"连接回调异常: {ex.Message}");
        }
    }

    private void ReceiveLoop()
    {
        byte[] buffer = new byte[4096];
        StringBuilder messageBuffer = new StringBuilder();

        while (_isConnected)
        {
            try
            {
                int bytesRead = _stream.Read(buffer, 0, buffer.Length);
                if (bytesRead == 0) break;

                string text = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                messageBuffer.Append(text);

                string fullMessage = messageBuffer.ToString();
                int newlineIndex;
                while ((newlineIndex = fullMessage.IndexOf('\n')) >= 0)
                {
                    string json = fullMessage.Substring(0, newlineIndex).Trim();
                    fullMessage = fullMessage.Substring(newlineIndex + 1);

                    if (!string.IsNullOrEmpty(json))
                    {
                        ProcessMessage(json);
                    }
                }
                messageBuffer.Clear();
                messageBuffer.Append(fullMessage);
            }
            catch (Exception ex)
            {
                Debug.LogError($"接收异常: {ex.Message}");
                break;
            }
        }

        Disconnect();
    }

    private void ProcessMessage(string json)
    {
        try
        {
            var doc = JsonUtility.FromJson<MessageTypeWrapper>(json);
            switch (doc.type)
            {
                case 1002:
                    RunOnMainThread(() => OnLoginResult?.Invoke(JsonUtility.FromJson<S2C_LoginResult>(json)));
                    break;
                case 2002:
                    RunOnMainThread(() => OnCreateRoomResult?.Invoke(JsonUtility.FromJson<S2C_CreateRoomResult>(json)));
                    break;
                case 2004:
                    RunOnMainThread(() => OnJoinRoomResult?.Invoke(JsonUtility.FromJson<S2C_JoinRoomResult>(json)));
                    break;
                case 2005:
                    RunOnMainThread(() => OnPlayerEnterRoom?.Invoke(JsonUtility.FromJson<S2C_PlayerEnterRoom>(json)));
                    break;
                case 3002:
                    RunOnMainThread(() => OnGameStart?.Invoke(JsonUtility.FromJson<S2C_GameStart>(json)));
                    break;
                case 3003:
                    RunOnMainThread(() => OnDungeonData?.Invoke(JsonUtility.FromJson<S2C_DungeonData>(json)));
                    break;
                case 4002:
                    RunOnMainThread(() => OnPlayerMove?.Invoke(JsonUtility.FromJson<S2C_PlayerMoveBroadcast>(json)));
                    break;
                case 4004:
                    RunOnMainThread(() => OnAttackResult?.Invoke(JsonUtility.FromJson<S2C_AttackResult>(json)));
                    break;
                case 5001:
                    RunOnMainThread(() => OnMonsterState?.Invoke(JsonUtility.FromJson<S2C_MonsterState>(json)));
                    break;
                case 5002:
                    RunOnMainThread(() => OnMonsterAttack?.Invoke(JsonUtility.FromJson<S2C_MonsterAttack>(json)));
                    break;
                case 6001:
                    RunOnMainThread(() => OnItemPicked?.Invoke(JsonUtility.FromJson<S2C_ItemPicked>(json)));
                    break;
                case 6002:
                    RunOnMainThread(() => OnItemDropped?.Invoke(JsonUtility.FromJson<S2C_ItemDropped>(json)));
                    break;
                case 7001:
                    RunOnMainThread(() => OnPlayerDeath?.Invoke(JsonUtility.FromJson<S2C_PlayerDeath>(json)));
                    break;
                case 7002:
                    RunOnMainThread(() => OnPlayerRespawn?.Invoke(JsonUtility.FromJson<S2C_PlayerRespawn>(json)));
                    break;
            }
        }
        catch (Exception ex)
        {
            Debug.LogError($"处理消息异常: {ex.Message}");
        }
    }

    public void SendMessage<T>(T message)
    {
        if (!_isConnected || _stream == null) return;

        try
        {
            string json = JsonUtility.ToJson(message);
            byte[] data = Encoding.UTF8.GetBytes(json + "\n");
            _stream.BeginWrite(data, 0, data.Length, OnWriteCallback, null);
        }
        catch (Exception ex)
        {
            Debug.LogError($"发送消息异常: {ex.Message}");
        }
    }

    private void OnWriteCallback(IAsyncResult ar)
    {
        try
        {
            _stream.EndWrite(ar);
        }
        catch (Exception ex)
        {
            Debug.LogError($"写入回调异常: {ex.Message}");
        }
    }

    public void Disconnect()
    {
        _isConnected = false;
        _receiveThread?.Abort();
        _stream?.Close();
        _client?.Close();

        RunOnMainThread(() => OnDisconnected?.Invoke());
        Debug.Log("已断开连接");
    }

    private void RunOnMainThread(Action action)
    {
        lock (_mainThreadActions)
        {
            _mainThreadActions.Enqueue(action);
        }
    }

    private void OnDestroy()
    {
        Disconnect();
    }

    private void OnApplicationQuit()
    {
        Disconnect();
    }
}

[Serializable]
public class MessageTypeWrapper
{
    public int type;
}
