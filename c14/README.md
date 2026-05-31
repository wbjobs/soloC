# 量子计算模拟器 (Quantum Computing Simulator)

一个交互式的量子计算模拟器Web界面，使用Python + QuTiP后端和React + D3.js前端构建。

## 功能特性

- **量子电路构建**：通过拖拽方式可视化构建量子电路
- **多种量子门**：支持单量子比特门（H, X, Y, Z, S, T）和双量子比特门（CNOT, SWAP）
- **Bloch球可视化**：使用D3.js实时显示量子态在Bloch球上的位置
- **量子态演化**：逐步查看量子态的演化过程
- **概率分布**：显示各量子态的测量概率

## 技术栈

### 后端
- **Python**：编程语言
- **Flask**：Web框架
- **QuTiP**：量子计算模拟器库
- **NumPy**：数值计算

### 前端
- **React**：前端框架
- **D3.js**：数据可视化（Bloch球）
- **HTML5 Drag and Drop API**：拖拽功能

## 项目结构

```
quantum-simulator/
├── backend/
│   ├── __init__.py
│   ├── app.py              # Flask API服务器
│   └── quantum_simulator.py # QuTiP量子电路模拟
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── BlochSphere.js      # D3.js Bloch球可视化
│   │   │   ├── GatePalette.js      # 量子门选择面板
│   │   │   ├── QuantumCircuit.js   # 量子电路编辑器
│   │   │   └── VisualizationPanel.js # 可视化面板
│   │   ├── services/
│   │   │   └── api.js              # API调用
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
├── requirements.txt
├── run_backend.py
└── README.md
```

## 安装和运行

### 1. 安装后端依赖

```bash
# 创建Python虚拟环境（推荐）
python -m venv venv
venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt
```

### 2. 安装前端依赖

```bash
cd frontend
npm install
```

### 3. 启动后端服务器

```bash
# 在项目根目录下
python run_backend.py
```

后端将运行在 http://localhost:5000

### 4. 启动前端开发服务器

```bash
# 在frontend目录下
cd frontend
npm start
```

前端将运行在 http://localhost:3000

## 使用说明

1. **构建量子电路**：
   - 从左侧量子门面板拖拽门到电路区域
   - 对于双量子比特门（CNOT, SWAP），先选择控制比特，再拖放到目标比特

2. **修改电路**：
   - 点击已放置的门上的 × 按钮删除该门
   - 使用"清空电路"按钮重置所有门

3. **运行模拟**：
   - 点击"运行模拟"按钮执行量子计算
   - 右侧面板将显示量子态可视化

4. **查看量子态演化**：
   - 使用下方的控制按钮逐步查看量子态变化
   - 或点击"播放"按钮自动演示演化过程

## API 端点

- `POST /api/simulate` - 执行量子电路模拟
- `POST /api/simulate/step-by-step` - 逐步模拟，返回每个步骤的状态
- `GET /api/gates` - 获取可用量子门列表
- `POST /api/set-qubits` - 设置量子比特数量

## 支持的量子门

### 单量子比特门
- **H (Hadamard)**：创建叠加态
- **X (Pauli-X)**：量子非门（绕X轴旋转π）
- **Y (Pauli-Y)**：绕Y轴旋转π
- **Z (Pauli-Z)**：绕Z轴旋转π
- **S (Phase)**：相位门（绕Z轴旋转π/2）
- **T (T-gate)**：π/4相位门

### 双量子比特门
- **CNOT**：受控非门
- **SWAP**：交换两个量子比特的状态

## 注意事项

- 确保后端服务器在运行时才能执行模拟
- 支持的最大量子比特数为5
- 首次运行可能需要一些时间来加载QuTiP库

## 许可证

MIT License
