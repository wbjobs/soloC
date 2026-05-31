# Modbus TCP 监控系统

一个全栈应用，包含 FastAPI 后端模拟 Modbus TCP 服务器和 Vue3 + ECharts 前端监控界面。

## 功能特性

- 🔧 **Modbus TCP 模拟**: 模拟 3 个设备，每个设备包含 10 个保持寄存器
- 🌡️ **实时监控**: 温度、压力、转速实时数据展示
- 🎚️ **阈值设置**: 滑块控件反向写入寄存器设置报警阈值
- 📊 **ECharts 图表**: 实时趋势图可视化
- 📱 **多设备支持**: Device ID 1-3 切换
- 💾 **数据持久化**: SQLite 存储历史数据
- 📜 **历史查询**: 按设备和寄存器查询历史记录

## 寄存器映射

| 地址 | 名称       | 说明           |
|------|------------|----------------|
| 0    | 温度       | 实时温度 (°C)  |
| 1    | 压力       | 实时压力 (kPa) |
| 2    | 转速       | 实时转速 (RPM) |
| 3    | 温度阈值   | 报警温度阈值   |
| 4    | 压力阈值   | 报警压力阈值   |
| 5    | 转速阈值   | 报警转速阈值   |
| 6    | 状态       | 设备状态       |
| 7    | 报警       | 报警标志       |
| 8    | 预留1      | 预留           |
| 9    | 预留2      | 预留           |

## 快速开始

### 后端启动

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端服务将在 http://localhost:8000 启动

API 文档: http://localhost:8000/docs

### 前端启动

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 http://localhost:3000 启动

## API 接口

- `GET /api/devices` - 获取设备列表
- `GET /api/devices/{device_id}/registers` - 读取所有寄存器
- `GET /api/devices/{device_id}/registers/{address}` - 读取单个寄存器
- `POST /api/devices/{device_id}/registers/{address}` - 写入寄存器
- `GET /api/history` - 查询历史数据
- `GET /api/register-names` - 获取寄存器名称

## 项目结构

```
.
├── backend/
│   ├── main.py          # FastAPI 主程序
│   ├── modbus_server.py # Modbus 模拟器
│   ├── database.py      # 数据库配置
│   └── requirements.txt # Python 依赖
└── frontend/
    ├── src/
    │   ├── App.vue      # 主组件
    │   ├── main.js      # 入口文件
    │   └── style.css    # 样式文件
    ├── index.html
    ├── vite.config.js
    └── package.json
```
