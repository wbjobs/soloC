# 实时音频频谱分析系统

基于 Rust + WASM + React + Three.js 的实时音频频谱分析系统，支持 3D 可视化展示。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React + Three.js)                   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │  文件上传组件    │  │ WebSocket客户端 │  │ 3D频谱可视化    │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                     后端 (Python FastAPI)                        │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │  音频加载器     │  │  FFT处理器     │  │  数据保存服务   │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Rust WASM FFT 模块 (可选高性能计算)             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │  Hann Window   │  │   FFT 变换     │  │  频谱计算       │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## 功能特性

- 🎵 **音频文件上传**: 支持 WAV 和 MP3 格式
- 📊 **实时 FFT 分析**: 使用 NumPy 进行高效频谱分析（Rust WASM 模块可替代）
- 🔌 **WebSocket 实时传输**: 频谱数据实时推送至前端
- 🎨 **3D 可视化**: 使用 Three.js 渲染彩色频谱柱状图
- 💾 **JSON 数据导出**: 支持后端保存和前端下载两种方式
- 🌟 **交互式 3D 场景**: 鼠标拖拽旋转、滚轮缩放

## 目录结构

```
c11/
├── rust-fft/              # Rust WASM FFT 模块
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs         # FFT 分析器实现
│
├── backend/               # Python FastAPI 后端
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py
│       ├── main.py        # FastAPI 主应用
│       ├── audio_loader.py # 音频文件加载
│       └── fft_processor.py # FFT 频谱分析
│
├── frontend/              # React 前端
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx        # 主应用组件
│       ├── App.css
│       └── index.css
│
├── install_dependencies.ps1  # 安装依赖脚本
├── start_backend.ps1         # 启动后端
└── start_frontend.ps1        # 启动前端
```

## 快速开始

### 环境要求

- **Python**: 3.9+
- **Node.js**: 18+
- **FFmpeg** (可选，用于 MP3 支持，pydub 需要)

### 安装依赖

```powershell
.\install_dependencies.ps1
```

或手动安装：

**后端依赖:**
```powershell
cd backend
pip install -r requirements.txt
```

**前端依赖:**
```powershell
cd frontend
npm install
```

### 启动系统

**终端 1 - 启动后端:**
```powershell
.\start_backend.ps1
# 或手动:
# cd backend
# python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**终端 2 - 启动前端:**
```powershell
.\start_frontend.ps1
# 或手动:
# cd frontend
# npm run dev
```

### 访问应用

打开浏览器访问: http://localhost:5173

## API 接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/upload` | POST | 上传音频文件 |
| `/ws/analyze/{session_id}` | WebSocket | 实时频谱分析 |
| `/api/spectrum/{session_id}` | GET | 下载频谱 JSON |
| `/api/sessions` | GET | 列出所有会话 |
| `/api/sessions/{session_id}` | DELETE | 删除会话 |
| `/docs` | GET | FastAPI 文档 |

## WebSocket 消息协议

**客户端发送:**
```json
{
  "config": {
    "fft_size": 1024,
    "hop_size": 512
  }
}
```

**服务端响应:**

1. **ready** - 连接就绪
```json
{
  "type": "ready",
  "sample_rate": 44100,
  "duration": 30.5
}
```

2. **start** - 开始分析
```json
{
  "type": "start",
  "total_frames": 2621
}
```

3. **spectrum** - 频谱数据
```json
{
  "type": "spectrum",
  "frame": 125,
  "total": 2621,
  "data": {
    "frequencies": [21.533, 43.066, ...],
    "magnitudes": [-45.2, -38.1, ...],
    "sample_rate": 44100,
    "fft_size": 1024,
    "timestamp": 1.45
  }
}
```

4. **complete** - 分析完成
```json
{
  "type": "complete",
  "total_frames": 2621,
  "download_url": "/api/spectrum/{session_id}"
}
```

## Rust WASM 模块 (可选)

如果需要在前端或后端直接使用 Rust WASM 进行更高性能的 FFT 计算：

**编译 WASM:**
```powershell
cd rust-fft
wasm-pack build --target web
```

**在 Python 中使用 (wasmtime):**
```python
import wasmtime
# 加载并调用 WASM 模块
```

**在浏览器中使用:**
```javascript
import init, { FftAnalyzer } from 'rust-fft/pkg/rust_fft.js'
await init()
const analyzer = new FftAnalyzer(1024)
const result = analyzer.analyze(samples, 44100, timestamp)
```

## JSON 输出格式

```json
{
  "session_id": "uuid-string",
  "filename": "audio.wav",
  "sample_rate": 44100,
  "fft_size": 1024,
  "hop_size": 512,
  "spectrums": [
    {
      "frequencies": [21.5, 43.0, ...],
      "magnitudes": [-45.2, -38.1, ...],
      "timestamp": 0.0
    },
    ...
  ]
}
```

## 技术栈

- **前端**: React 18, Three.js, @react-three/fiber, Vite
- **后端**: FastAPI, Uvicorn, NumPy, SoundFile, PyDub
- **Rust**: wasm-bindgen, rustfft, serde_json
- **通信**: WebSocket
- **数据格式**: JSON

## 使用说明

1. 打开前端页面
2. 点击「选择WAV或MP3文件」按钮上传音频
3. 点击「上传并分析」按钮上传文件
4. 上传完成后点击「开始FFT分析」
5. 观察 3D 频谱柱状图实时变化
6. 分析完成后可下载 JSON 数据（后端或前端生成）

## 可视化控制

- **鼠标拖拽**: 旋转 3D 场景
- **滚轮**: 缩放视角
- **频谱柱颜色**: 从低频到高频为蓝绿到红紫渐变

## 许可证

MIT License
