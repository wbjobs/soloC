using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    [Header("UI References")]
    public GameObject LoginPanel;
    public GameObject RoomPanel;
    public GameObject GamePanel;

    [Header("Game Settings")]
    public float TileSize = 1f;
    public GameObject WallPrefab;
    public GameObject FloorPrefab;
    public GameObject PlayerPrefab;
    public GameObject MonsterPrefab;
    public GameObject ItemPrefab;

    [Header("Network Settings")]
    public float PositionLerpSpeed = 10f;
    public float MaxPositionError = 0.5f;
    public bool ClientSidePrediction = true;
    public float ServerUpdateRate = 0.05f;

    private Dictionary<string, GameObject> _playerObjects = new();
    private Dictionary<string, TransformState> _playerTransformStates = new();
    private Dictionary<string, GameObject> _monsterObjects = new();
    private Dictionary<string, TransformState> _monsterTransformStates = new();
    private Dictionary<string, GameObject> _itemObjects = new();
    private Transform _mapContainer;

    private string _currentPlayerId;
    private string _currentRoomId;
    private Vector3 _predictedPosition;
    private Vector3 _lastServerPosition;
    private float _lastInputTime;

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

    private void Start()
    {
        _mapContainer = new GameObject("MapContainer").transform;
        _mapContainer.parent = transform;

        RegisterNetworkEvents();
        ShowLoginPanel();
    }

    private void LateUpdate()
    {
        UpdateTransformInterpolation();
    }

    private void RegisterNetworkEvents()
    {
        NetworkManager.Instance.OnLoginResult += OnLoginResult;
        NetworkManager.Instance.OnCreateRoomResult += OnCreateRoomResult;
        NetworkManager.Instance.OnJoinRoomResult += OnJoinRoomResult;
        NetworkManager.Instance.OnGameStart += OnGameStart;
        NetworkManager.Instance.OnDungeonData += OnDungeonData;
        NetworkManager.Instance.OnPlayerMove += OnPlayerMove;
        NetworkManager.Instance.OnAttackResult += OnAttackResult;
        NetworkManager.Instance.OnMonsterState += OnMonsterState;
        NetworkManager.Instance.OnMonsterAttack += OnMonsterAttack;
        NetworkManager.Instance.OnItemPicked += OnItemPicked;
        NetworkManager.Instance.OnPlayerDeath += OnPlayerDeath;
        NetworkManager.Instance.OnItemDropped += OnItemDropped;
        NetworkManager.Instance.OnPlayerRespawn += OnPlayerRespawn;
    }

    private void OnItemDropped(S2C_ItemDropped dropped)
    {
        Debug.Log($"物品掉落: {dropped.Item.Type} x{dropped.Item.Value} 来自玩家 {dropped.DroppedByPlayerId}");
        
        if (!_itemObjects.ContainsKey(dropped.Item.ItemId))
        {
            var itemObj = Instantiate(ItemPrefab, new Vector3(dropped.Item.PosX * TileSize, dropped.Item.PosY * TileSize, 0), Quaternion.identity, _mapContainer);
            _itemObjects.Add(dropped.Item.ItemId, itemObj);
        }
    }

    private void OnPlayerRespawn(S2C_PlayerRespawn respawn)
    {
        Debug.Log($"玩家重生: {respawn.PlayerId} 在 ({respawn.PosX}, {respawn.PosY})");
        
        if (_playerObjects.TryGetValue(respawn.PlayerId, out var playerObj))
        {
            playerObj.transform.position = new Vector3(respawn.PosX * TileSize, respawn.PosY * TileSize, 0);
            
            var renderer = playerObj.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material.color = respawn.PlayerId == _currentPlayerId ? Color.blue : Color.green;
            }
            
            if (_playerTransformStates.TryGetValue(respawn.PlayerId, out var state))
            {
                state.TargetPosition = playerObj.transform.position;
                state.CurrentPosition = playerObj.transform.position;
            }

            if (respawn.PlayerId == _currentPlayerId)
            {
                _predictedPosition = playerObj.transform.position;
                Debug.Log("你重生了！所有进度已重置。");
            }
        }
    }

    public void ConnectToServer()
    {
        NetworkManager.Instance.Connect();
    }

    public void Login(string playerId, string playerName)
    {
        _currentPlayerId = playerId;
        NetworkManager.Instance.SendMessage(new C2S_Login
        {
            PlayerId = playerId,
            PlayerName = playerName
        });
    }

    private void OnLoginResult(S2C_LoginResult result)
    {
        if (result.Success)
        {
            Debug.Log("登录成功！");
            ShowRoomPanel();
        }
        else
        {
            Debug.LogError($"登录失败: {result.Message}");
        }
    }

    public void SetCurrentPlayerId(string playerId)
    {
        _currentPlayerId = playerId;
    }

    public void CreateRoom(string roomName)
    {
        NetworkManager.Instance.SendMessage(new C2S_CreateRoom
        {
            RoomName = roomName,
            MaxPlayers = 4
        });
    }

    private void OnCreateRoomResult(S2C_CreateRoomResult result)
    {
        if (result.Success)
        {
            _currentRoomId = result.RoomId;
            Debug.Log($"房间创建成功: {result.RoomName} ({result.RoomId})");
        }
    }

    public void JoinRoom(string roomId)
    {
        NetworkManager.Instance.SendMessage(new C2S_JoinRoom
        {
            RoomId = roomId
        });
    }

    private void OnJoinRoomResult(S2C_JoinRoomResult result)
    {
        if (result.Success)
        {
            Debug.Log("加入房间成功！");
            foreach (var player in result.Players)
            {
                Debug.Log($"房间玩家: {player.PlayerName}");
            }
        }
        else
        {
            Debug.LogError($"加入房间失败: {result.Message}");
        }
    }

    public void StartGame()
    {
        NetworkManager.Instance.SendMessage(new C2S_StartGame());
    }

    private void OnGameStart(S2C_GameStart obj)
    {
        Debug.Log("游戏开始！");
    }

    private void OnDungeonData(S2C_DungeonData data)
    {
        Debug.Log($"收到地牢数据: {data.MapWidth}x{data.MapHeight}");
        ShowGamePanel();
        GenerateMap(data);
    }

    private void GenerateMap(S2C_DungeonData data)
    {
        foreach (var player in _playerObjects.Values)
        {
            Destroy(player);
        }
        _playerObjects.Clear();

        foreach (var monster in _monsterObjects.Values)
        {
            Destroy(monster);
        }
        _monsterObjects.Clear();

        foreach (var item in _itemObjects.Values)
        {
            Destroy(item);
        }
        _itemObjects.Clear();

        foreach (var room in data.Rooms)
        {
            for (int x = room.X; x < room.X + room.Width; x++)
            {
                for (int y = room.Y; y < room.Y + room.Height; y++)
                {
                    Instantiate(FloorPrefab, new Vector3(x * TileSize, y * TileSize, 0), Quaternion.identity, _mapContainer);
                }
            }
        }

        foreach (var player in data.Players)
        {
            var pos = new Vector3(player.PosX * TileSize, player.PosY * TileSize, 0);
            var go = Instantiate(PlayerPrefab, pos, Quaternion.identity, _mapContainer);
            _playerObjects.Add(player.PlayerId, go);
            
            var renderer = go.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material.color = player.PlayerId == _currentPlayerId ? Color.blue : Color.green;
            }
            
            var state = new TransformState
            {
                TargetPosition = pos,
                CurrentPosition = pos,
                LastUpdateTime = Time.time
            };
            _playerTransformStates[player.PlayerId] = state;
            
            if (player.PlayerId == _currentPlayerId)
            {
                _predictedPosition = pos;
                _lastServerPosition = pos;
            }
        }

        foreach (var monster in data.Monsters)
        {
            var pos = new Vector3(monster.PosX * TileSize, monster.PosY * TileSize, 0);
            var go = Instantiate(MonsterPrefab, pos, Quaternion.identity, _mapContainer);
            _monsterObjects.Add(monster.MonsterId, go);
            
            var state = new TransformState
            {
                TargetPosition = pos,
                CurrentPosition = pos,
                LastUpdateTime = Time.time
            };
            _monsterTransformStates[monster.MonsterId] = state;
        }

        foreach (var item in data.Items)
        {
            var go = Instantiate(ItemPrefab, new Vector3(item.PosX * TileSize, item.PosY * TileSize, 0), Quaternion.identity, _mapContainer);
            _itemObjects.Add(item.ItemId, go);
        }
    }

    public void MovePlayer(int dirX, int dirY)
    {
        NetworkManager.Instance.SendMessage(new C2S_PlayerMove
        {
            DirX = dirX,
            DirY = dirY
        });
    }

    private void OnPlayerMove(S2C_PlayerMoveBroadcast move)
    {
        var targetPos = new Vector3(move.PosX * TileSize, move.PosY * TileSize, 0);
        
        if (move.PlayerId == _currentPlayerId)
        {
            _lastServerPosition = targetPos;
            
            if (_playerObjects.TryGetValue(move.PlayerId, out var playerObj))
            {
                var error = Vector3.Distance(playerObj.transform.position, targetPos);
                if (error > MaxPositionError)
                {
                    playerObj.transform.position = Vector3.Lerp(playerObj.transform.position, targetPos, 0.5f);
                }
            }
        }
        else
        {
            if (_playerTransformStates.TryGetValue(move.PlayerId, out var state))
            {
                state.TargetPosition = targetPos;
                state.LastUpdateTime = Time.time;
            }
        }
    }

    public void AttackMonster(string monsterId)
    {
        NetworkManager.Instance.SendMessage(new C2S_PlayerAttack
        {
            TargetId = monsterId
        });
    }

    private void OnAttackResult(S2C_AttackResult result)
    {
        Debug.Log($"攻击: {result.AttackerId} -> {result.TargetId}, 伤害: {result.Damage}, 目标HP: {result.TargetHp}");
        if (result.TargetDead)
        {
            if (_monsterObjects.TryGetValue(result.TargetId, out var monsterObj))
            {
                Destroy(monsterObj);
                _monsterObjects.Remove(result.TargetId);
            }
        }
    }

    private void OnMonsterState(S2C_MonsterState state)
    {
        var targetPos = new Vector3(state.PosX * TileSize, state.PosY * TileSize, 0);
        
        if (_monsterTransformStates.TryGetValue(state.MonsterId, out var transformState))
        {
            transformState.TargetPosition = targetPos;
            transformState.LastUpdateTime = Time.time;
        }
        else if (_monsterObjects.TryGetValue(state.MonsterId, out var monsterObj))
        {
            monsterObj.transform.position = targetPos;
        }
    }

    private void OnMonsterAttack(S2C_MonsterAttack attack)
    {
        Debug.Log($"怪物攻击: {attack.MonsterId} -> {attack.PlayerId}, 伤害: {attack.Damage}, 玩家HP: {attack.PlayerHp}");
    }

    private void OnItemPicked(S2C_ItemPicked picked)
    {
        if (picked.PlayerId == _currentPlayerId)
        {
            string itemName = picked.ItemType switch
            {
                ItemType.HealthPotion => "生命药水",
                ItemType.AttackBoost => "攻击强化",
                ItemType.Gold => "金币",
                _ => "未知物品"
            };
            Debug.Log($"你拾取了 {itemName} x{picked.Value}");
        }
        else
        {
            Debug.Log($"玩家 {picked.PlayerId} 拾取了 {picked.ItemType}, 价值: {picked.Value}");
        }

        if (_itemObjects.TryGetValue(picked.ItemId, out var itemObj))
        {
            Destroy(itemObj);
            _itemObjects.Remove(picked.ItemId);
        }
    }

    private void OnPlayerDeath(S2C_PlayerDeath death)
    {
        Debug.Log($"玩家死亡: {death.PlayerId}");
        
        if (death.PlayerId == _currentPlayerId)
        {
            Debug.Log("你死了！等待重生中...");
        }

        if (_playerObjects.TryGetValue(death.PlayerId, out var playerObj))
        {
            var renderer = playerObj.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material.color = Color.gray;
            }
        }
    }

    private void ShowLoginPanel()
    {
        LoginPanel.SetActive(true);
        RoomPanel.SetActive(false);
        GamePanel.SetActive(false);
    }

    private void ShowRoomPanel()
    {
        LoginPanel.SetActive(false);
        RoomPanel.SetActive(true);
        GamePanel.SetActive(false);
    }

    private void ShowGamePanel()
    {
        LoginPanel.SetActive(false);
        RoomPanel.SetActive(false);
        GamePanel.SetActive(true);
    }

    private void Update()
    {
        if (GamePanel.activeSelf)
        {
            HandlePlayerInput();
        }
    }

    private void HandlePlayerInput()
    {
        int dirX = 0, dirY = 0;
        
        if (Input.GetKeyDown(KeyCode.W) || Input.GetKeyDown(KeyCode.UpArrow))
            dirY = 1;
        else if (Input.GetKeyDown(KeyCode.S) || Input.GetKeyDown(KeyCode.DownArrow))
            dirY = -1;
        else if (Input.GetKeyDown(KeyCode.A) || Input.GetKeyDown(KeyCode.LeftArrow))
            dirX = -1;
        else if (Input.GetKeyDown(KeyCode.D) || Input.GetKeyDown(KeyCode.RightArrow))
            dirX = 1;

        if (dirX != 0 || dirY != 0)
        {
            if (Time.time - _lastInputTime >= 0.1f)
            {
                if (ClientSidePrediction && _playerObjects.TryGetValue(_currentPlayerId, out var playerObj))
                {
                    var newPos = _predictedPosition + new Vector3(dirX * TileSize, dirY * TileSize, 0);
                    _predictedPosition = newPos;
                    playerObj.transform.position = Vector3.Lerp(playerObj.transform.position, newPos, 0.8f);
                }
                
                MovePlayer(dirX, dirY);
                _lastInputTime = Time.time;
            }
        }
    }

    private void UpdateTransformInterpolation()
    {
        foreach (var kvp in _playerTransformStates)
        {
            if (kvp.Key == _currentPlayerId) continue;
            
            if (_playerObjects.TryGetValue(kvp.Key, out var playerObj))
            {
                playerObj.transform.position = Vector3.Lerp(
                    playerObj.transform.position,
                    kvp.Value.TargetPosition,
                    PositionLerpSpeed * Time.deltaTime
                );
                kvp.Value.CurrentPosition = playerObj.transform.position;
            }
        }

        foreach (var kvp in _monsterTransformStates)
        {
            if (_monsterObjects.TryGetValue(kvp.Key, out var monsterObj))
            {
                monsterObj.transform.position = Vector3.Lerp(
                    monsterObj.transform.position,
                    kvp.Value.TargetPosition,
                    PositionLerpSpeed * Time.deltaTime * 0.8f
                );
                kvp.Value.CurrentPosition = monsterObj.transform.position;
            }
        }
    }
}

public class TransformState
{
    public Vector3 TargetPosition;
    public Vector3 CurrentPosition;
    public float LastUpdateTime;
}

