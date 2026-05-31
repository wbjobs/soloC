# 量子电路编辑器

这是一个基于Go + Gin后端和Vue3 + Three.js前端的量子电路可视化编辑器。

## 功能特性

### 后端 (Go + Gin)
- ✅ 量子电路模拟器，支持多种量子门
- ✅ 态向量计算
- ✅ 泡利期望值计算（X, Y, Z）
- ✅ REST API接口
- ✅ CORS支持
- ✅ 执行历史记录

### 前端 (Vue3 + Three.js)
- ✅ 可拖拽的量子电路编辑器
- ✅ 支持6种量子门：Hadamard(H)、Pauli-X、Pauli-Y、Pauli-Z、CNOT、Rotation-X
- ✅ Three.js 3D球面概率幅可视化（布洛赫球面）
- ✅ 实时概率分布显示
- ✅ 泡利期望值图表
- ✅ 执行历史记录和曲线图

## 支持的量子门

| 门类型 | 符号 | 描述 |
|--------|------|------|
| Hadamard | H | 创建叠加态 |
| Pauli-X | X | 量子比特翻转（NOT门） |
| Pauli-Y | Y | 绕Y轴旋转π |
| Pauli-Z | Z | 绕Z轴旋转π |
| CNOT | CNOT | 受控非门 |
| RX | RX | 绕X轴旋转 |

## 运行方式

### 后端运行

```bash
cd backend
go mod init quantum-circuit-api  # 如果还没初始化
go get github.com/gin-gonic/gin
go run main.go
```

后端将在 `http://localhost:8080` 启动

### 前端运行

```bash
cd frontend
npm install
npm run dev
```

前端将在 `http://localhost:5173` 启动

## API 接口

### POST /api/execute
执行量子电路

**请求体：**
```json
{
  "qubitCount": 2,
  "gates": [
    {"type": "H", "qubits": [0]},
    {"type": "CNOT", "qubits": [0, 1]}
  ]
}
```

**响应：**
```json
{
  "id": "20240101120000",
  "timestamp": "2024-01-01T12:00:00Z",
  "stateVector": [0.707, 0, 0, 0.707],
  "probabilities": [0.5, 0, 0, 0.5],
  "expectations": {
    "X": [0, 0],
    "Y": [0, 0],
    "Z": [0, 0]
  },
  "circuit": { ... }
}
```

### GET /api/history
获取执行历史记录

### DELETE /api/history
清除执行历史记录

## 使用说明

1. 从左侧面板拖拽量子门到电路编辑区域
2. 点击量子比特行来放置门
3. 点击已放置的门可以删除它
4. 点击"添加量子比特"来增加量子比特数量
5. 点击"执行电路"来运行模拟
6. 右侧面板显示3D可视化和概率分布
7. 底部显示泡利期望值的历史趋势图

## 项目结构

```
c73/
├── backend/
│   ├── main.go          # 后端主文件，包含量子模拟器和API
│   ├── go.mod           # Go模块依赖
│   └── go.sum           # Go依赖校验
└── frontend/
    ├── src/
    │   ├── App.vue      # 主Vue组件
    │   ├── main.js      # Vue入口
    │   └── style.css    # 样式文件
    ├── index.html       # HTML入口
    ├── vite.config.js   # Vite配置
    └── package.json     # npm依赖
```

## 技术栈

- **后端:** Go 1.21+, Gin Web Framework
- **前端:** Vue 3, Vite, Three.js, Chart.js
