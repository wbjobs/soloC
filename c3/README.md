# 手牌构筑卡牌游戏 (Deck-building Card Game)

基于 Unity + C# + Entities (ECS) + Mirror 开发的本地多人回合制卡牌游戏。

## 项目特性

- **ECS架构**: 使用 Unity Entities 包管理卡牌实体和游戏状态
- **局域网联机**: 使用 Mirror 实现 2-4 人本地联机游戏
- **核心机制**: 标准的 Dominion 风格手牌构筑玩法
- **丰富UI**: 使用 UGUI 实现完整的游戏界面

## 游戏规则

### 基础设置
- 每名玩家初始 10 张牌（7张铜币 + 3张庄园）
- 中央牌库包含多种可购买的卡牌
- 2-4 名玩家参与游戏

### 回合流程
1. **行动阶段**: 可以打出行动牌
2. **购买阶段**: 可以使用钱币购买中央牌库的卡牌
3. **清理阶段**: 弃掉所有手牌和打出的牌，抽 5 张新牌

### 卡牌类型
- **钱币卡**: 铜币(1钱)、银币(2钱)、金币(3钱)
- **胜利卡**: 庄园(1VP)、公国(3VP)、行省(6VP)
- **行动卡**: 市场(+1行动, +1买, +1钱, 抽1张)

### 胜利条件
- 行省牌堆用完，或 3 个牌堆用完时游戏结束
- 胜利点数最多的玩家获胜

## 技术架构

### ECS 组件
- `CardDataComponent`: 卡牌数据
- `CostComponent`: 卡牌费用
- `EffectComponent`: 卡牌效果
- `InHandComponent`: 在手牌中
- `InDeckComponent`: 在牌库中
- `InDiscardComponent`: 在弃牌堆中
- `InPlayComponent`: 在游戏区中
- `InShopComponent`: 在商店中
- `PlayerComponent`: 玩家数据
- `GameStateComponent`: 游戏状态

### ECS 系统
- `GameInitializationSystem`: 游戏初始化
- `CardDrawSystem`: 抽牌和弃牌系统
- `CardPlaySystem`: 卡牌打出系统
- `PurchaseSystem`: 购买系统
- `TurnManagementSystem`: 回合管理系统

### 网络系统
- `GameNetworkManager`: Mirror 网络管理器
- `PlayerNetworkObject`: 玩家网络对象

## 项目目录
```
Assets/
├── Scripts/
│   ├── ECS/
│   │   ├── Components/     # ECS 组件定义
│   │   ├── Systems/        # ECS 系统实现
│   │   └── Data/           # 数据结构和工厂
│   ├── Networking/         # Mirror 网络代码
│   ├── Gameplay/           # 游戏逻辑
│   ├── UI/                 # UGUI 界面代码
│   └── Utils/              # 工具类
├── Prefabs/                # 预设体
└── Scenes/                 # 场景
```

## Unity 设置步骤

### 1. 导入依赖包
1. 打开 Unity Package Manager
2. 导入以下包:
   - **Entities** (Unity 官方)
   - **Mirror** (通过 Asset Store 或 GitHub)
   - **TextMeshPro** (Unity 官方)

### 2. 创建项目结构
1. 创建以下文件夹:
   - `Assets/Prefabs`
   - `Assets/Scenes`
   - `Assets/Materials`

### 3. 创建预设体

#### 玩家预设 (Player Prefab)
1. 创建新的空 GameObject，命名为 "Player"
2. 添加 `NetworkIdentity` 组件
3. 添加 `PlayerNetworkObject` 脚本
4. 保存为 Prefab 到 `Assets/Prefabs/`

#### 卡牌UI预设 (CardUI Prefab)
1. 创建新的 GameObject，添加 `Canvas` 组件
2. 添加 `CardUI` 脚本
3. 设置以下子对象:
   - 背景 Image (CardImage)
   - 名称 Text (NameText)
   - 费用 Text (CostText)
   - 描述 Text (DescriptionText)
4. 设置引用并保存为 Prefab

#### 商店物品预设 (ShopItemUI Prefab)
1. 创建新的 GameObject
2. 添加 `ShopItemUI` 脚本
3. 设置以下子对象:
   - 背景 Image (CardImage)
   - 名称 Text (NameText)
   - 费用 Text (CostText)
   - 数量 Text (CountText)
   - 描述 Text (DescriptionText)
   - 购买 Button (PurchaseButton)
4. 设置引用并保存为 Prefab

#### 网络管理器预设 (GameNetworkManager Prefab)
1. 创建新的 GameObject
2. 添加 `NetworkManager` 组件 (Mirror)
3. 添加 `GameNetworkManager` 脚本
4. 保存为 Prefab

#### UI管理器预设 (UIManager Prefab)
1. 创建新的 GameObject
2. 添加 `UIManager` 脚本
3. 创建 4 个面板:
   - MainMenuPanel: 主菜单 (主机按钮、加入按钮、IP输入框)
   - LobbyPanel: 等待房间 (玩家列表、开始游戏按钮)
   - GamePanel: 游戏界面 (手牌容器、商店容器、记分板、结束回合按钮)
   - GameOverPanel: 游戏结束 (获胜者文本)
4. 设置所有引用并保存为 Prefab

### 4. 创建场景

#### 主场景 (MainScene)
1. 创建新场景
2. 创建空 GameObject，命名为 "GameBootstrap"
3. 添加 `GameBootstrap` 脚本
4. 配置引用:
   - NetworkManager: 指向 GameNetworkManager Prefab
   - PlayerPrefab: 指向 Player Prefab
   - UIManager: 指向 UIManager Prefab
5. 添加 EventSystem 和 Canvas (如需要)
6. 保存场景

### 5. 项目设置
1. Edit > Project Settings > Player
   - Set "Run In Background" = true
   - 设置其他需要的配置

2. Edit > Project Settings > Physics
   - 确保网络设置正确

## 运行游戏

### 局域网联机
1. **主机**:
   - 打开游戏
   - 点击 "创建房间" (Host)
   - 等待其他玩家加入
   - 当有 2+ 玩家时，点击 "开始游戏"

2. **客户端**:
   - 打开游戏
   - 输入主机 IP 地址
   - 点击 "加入房间" (Join)
   - 等待游戏开始

### 测试建议
1. 在同一台机器上测试: 可以使用多个 Unity 编辑器实例，或使用构建版本
2. 在局域网测试: 确保防火墙允许 Unity/Mirror 通信

## 网络端口

- Mirror 默认使用 7777 端口
- 如果有连接问题，检查防火墙设置

## 扩展建议

### 添加新卡牌
1. 在 `CardType` 枚举中添加新类型
2. 在 `CardFactory.CreateCardData()` 中添加卡牌数据
3. 在 `GameInitializationSystem.InitializeShop()` 中添加到商店
4. 更新 `CardUI.GetCardColor()` 分配颜色
5. 在 `CardPlaySystem.ApplyCardEffect()` 中实现新效果

### 添加新游戏模式
1. 扩展 `GameStateComponent`
2. 创建新的 System 处理新模式逻辑
3. 更新 UI 以支持新模式

### 优化性能
1. 考虑使用 Burst Compiler
2. 使用 Jobs System 处理复杂计算
3. 优化 Entity 查询

## 常见问题

### 连接失败
- 确保主机和客户端在同一局域网
- 检查 IP 地址是否正确
- 确认防火墙没有阻止连接

### ECS 世界未初始化
- 确保 `GameNetworkManager` 正确初始化
- 检查 System 的 `OnCreate` 方法

### UI 不更新
- 确认 `UIManager.Instance` 不为空
- 检查 SyncVar 是否正确同步
- 确认 RPC 调用正常工作

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request 来改进项目！
