# EEG 注意力训练系统

基于Web Bluetooth和WebSocket的实时脑电分析平台，支持多人同步分析和注意力训练游戏。

## 功能特性

### 核心功能
- **Web蓝牙连接**: 支持通过Web Bluetooth API连接消费级EEG设备（如Muse头带）
- **实时信号处理**: 后端使用MNE-Python进行伪迹去除和频带功率计算
- **WebSocket实时通信**: 实时传输EEG数据和分析结果
- **自动重连机制**: WebSocket和蓝牙连接断开时自动尝试重连
- **离线数据缓存**: 网络断开时本地缓存数据，恢复后自动同步

### 可视化功能
- **5个频带实时频谱图**: Delta, Theta, Alpha, Beta, Gamma
- **注意力评分仪表盘**: 0-100分实时注意力指数
- **原始EEG波形显示**: 4通道原始数据实时显示
- **群体同步性雷达图**: 多人PLV（Phase Locking Value）同步性分析

### 多人同步分析
- 最多支持4人同时连接
- 实时计算群体同步性指数
- 雷达图展示各频段同步程度
- 群体注意力分布对比

### 历史会话对比
- 保存所有会话记录
- 支持最多4个会话同时对比
- 注意力曲线对比可视化
- 平均注意力统计

### 注意力训练游戏
- 迷宫控制游戏：通过注意力控制小球移动
- 关卡难度递进系统
- 实时反馈机制
- 积分和等级系统

## 技术栈

### 后端
- **Django 4.2**: Web框架
- **Django Channels**: WebSocket支持
- **MNE-Python**: EEG信号处理
- **NumPy/SciPy**: 数值计算
- **Redis**: 通道层（可选）

### 前端
- **React 18**: UI框架
- **Recharts**: 数据可视化
- **Tailwind CSS**: 样式框架
- **Web Bluetooth API**: 设备连接
- **Axios**: HTTP客户端

## 项目结构

```
c76/
├── backend/
│   ├── eeg/
│   │   ├── models.py           # 数据模型
│   │   ├── views.py            # API视图
│   │   ├── consumers.py        # WebSocket处理器
│   │   ├── signal_processing.py # EEG信号处理
│   │   ├── sync_analysis.py    # 多人同步分析
│   │   ├── serializers.py      # 序列化器
│   │   ├── routing.py          # WebSocket路由
│   │   └── urls.py             # API路由
│   ├── eeg_app/
│   │   ├── settings.py         # Django配置
│   │   ├── asgi.py             # ASGI配置
│   │   └── urls.py             # 主路由
│   ├── requirements.txt        # Python依赖
│   └── manage.py
└── frontend/
    ├── src/
    │   ├── services/
    │   │   ├── WebSocketService.js    # WebSocket服务
    │   │   └── BluetoothService.js    # 蓝牙服务
    │   ├── components/
    │   │   ├── EEGMonitor.js          # EEG监测组件
    │   │   ├── MazeGame.js            # 迷宫游戏组件
    │   │   └── SessionCompare.js      # 会话对比组件
    │   ├── App.js              # 主应用
    │   ├── index.js            # 入口文件
    │   └── index.css           # 样式文件
    ├── public/
    │   └── index.html          # HTML模板
    └── package.json            # Node依赖
```

## 安装和运行

### 后端设置

1. 进入后端目录：
```bash
cd backend
```

2. 创建虚拟环境并激活：
```bash
python -m venv venv
venv\Scripts\activate  # Windows
# 或
source venv/bin/activate  # Linux/Mac
```

3. 安装依赖：
```bash
pip install -r requirements.txt
```

4. 执行数据库迁移：
```bash
python manage.py makemigrations
python manage.py migrate
```

5. 启动Django开发服务器：
```bash
python manage.py runserver
```

后端服务将在 `http://localhost:8000` 运行

### 前端设置

1. 进入前端目录：
```bash
cd frontend
```

2. 安装依赖：
```bash
npm install
```

3. 启动React开发服务器：
```bash
npm start
```

前端应用将在 `http://localhost:3000` 运行

## 使用说明

### 单人模式
1. 勾选"使用模拟器"或连接蓝牙EEG设备
2. 输入会话名称
3. 点击"开始记录"
4. 在"实时监测"页面查看脑电数据
5. 在"训练游戏"页面进行注意力训练
6. 点击"结束记录"保存会话

### 多人同步模式
1. 第一个用户点击"创建群组会话"
2. 其他用户输入群组ID，点击"加入群组"
3. 所有用户开始记录后，可在"实时监测"页面查看群体同步性数据
4. 雷达图显示各频段的PLV同步指数
5. 注意力分布图展示各参与者注意力水平

### 历史对比
1. 点击"历史对比"标签页
2. 选择要对比的会话（最多4个）
3. 点击"对比选中会话"
4. 查看注意力曲线对比和统计数据

## API接口

### WebSocket端点
- `ws://localhost:8000/ws/eeg/` - 主WebSocket连接

### 消息类型
```javascript
// 开始会话
{ type: 'start_session', name: '会话名称' }

// 发送EEG数据
{ type: 'eeg_data', channels: [ch1, ch2, ch3, ch4] }

// 创建群组会话
{ type: 'create_group_session', name: '群组名称', participant_name: '参与者1' }

// 加入群组会话
{ type: 'join_group_session', group_session_id: 'xxx', participant_name: '参与者2' }

// 群组模式发送EEG数据
{ type: 'group_eeg_data', channels: [...], attention_score: 75 }

// 结束会话
{ type: 'end_session' }
```

### REST API
- `GET /api/sessions/` - 获取所有会话
- `GET /api/sessions/<id>/` - 获取单个会话详情
- `GET /api/session-compare/?ids=1,2,3` - 对比多个会话
- `POST /api/sync-offline/` - 同步离线缓存数据
- `POST /api/resume-session/` - 恢复会话

## 信号处理说明

### 伪迹去除
- 带通滤波 (0.5-50Hz)
- 坏通道检测和插值
- ICA眼电伪迹去除（可选）

### 频带功率计算
使用Welch方法计算功率谱密度：
- Delta: 0.5-4Hz
- Theta: 4-8Hz
- Alpha: 8-13Hz
- Beta: 13-30Hz
- Gamma: 30-50Hz

### 注意力评分公式
```
注意力评分 = (Alpha + Beta) / (Theta + Delta) * 30
范围: 0-100
```

### PLV同步性计算
```
PLV = |mean(exp(i * (phase1 - phase2)))|
范围: 0-1，值越高表示同步性越强
```

## 浏览器兼容性

- Chrome 56+ (Web Bluetooth支持)
- Edge 79+
- Opera 43+
- Safari 15.4+

注意：Web Bluetooth API需要HTTPS环境（localhost除外）

## 注意事项

1. **设备兼容性**: 目前主要针对Muse系列头带开发，其他设备可能需要适配
2. **采样率**: 默认256Hz，可在settings.py中调整
3. **网络要求**: WebSocket需要稳定的网络连接
4. **数据隐私**: EEG数据属于敏感个人数据，请确保合规存储和传输

## 未来改进方向

- 支持更多EEG设备型号
- 添加更多注意力训练游戏
- 实现云端数据存储和分析
- 添加机器学习注意力预测模型
- 支持导出PDF报告
- 团队协作训练功能增强

## 许可证

MIT License
