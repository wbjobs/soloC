# 多人在线 Roguelike 地牢探险游戏

这是一个使用 C# .NET 8.0 开发的多人在线 Roguelike 地牢探险游戏后端服务，支持 Unity 客户端连接。

## 项目结构

```
RoguelikeGameServer/
├── Program.cs                 # 程序入口
├── RoguelikeGameServer.csproj # 项目文件
├── Network/
│   └── TcpServer.cs          # TCP 服务器实现
├── Game/
│   ├── MessageHandler.cs     # 消息处理器
│   ├── GameRoomManager.cs    # 房间管理器
│   ├── GameRoom.cs           # 游戏房间（核心逻辑）
│   └── DungeonGenerator.cs   # 地牢生成器
└── Protocol/
    ├── MessageType.cs        # 消息类型枚举
    ├── MessageBase.cs        # 消息基类
    └── Messages.cs           # 所有消息定义

UnityClient/
├── NetworkManager.cs         # Unity 网络管理器
├── GameManager.cs            # Unity 游戏管理器
└── GameMessages.cs           # Unity 消息定义
```

## 功能特性

### 1. 网络通信
- 使用 TCP Socket 进行通信
- JSON 序列化消息格式
- 支持多客户端同时连接

### 2. 玩家系统
- 玩家登录认证
- 房间创建与加入
- 最多支持 4 名玩家

### 3. 地牢生成
- 随机生成房间（5-13个房间）
- 房间间随机走廊连接
- 房间内生成怪物和物品
- 每个玩家有独立的起始房间

### 4. 游戏逻辑
- 玩家移动（WASD/方向键）
- 物品拾取（血瓶、攻击力增益、金币）
- 战斗系统
- 怪物追击AI
- 状态同步与广播

### 5. 怪物系统
- 多种怪物类型（哥布林、骷髅、史莱姆、蝙蝠、狼人）
- 主动追击玩家（8格范围内）
- 自动攻击（1格范围内）

## 快速开始

### 服务端

1. 安装 .NET 8.0 SDK
2. 进入 `RoguelikeGameServer` 目录
3. 运行：
```bash
dotnet run
```
服务器将在 8888 端口启动

### Unity 客户端

1. 创建一个新的 Unity 项目
2. 将 `UnityClient` 目录下的所有脚本复制到 Unity 项目的 Assets 目录
3. 创建一个空 GameObject，添加 `NetworkManager` 组件
4. 创建另一个空 GameObject，添加 `GameManager` 组件
5. 创建 3 个 UI Panel（LoginPanel、RoomPanel、GamePanel）
6. 创建所需的 Prefab（Wall、Floor、Player、Monster、Item）
7. 在 Inspector 中设置所有引用

## 消息协议

### 客户端 → 服务器

| 消息类型 | ID | 说明 |
|---------|-----|------|
| C2S_Login | 1001 | 玩家登录 |
| C2S_CreateRoom | 2001 | 创建房间 |
| C2S_JoinRoom | 2003 | 加入房间 |
| C2S_StartGame | 3001 | 开始游戏 |
| C2S_PlayerMove | 4001 | 玩家移动 |
| C2S_PlayerAttack | 4003 | 玩家攻击 |

### 服务器 → 客户端

| 消息类型 | ID | 说明 |
|---------|-----|------|
| S2C_LoginResult | 1002 | 登录结果 |
| S2C_CreateRoomResult | 2002 | 创建房间结果 |
| S2C_JoinRoomResult | 2004 | 加入房间结果 |
| S2C_PlayerEnterRoom | 2005 | 玩家进入房间通知 |
| S2C_GameStart | 3002 | 游戏开始通知 |
| S2C_DungeonData | 3003 | 地牢数据 |
| S2C_PlayerMoveBroadcast | 4002 | 玩家移动广播 |
| S2C_AttackResult | 4004 | 攻击结果 |
| S2C_MonsterState | 5001 | 怪物状态更新 |
| S2C_MonsterAttack | 5002 | 怪物攻击 |
| S2C_ItemPicked | 6001 | 物品拾取 |
| S2C_PlayerDeath | 7001 | 玩家死亡 |

## 游戏流程

1. 客户端连接服务器
2. 发送登录请求（PlayerId、PlayerName）
3. 创建房间或加入现有房间
4. 房主点击开始游戏
5. 服务器生成地牢地图
6. 服务器向所有客户端发送地牢数据
7. 玩家开始探索地牢
8. 玩家移动、战斗、拾取物品
9. 怪物自动追击和攻击玩家
10. 所有状态变更实时广播给所有玩家

## 技术栈

- **服务端**: .NET 8.0 + C#
- **网络**: TCP Socket
- **序列化**: System.Text.Json
- **客户端**: Unity 2020+

## 扩展建议

1. 添加数据库支持，保存玩家数据
2. 添加更多怪物类型和物品
3. 添加技能系统
4. 添加组队系统
5. 添加排行榜
6. 添加聊天功能
7. 添加断线重连
8. 添加心跳机制
9. 添加地图种子
10. 添加声音效果

## 许可证

MIT License
