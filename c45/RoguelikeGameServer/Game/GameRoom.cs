using System.Collections.Concurrent;
using RoguelikeGameServer.Network;
using RoguelikeGameServer.Protocol;

namespace RoguelikeGameServer.Game;

public class GameRoom
{
    public string RoomId { get; }
    public string RoomName { get; }
    public int MaxPlayers { get; }
    public bool GameStarted { get; private set; }

    private readonly ConcurrentDictionary<string, ClientSession> _players = new();
    private readonly ConcurrentDictionary<string, PlayerInfo> _playerInfos = new();
    private readonly ConcurrentDictionary<string, PlayerMoveState> _playerMoveStates = new();
    private readonly ConcurrentDictionary<string, MonsterInfo> _monsters = new();
    private readonly ConcurrentDictionary<string, MonsterAiState> _monsterAiStates = new();
    private readonly ConcurrentDictionary<string, ItemInfo> _items = new();
    private readonly ClientSession _host;
    private readonly DungeonGenerator _dungeonGenerator = new();
    private DungeonData? _dungeon;
    private CancellationTokenSource? _gameLoopCts;
    private const float ServerTickRate = 20f;
    private const float MonsterAiInterval = 0.5f;
    private DateTime _lastMonsterUpdate = DateTime.Now;
    private DateTime _lastFullStateUpdate = DateTime.Now;
    private const float FullStateUpdateInterval = 2f;

    public GameRoom(string roomName, int maxPlayers, ClientSession host)
    {
        RoomId = Guid.NewGuid().ToString("N");
        RoomName = roomName;
        MaxPlayers = maxPlayers;
        _host = host;
        AddPlayer(host);
    }

    public bool IsHost(ClientSession session) => session == _host;

    public bool AddPlayer(ClientSession session)
    {
        if (GameStarted || _players.Count >= MaxPlayers) return false;
        if (string.IsNullOrEmpty(session.PlayerId)) return false;

        _players.TryAdd(session.PlayerId!, session);

        var playerInfo = new PlayerInfo
        {
            PlayerId = session.PlayerId!,
            PlayerName = session.PlayerName!,
            Hp = 100,
            MaxHp = 100,
            Attack = 15,
            Gold = 0,
            Inventory = new List<InventoryItem>()
        };
        _playerInfos.TryAdd(session.PlayerId!, playerInfo);
        
        var moveState = new PlayerMoveState
        {
            PosX = playerInfo.PosX,
            PosY = playerInfo.PosY,
            TargetPosX = playerInfo.PosX,
            TargetPosY = playerInfo.PosY,
            LastMoveTime = DateTime.UtcNow
        };
        _playerMoveStates.TryAdd(session.PlayerId!, moveState);

        BroadcastToAll(new S2C_PlayerEnterRoom { Player = playerInfo });
        return true;
    }

    public List<PlayerInfo> GetPlayerInfos() => _playerInfos.Values.ToList();

    public async Task StartGameAsync()
    {
        if (GameStarted) return;
        GameStarted = true;

        _dungeon = _dungeonGenerator.GenerateDungeon(_players.Count);
        var startPositions = _dungeon.StartPositions.ToArray();

        int index = 0;
        foreach (var player in _playerInfos.Values)
        {
            if (index < startPositions.Length)
            {
                player.PosX = startPositions[index].x;
                player.PosY = startPositions[index].y;
                
                if (_playerMoveStates.TryGetValue(player.PlayerId, out var moveState))
                {
                    moveState.PosX = player.PosX;
                    moveState.PosY = player.PosY;
                    moveState.TargetPosX = player.PosX;
                    moveState.TargetPosY = player.PosY;
                }
            }
            index++;
        }

        foreach (var monster in _dungeon.Monsters)
        {
            _monsters.TryAdd(monster.MonsterId, monster);
            var aiState = new MonsterAiState
            {
                MonsterId = monster.MonsterId,
                CurrentTargetPlayerId = null,
                LastAttackTime = DateTime.UtcNow,
                LastPathUpdate = DateTime.UtcNow
            };
            _monsterAiStates.TryAdd(monster.MonsterId, aiState);
        }
        foreach (var item in _dungeon.Items)
        {
            _items.TryAdd(item.ItemId, item);
        }

        await BroadcastToAll(new S2C_GameStart());

        var dungeonMessage = new S2C_DungeonData
        {
            MapWidth = _dungeon.Width,
            MapHeight = _dungeon.Height,
            Tiles = _dungeon.Tiles,
            Rooms = _dungeon.Rooms,
            Monsters = _monsters.Values.ToList(),
            Items = _items.Values.ToList(),
            Players = _playerInfos.Values.ToList()
        };
        await BroadcastToAll(dungeonMessage);

        _lastMonsterUpdate = DateTime.Now;
        _lastFullStateUpdate = DateTime.Now;
        _gameLoopCts = new CancellationTokenSource();
        _ = GameLoopAsync(_gameLoopCts.Token);
    }

    private async Task GameLoopAsync(CancellationToken cancellationToken)
    {
        var tickInterval = TimeSpan.FromMilliseconds(1000f / ServerTickRate);

        while (!cancellationToken.IsCancellationRequested && GameStarted)
        {
            try
            {
                var tickStart = DateTime.UtcNow;

                if (DateTime.Now - _lastMonsterUpdate >= TimeSpan.FromSeconds(MonsterAiInterval))
                {
                    await UpdateMonsterAI();
                    _lastMonsterUpdate = DateTime.Now;
                }

                if (DateTime.Now - _lastFullStateUpdate >= TimeSpan.FromSeconds(FullStateUpdateInterval))
                {
                    await BroadcastFullStateAsync();
                    _lastFullStateUpdate = DateTime.Now;
                }

                var elapsed = DateTime.UtcNow - tickStart;
                var remaining = tickInterval - elapsed;
                if (remaining > TimeSpan.Zero)
                {
                    await Task.Delay(remaining, cancellationToken);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"游戏循环异常: {ex.Message}");
                await Task.Delay(tickInterval, cancellationToken);
            }
        }
    }

    private async Task BroadcastFullStateAsync()
    {
        foreach (var player in _playerInfos.Values)
        {
            await BroadcastToAll(new S2C_PlayerMoveBroadcast
            {
                PlayerId = player.PlayerId,
                PosX = player.PosX,
                PosY = player.PosY
            });
        }

        foreach (var monster in _monsters.Values.Where(m => !m.IsDead))
        {
            await BroadcastToAll(new S2C_MonsterState
            {
                MonsterId = monster.MonsterId,
                PosX = monster.PosX,
                PosY = monster.PosY,
                Hp = monster.Hp
            });
        }
    }

    private async Task UpdateMonsterAI()
    {
        var alivePlayers = _playerInfos.Values.Where(p => !p.IsDead).ToList();
        if (alivePlayers.Count == 0) return;

        foreach (var monster in _monsters.Values.ToList())
        {
            if (monster.IsDead) continue;
            
            if (!_monsterAiStates.TryGetValue(monster.MonsterId, out var aiState))
                continue;

            PlayerInfo? bestTarget = null;
            int bestDistance = int.MaxValue;
            float bestPriority = float.MinValue;

            foreach (var player in alivePlayers)
            {
                int distance = Math.Abs(player.PosX - monster.PosX) + Math.Abs(player.PosY - monster.PosY);
                
                if (distance < 2)
                {
                    await MonsterAttack(monster, player, aiState);
                    aiState.LastAttackTime = DateTime.UtcNow;
                    bestTarget = player;
                    break;
                }
                
                float priority = 100f - distance;
                
                if (aiState.CurrentTargetPlayerId == player.PlayerId)
                {
                    priority += 30f;
                }
                
                if (priority > bestPriority && distance <= 10)
                {
                    bestPriority = priority;
                    bestDistance = distance;
                    bestTarget = player;
                }
            }

            if (bestTarget != null && bestDistance > 1 && bestDistance <= 10)
            {
                aiState.CurrentTargetPlayerId = bestTarget.PlayerId;
                MoveMonsterTowardsPlayer(monster, bestTarget);
                
                await BroadcastToAll(new S2C_MonsterState
                {
                    MonsterId = monster.MonsterId,
                    PosX = monster.PosX,
                    PosY = monster.PosY,
                    Hp = monster.Hp
                });
            }
            else if (bestTarget == null)
            {
                aiState.CurrentTargetPlayerId = null;
            }
        }
    }

    private void MoveMonsterTowardsPlayer(MonsterInfo monster, PlayerInfo player)
    {
        int dx = player.PosX - monster.PosX;
        int dy = player.PosY - monster.PosY;

        int moveX = 0, moveY = 0;

        if (Math.Abs(dx) > Math.Abs(dy))
        {
            moveX = dx > 0 ? 1 : -1;
        }
        else if (dy != 0)
        {
            moveY = dy > 0 ? 1 : -1;
        }
        else if (dx != 0)
        {
            moveX = dx > 0 ? 1 : -1;
        }

        int newX = monster.PosX + moveX;
        int newY = monster.PosY + moveY;

        if (IsValidMove(newX, newY))
        {
            monster.PosX = newX;
            monster.PosY = newY;
        }
        else if (moveX != 0)
        {
            newY = monster.PosY + (dy > 0 ? 1 : -1);
            if (IsValidMove(monster.PosX, newY))
            {
                monster.PosY = newY;
            }
        }
        else if (moveY != 0)
        {
            newX = monster.PosX + (dx > 0 ? 1 : -1);
            if (IsValidMove(newX, monster.PosY))
            {
                monster.PosX = newX;
            }
        }
    }

    private async Task MonsterAttack(MonsterInfo monster, PlayerInfo player, MonsterAiState aiState)
    {
        if ((DateTime.UtcNow - aiState.LastAttackTime).TotalSeconds < 1f)
            return;

        aiState.LastAttackTime = DateTime.UtcNow;
        player.Hp -= monster.Attack;

        await BroadcastToAll(new S2C_MonsterAttack
        {
            MonsterId = monster.MonsterId,
            PlayerId = player.PlayerId,
            Damage = monster.Attack,
            PlayerHp = player.Hp
        });

        if (player.IsDead)
        {
            await HandlePlayerDeath(player);
        }
    }

    private async Task HandlePlayerDeath(PlayerInfo player)
    {
        await BroadcastToAll(new S2C_PlayerDeath { PlayerId = player.PlayerId });

        await DropPlayerItems(player);

        _ = Task.Run(async () =>
        {
            await Task.Delay(3000);
            await RespawnPlayer(player);
        });
    }

    private async Task DropPlayerItems(PlayerInfo player)
    {
        if (player.Gold > 0)
        {
            var goldDrop = new ItemInfo
            {
                ItemId = Guid.NewGuid().ToString("N"),
                Type = ItemType.Gold,
                PosX = player.PosX,
                PosY = player.PosY,
                Value = player.Gold
            };
            _items.TryAdd(goldDrop.ItemId, goldDrop);
            
            await BroadcastToAll(new S2C_ItemDropped
            {
                Item = goldDrop,
                DroppedByPlayerId = player.PlayerId
            });
        }

        foreach (var item in player.Inventory)
        {
            var offsetX = Random.Shared.Next(-1, 2);
            var offsetY = Random.Shared.Next(-1, 2);
            var dropX = Math.Clamp(player.PosX + offsetX, 0, _dungeon!.Width - 1);
            var dropY = Math.Clamp(player.PosY + offsetY, 0, _dungeon!.Height - 1);

            if (!IsValidMove(dropX, dropY))
            {
                dropX = player.PosX;
                dropY = player.PosY;
            }

            var droppedItem = new ItemInfo
            {
                ItemId = Guid.NewGuid().ToString("N"),
                Type = item.Type,
                PosX = dropX,
                PosY = dropY,
                Value = item.Value
            };
            _items.TryAdd(droppedItem.ItemId, droppedItem);

            await BroadcastToAll(new S2C_ItemDropped
            {
                Item = droppedItem,
                DroppedByPlayerId = player.PlayerId
            });
        }
    }

    private async Task RespawnPlayer(PlayerInfo player)
    {
        player.Gold = 0;
        player.Inventory.Clear();
        player.Hp = player.MaxHp;
        player.Attack = 15;

        if (_dungeon?.Rooms != null && _dungeon.Rooms.Count > 0)
        {
            var spawnRoom = _dungeon.Rooms[0];
            player.PosX = spawnRoom.X + spawnRoom.Width / 2;
            player.PosY = spawnRoom.Y + spawnRoom.Height / 2;
        }

        await BroadcastToAll(new S2C_PlayerRespawn
        {
            PlayerId = player.PlayerId,
            PosX = player.PosX,
            PosY = player.PosY,
            Hp = player.Hp,
            MaxHp = player.MaxHp,
            Attack = player.Attack
        });
    }

    public async Task HandlePlayerMoveAsync(ClientSession session, int dirX, int dirY)
    {
        if (!_playerInfos.TryGetValue(session.PlayerId!, out var player)) return;
        if (player.IsDead) return;
        
        if (!_playerMoveStates.TryGetValue(player.PlayerId, out var moveState))
            return;

        var now = DateTime.UtcNow;
        if ((now - moveState.LastMoveTime).TotalMilliseconds < 100)
            return;

        dirX = Math.Clamp(dirX, -1, 1);
        dirY = Math.Clamp(dirY, -1, 1);
        
        if (dirX != 0 && dirY != 0)
            dirY = 0;

        int newX = player.PosX + dirX;
        int newY = player.PosY + dirY;

        if (!IsValidMove(newX, newY)) return;

        player.PosX = newX;
        player.PosY = newY;
        moveState.PosX = newX;
        moveState.PosY = newY;
        moveState.LastMoveTime = now;

        await BroadcastToAll(new S2C_PlayerMoveBroadcast
        {
            PlayerId = player.PlayerId,
            PosX = newX,
            PosY = newY
        });

        await CheckItemPickup(player);
        await CheckMonsterEncounter(player);
    }

    private bool IsValidMove(int x, int y)
    {
        if (_dungeon?.Tiles == null) return false;
        if (x < 0 || x >= _dungeon.Width || y < 0 || y >= _dungeon.Height) return false;
        return _dungeon.Tiles[x, y] == 1;
    }

    private async Task CheckItemPickup(PlayerInfo player)
    {
        foreach (var item in _items.Values.ToList())
        {
            if (item.PosX == player.PosX && item.PosY == player.PosY)
            {
                _items.TryRemove(item.ItemId, out _);

                switch (item.Type)
                {
                    case ItemType.HealthPotion:
                        player.Inventory.Add(new InventoryItem
                        {
                            ItemId = Guid.NewGuid().ToString("N"),
                            Type = ItemType.HealthPotion,
                            Value = item.Value,
                            Name = "生命药水"
                        });
                        break;
                    case ItemType.AttackBoost:
                        player.Inventory.Add(new InventoryItem
                        {
                            ItemId = Guid.NewGuid().ToString("N"),
                            Type = ItemType.AttackBoost,
                            Value = item.Value,
                            Name = "攻击强化"
                        });
                        break;
                    case ItemType.Gold:
                        player.Gold += item.Value;
                        break;
                }

                await BroadcastToAll(new S2C_ItemPicked
                {
                    ItemId = item.ItemId,
                    PlayerId = player.PlayerId,
                    ItemType = item.Type,
                    Value = item.Value
                });
            }
        }
    }

    private async Task CheckMonsterEncounter(PlayerInfo player)
    {
        if (player.IsDead) return;

        foreach (var monster in _monsters.Values)
        {
            if (monster.IsDead) continue;
            if (!_monsterAiStates.TryGetValue(monster.MonsterId, out var aiState)) continue;
            
            if (Math.Abs(monster.PosX - player.PosX) <= 1 && Math.Abs(monster.PosY - player.PosY) <= 1)
            {
                await MonsterAttack(monster, player, aiState);
            }
        }
    }

    public async Task HandlePlayerAttackAsync(ClientSession session, string targetId)
    {
        if (!_playerInfos.TryGetValue(session.PlayerId!, out var attacker)) return;
        if (attacker.IsDead) return;

        if (_monsters.TryGetValue(targetId, out var monster))
        {
            int dist = Math.Abs(attacker.PosX - monster.PosX) + Math.Abs(attacker.PosY - monster.PosY);
            if (dist > 2) return;

            monster.Hp -= attacker.Attack;

            await BroadcastToAll(new S2C_AttackResult
            {
                AttackerId = attacker.PlayerId,
                TargetId = monster.MonsterId,
                Damage = attacker.Attack,
                TargetHp = monster.Hp,
                TargetDead = monster.IsDead
            });
        }
    }

    private async Task BroadcastToAll<T>(T message) where T : MessageBase
    {
        foreach (var player in _players.Values)
        {
            await player.SendMessageAsync(message);
        }
    }
}

public class PlayerMoveState
{
    public int PosX { get; set; }
    public int PosY { get; set; }
    public int TargetPosX { get; set; }
    public int TargetPosY { get; set; }
    public DateTime LastMoveTime { get; set; }
    public float MoveSpeed { get; set; } = 5f;
}

public class MonsterAiState
{
    public string MonsterId { get; set; } = string.Empty;
    public string? CurrentTargetPlayerId { get; set; }
    public DateTime LastAttackTime { get; set; }
    public DateTime LastPathUpdate { get; set; }
    public List<(int x, int y)>? CurrentPath { get; set; }
    public int PathIndex { get; set; }
}

