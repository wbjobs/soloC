# MIDI 音乐伴奏生成器

一个全栈 Web 应用，用户可以通过 MIDI 键盘输入一段主旋律（4-8 小节），系统自动生成对应的和弦伴奏（钢琴、贝斯、鼓三轨）。

## 技术栈

### 前端
- React 18
- TypeScript
- Web MIDI API
- Tailwind CSS
- Web Audio API (波形可视化)

### 后端
- Python 3.8+
- FastAPI
- music21 (乐理分析)
- SQLAlchemy (ORM)
- PostgreSQL

## 功能特性

- ✅ 实时 MIDI 键盘输入
- ✅ 虚拟钢琴键盘
- ✅ 录音波形可视化
- ✅ 三种伴奏风格：流行、爵士、古典
- ✅ 自动生成钢琴、贝斯、鼓三轨伴奏
- ✅ MIDI 文件导出下载
- ✅ 历史作品管理

## 快速开始

### 环境要求

- Node.js 16+
- Python 3.8+
- PostgreSQL

### 后端启动

1. 进入后端目录
```bash
cd backend
```

2. 创建虚拟环境并安装依赖
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
pip install -r requirements.txt
```

3. 配置数据库
编辑 `.env` 文件，配置 PostgreSQL 连接：
```
DATABASE_URL=postgresql://user:password@localhost:5432/midi_music
```

4. 启动后端服务
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API 文档: http://localhost:8000/docs

### 前端启动

1. 进入前端目录
```bash
cd frontend
```

2. 安装依赖
```bash
npm install
```

3. 启动开发服务器
```bash
npm start
```

前端地址: http://localhost:3000

## 使用说明

1. **连接 MIDI 键盘**：
   - 将 MIDI 键盘通过 USB 连接到电脑
   - 使用 Chrome 浏览器打开应用
   - 浏览器会请求 MIDI 访问权限，点击允许

2. **无 MIDI 键盘**：
   - 直接使用界面上的虚拟钢琴键盘点击输入

3. **录制旋律**：
   - 点击"开始录音"按钮
   - 使用 MIDI 键盘或虚拟钢琴输入 4-8 小节的旋律
   - 点击"停止录音"结束录制

4. **选择风格**：
   - 在"伴奏风格"中选择：流行、爵士或古典

5. **生成伴奏**：
   - 输入作品名称（可选）
   - 点击"生成伴奏"按钮
   - 等待后端处理完成

6. **下载 MIDI**：
   - 在"历史作品"列表中找到你的作品
   - 点击"下载旋律"获取主旋律 MIDI
   - 点击"下载伴奏"获取完整伴奏 MIDI

## 项目结构

```
.
├── frontend/                 # React 前端
│   ├── src/
│   │   ├── components/      # React 组件
│   │   │   ├── WaveformVisualizer.tsx  # 波形可视化
│   │   │   ├── MidiInput.tsx           # MIDI 输入
│   │   │   ├── StyleSelector.tsx       # 风格选择
│   │   │   └── CompositionList.tsx     # 作品列表
│   │   ├── services/        # API 服务
│   │   ├── types.ts         # TypeScript 类型
│   │   ├── App.tsx          # 主应用
│   │   └── index.tsx        # 入口文件
│   ├── package.json
│   └── tailwind.config.js
├── backend/                  # FastAPI 后端
│   ├── main.py             # API 主文件
│   ├── music_generator.py  # 音乐生成逻辑
│   ├── database.py         # 数据库配置
│   ├── models.py           # 数据模型
│   └── requirements.txt    # Python 依赖
└── README.md
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/generate | 生成伴奏 |
| GET | /api/compositions | 获取作品列表 |
| GET | /api/compositions/{id}/download | 下载 MIDI |
| DELETE | /api/compositions/{id} | 删除作品 |

## 注意事项

1. **浏览器兼容性**：
   - Web MIDI API 目前仅在 Chrome、Edge、Opera 浏览器中支持
   - Safari 和 Firefox 不支持 Web MIDI API，只能使用虚拟钢琴

2. **数据库配置**：
   - 确保 PostgreSQL 服务已启动
   - 确保数据库用户有创建表的权限

3. **MIDI 文件**：
   - 生成的 MIDI 文件可以在任何音乐制作软件中打开
   - 推荐使用 Ableton Live、FL Studio、Logic Pro 等打开编辑

## 开发说明

### 音乐生成逻辑

- 使用 music21 库进行乐理分析
- 根据输入旋律自动识别调式
- 按照不同风格使用对应的和弦进行
- 自动生成钢琴、贝斯、鼓三轨伴奏

### 伴奏风格特点

- **流行**：I-V-vi-IV 和弦进行，简单节奏型
- **爵士**：ii-V-I 七和弦进行，切分节奏
- **古典**：I-IV-V 传统和声，规整节奏

## 许可证

MIT License
