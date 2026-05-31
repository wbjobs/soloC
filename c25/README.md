# 多人在线卡牌游戏后端服务

基于 Go + Redis + gRPC 开发的多人在线卡牌游戏后端服务，采用微服务架构设计。

## 项目架构

```
cardgame/
├── cmd/
│   ├── player-service/      # 玩家状态服务入口
│   ├── room-service/        # 房间匹配服务入口
│   ├── game-service/        # 游戏逻辑服务入口
│   ├── websocket-service/   # WebSocket 实时通信服务入口
│   └── gateway/             # API 网关服务入口
├── internal/
│   ├── config/              # 配置管理
│   ├── redis/               # Redis 客户端
│   ├── card/                # 卡牌数据定义
│   ├── player/              # 玩家服务实现
│   ├── room/                # 房间服务实现
│   ├── game/                # 游戏服务实现
│   ├── websocket/           # WebSocket 服务实现
│   └── gateway/             # 网关服务实现
└── proto/                   # gRPC 协议定义
    ├── player.proto
    ├── room.proto
    └── game.proto
```

## 服务说明

### 1. 玩家状态服务 (Player Service)
- **端口**: `:50051`
- **功能**:
  - 玩家信息管理（创建、查询、更新）
  - 游戏战绩统计（总场次、胜率、段位分数）
  - 卡牌收藏管理

### 2. 房间匹配服务 (Room Service)
- **端口**: `:50052`
- **功能**:
  - 创建房间
  - 加入/离开房间
  - 自动匹配对手（基于段位分）
  - 房间列表查询

### 3. 游戏逻辑服务 (Game Service)
- **端口**: `:50053`
- **功能**:
  - 游戏开始/发牌
  - 出牌逻辑
  - 战斗计算
  - 回合管理
  - 游戏结算

### 4. WebSocket 实时通信服务
- **端口**: `:8081`
- **功能**:
  - 客户端 WebSocket 连接
  - 实时消息广播
  - 游戏事件推送
  - 心跳检测

### 5. API 网关服务 (Gateway)
- **端口**: `:8080`
- **功能**:
  - HTTP REST API 统一入口
  - gRPC 服务调用转发
  - CORS 支持
  - 请求日志

## 前置要求

- Go 1.21+
- Redis 6.0+
- Protocol Buffers 编译器（可选，用于生成代码）

## 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `REDIS_ADDR` | `localhost:6379` | Redis 地址 |
| `REDIS_PASSWORD` | `` | Redis 密码 |
| `REDIS_DB` | `0` | Redis 数据库编号 |
| `PLAYER_PORT` | `:50051` | 玩家服务端口 |
| `ROOM_PORT` | `:50052` | 房间服务端口 |
| `GAME_PORT` | `:50053` | 游戏服务端口 |
| `GATEWAY_PORT` | `:8080` | 网关端口 |
| `WS_ADDR` | `:8081` | WebSocket 地址 |

## 快速启动

### 1. 启动 Redis

```bash
redis-server
```

### 2. 安装依赖

```bash
go mod tidy
```

### 3. 启动微服务（按顺序）

**终端 1 - 玩家服务:**
```bash
go run cmd/player-service/main.go
```

**终端 2 - 房间服务:**
```bash
go run cmd/room-service/main.go
```

**终端 3 - 游戏服务:**
```bash
go run cmd/game-service/main.go
```

**终端 4 - WebSocket 服务:**
```bash
go run cmd/websocket-service/main.go
```

**终端 5 - 网关服务:**
```bash
go run cmd/gateway/main.go
```

## API 文档

### 玩家相关 API

#### 创建玩家
```
POST /api/v1/players/create
Content-Type: application/json

{
  "username": "玩家名称",
  "avatar": "头像URL"
}
```

#### 获取玩家信息
```
GET /api/v1/players/info?player_id={player_id}
```

#### 更新玩家信息
```
PUT /api/v1/players/update
Content-Type: application/json

{
  "player_id": "玩家ID",
  "username": "新名称",
  "avatar": "新头像URL"
}
```

#### 获取玩家战绩
```
GET /api/v1/players/stats?player_id={player_id}
```

#### 获取卡牌收藏
```
GET /api/v1/players/cards?player_id={player_id}
```

### 房间相关 API

#### 创建房间
```
POST /api/v1/rooms/create
Content-Type: application/json

{
  "player_id": "玩家ID",
  "player_name": "玩家名称",
  "game_mode": "1v1",
  "max_players": 2
}
```

#### 加入房间
```
POST /api/v1/rooms/join
Content-Type: application/json

{
  "room_id": "房间ID",
  "player_id": "玩家ID",
  "player_name": "玩家名称"
}
```

#### 离开房间
```
POST /api/v1/rooms/leave
Content-Type: application/json

{
  "room_id": "房间ID",
  "player_id": "玩家ID"
}
```

#### 获取房间信息
```
GET /api/v1/rooms/info?room_id={room_id}
```

#### 获取房间列表
```
GET /api/v1/rooms/list?game_mode=1v1&page=1&page_size=20
```

#### 开始匹配
```
POST /api/v1/rooms/matchmaking/start
Content-Type: application/json

{
  "player_id": "玩家ID",
  "player_name": "玩家名称",
  "game_mode": "1v1",
  "rank_score": 1000
}
```

#### 取消匹配
```
POST /api/v1/rooms/matchmaking/cancel
Content-Type: application/json

{
  "player_id": "玩家ID",
  "matchmaking_id": "匹配ID"
}
```

### 游戏相关 API

#### 开始游戏
```
POST /api/v1/games/start
Content-Type: application/json

{
  "room_id": "房间ID",
  "player_ids": ["玩家ID1", "玩家ID2"],
  "max_turns": 10
}
```

#### 出牌
```
POST /api/v1/games/play
Content-Type: application/json

{
  "game_id": "游戏ID",
  "player_id": "玩家ID",
  "card_instance_id": "卡牌实例ID",
  "target_player_id": "目标玩家ID"
}
```

#### 结束回合
```
POST /api/v1/games/endturn
Content-Type: application/json

{
  "game_id": "游戏ID",
  "player_id": "玩家ID"
}
```

#### 获取游戏状态
```
GET /api/v1/games/state?game_id={game_id}&player_id={player_id}
```

#### 投降
```
POST /api/v1/games/surrender
Content-Type: application/json

{
  "game_id": "游戏ID",
  "player_id": "玩家ID"
}
```

## WebSocket 连接

### 连接地址
```
ws://localhost:8081/ws?player_id={player_id}
```

### 消息格式

#### 客户端发送消息
```json
{
  "type": "ping",
  "payload": {}
}
```

#### 服务端推送消息类型
- `connected` - 连接成功
- `pong` - 心跳响应
- `heartbeat_ack` - 心跳确认
- `game_started` - 游戏开始
- `card_played` - 出牌事件
- `turn_ended` - 回合结束
- `game_ended` - 游戏结束

## 游戏规则

### 核心规则
1. **玩家数**: 2人对战
2. **初始手牌**: 5张
3. **最大回合数**: 10回合（可配置）
4. **回合补充**: 每个大回合开始时，每位玩家抽1张牌
5. **胜利条件**: 10回合结束后，得分高者获胜

### 卡牌类型
- **攻击卡 (ATTACK)**: 高攻击力，用于输出
- **防御卡 (DEFENSE)**: 高防御力，用于抵挡
- **法术卡 (MAGIC)**: 特殊效果
- **特殊卡 (SPECIAL)**: 独特能力

### 战斗计算
1. 出牌时，卡牌攻击力与对方场上卡牌防御力比较
2. 如果攻击力 > 防御力，超出部分转为得分
3. 双方卡牌互相造成伤害

## Redis 数据结构

### 玩家数据
- `player:{player_id}` (Hash) - 玩家基本信息
- `player:stats:{player_id}` (Hash) - 玩家战绩
- `player:cards:{player_id}` (Set) - 卡牌收藏

### 房间数据
- `room:{room_id}` (Hash) - 房间信息
- `room:players:{room_id}` (Set) - 房间玩家
- `rooms:list:{game_mode}` (List) - 房间列表

### 游戏数据
- `game:{game_id}` (String/JSON) - 游戏状态

### 匹配队列
- `matchmaking:{game_mode}:{player_id}` (String/JSON) - 匹配玩家

### Pub/Sub 频道
- `match:found:{player_id}` - 匹配成功通知
- `game:{game_id}` - 游戏事件
- `player:game:{player_id}` - 玩家游戏事件
- `client:message:{player_id}` - 客户端消息

## 卡牌数据

项目包含12种基础卡牌：

| 卡牌ID | 名称 | 攻击 | 防御 | 稀有度 | 类型 |
|--------|------|------|------|--------|------|
| c001 | 炎龙战士 | 5 | 3 | rare | ATTACK |
| c002 | 冰霜法师 | 3 | 4 | rare | MAGIC |
| c003 | 岩石巨人 | 2 | 8 | common | DEFENSE |
| c004 | 闪电刺客 | 7 | 1 | epic | ATTACK |
| c005 | 神圣牧师 | 1 | 5 | common | MAGIC |
| c006 | 暗影骑士 | 4 | 5 | epic | ATTACK |
| c007 | 精灵射手 | 3 | 3 | common | ATTACK |
| c008 | 守护天使 | 2 | 6 | rare | DEFENSE |
| c009 | 地狱火 | 6 | 6 | legendary | MAGIC |
| c010 | 时空术士 | 4 | 4 | legendary | SPECIAL |
| c011 | 狂战士 | 8 | 2 | rare | ATTACK |
| c012 | 冰霜元素 | 3 | 5 | common | DEFENSE |

## 注意事项

1. **Proto 代码生成**: 本项目包含手动编写的服务实现。如需使用 protoc 生成代码，请确保已安装 protobuf 编译器和 Go 插件。

2. **Redis 连接**: 确保 Redis 服务正常运行，配置正确的地址和密码。

3. **服务启动顺序**: 建议先启动 gRPC 微服务，再启动网关和 WebSocket 服务。

4. **数据持久化**: 当前版本使用 Redis 内存存储，生产环境建议配置 Redis 持久化。

## 未来优化方向

- [ ] 添加用户认证 (JWT)
- [ ] 实现匹配算法优化 (ELO/MMR)
- [ ] 添加卡牌技能系统
- [ ] 实现观战模式
- [ ] 添加聊天系统
- [ ] 实现排行榜
- [ ] 添加任务系统
- [ ] 实现邮件系统
- [ ] 添加商店系统
- [ ] 实现赛季系统

## 许可证

MIT License
