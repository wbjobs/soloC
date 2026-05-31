# 工业设备振动信号边缘分析系统

## 系统架构

### 1. 前端 (Frontend)
- **技术栈**: React + TypeScript + Vite + Recharts
- **功能**: 
  - 设备看板展示
  - 实时振动曲线绘制
  - 设备健康度热力图
  - 历史数据回放
  - 异常事件告警

### 2. 后端 (Backend)
- **技术栈**: Node.js + Express + SQLite + WebSocket
- **功能**:
  - RESTful API 服务
  - SQLite 时序数据存储
  - 设备注册管理
  - 数据上报接口
  - 健康度计算
  - CSV 数据导出

### 3. 边缘计算模块 (Edge)
- **技术栈**: Python + NumPy + SciPy + WebSocket
- **功能**:
  - FFT 频谱分析
  - 峰值提取
  - RMS 值计算
  - 模拟设备数据生成
  - WebSocket 实时推送

## 快速开始

### 1. 启动后端服务

```bash
cd backend
npm install
npm start
```
后端服务将在 `http://localhost:3001` 启动
WebSocket 服务在 `ws://localhost:8080`

### 2. 启动边缘计算模块

```bash
cd edge
pip install -r requirements.txt
python vibration_processor.py
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```
前端将在 `http://localhost:3000` 启动

## API 接口说明

### 设备管理
- `POST /api/devices` - 注册/更新设备
- `GET /api/devices` - 获取所有设备列表
- `GET /api/devices/:id` - 获取单个设备信息

### 振动数据
- `POST /api/data/:deviceId` - 上报振动数据
- `GET /api/data/:deviceId` - 获取设备振动数据（支持时间范围筛选）

### 健康度与异常
- `GET /api/health` - 获取设备健康状态
- `GET /api/anomalies` - 获取异常事件列表

### 数据导出
- `GET /api/export/:deviceId` - 导出 CSV 格式数据

## 功能特性

### ✅ 设备异常振动阈值告警
- 实时监控振动峰值和 RMS 值
- 超过阈值自动触发告警
- 前端实时弹窗提醒
- 异常事件自动记录

### ✅ 历史数据筛选导出 CSV
- 按设备筛选
- 按时间范围筛选
- 一键导出 CSV 格式
- 支持离线分析

### ✅ 异常事件自动标记
- 异常数据自动标记
- 健康度评分动态调整
- 严重程度分级（警告/严重）
- 事件历史可追溯

## 数据库结构

### devices 表
- id: 设备 ID
- name: 设备名称
- location: 位置
- status: 状态 (normal/warning/critical)
- health_score: 健康度评分
- threshold_peak: 峰值阈值
- threshold_rms: RMS 阈值

### vibration_data 表
- 原始振动数据
- FFT 频谱数据
- 峰值和 RMS 值
- 异常标记
- 时间戳

### anomaly_events 表
- 异常事件记录
- 严重程度
- 事件描述
- 关联振动数据

## 注意事项

1. 系统包含模拟数据生成器，便于演示和测试
2. 实际部署时需替换模拟数据为真实设备接入
3. SQLite 适合小型部署，生产环境建议使用 PostgreSQL 或 InfluxDB
4. WebSocket 连接断开时会自动尝试重连
