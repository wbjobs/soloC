# 多源气象数据融合分析平台

一个集数据采集、后端服务、前端可视化于一体的气象数据分析平台。

## 项目结构

```
weather-platform/
├── backend/                 # Django后端服务
│   ├── weather_api/        # Django项目配置
│   ├── weather/            # 气象数据应用
│   ├── data_analysis.py    # 数据分析融合模块
│   └── requirements.txt    # Python依赖
├── data-collector/         # 数据采集模块
│   ├── collectors/         # 多源数据采集器
│   ├── analyzer/           # 数据分析模块
│   ├── database/           # 数据库存储模块
│   ├── scheduler.py        # 定时任务调度器
│   └── requirements.txt    # Python依赖
├── frontend/               # Vue前端可视化
│   ├── src/
│   │   ├── views/         # 页面组件
│   │   ├── router/        # 路由配置
│   │   ├── api/           # API接口
│   │   └── main.js        # 入口文件
│   └── package.json       # Node.js依赖
└── README.md               # 项目说明
```

## 功能模块

### 1. 数据采集模块
- **公开气象API数据采集**：OpenWeather API数据采集
- **本地气象传感器采集**：模拟传感器数据生成
- **历史气象数据库采集**：历史数据批量采集
- **数据清洗与格式统一**：异常值检测、质量评分

### 2. 后端服务
- **数据查询API**：按位置、时间、数据源查询
- **数据融合接口**：多源数据加权融合
- **数据源对比分析**：不同数据源统计对比
- **趋势预测接口**：基于线性回归的气象预测
- **极端天气告警**：自动检测并告警
- **统计分析接口**：多维度数据统计

### 3. 前端可视化
- **数据总览看板**：实时气象指标展示、告警信息
- **气象数据地图展示**：地理位置数据可视化
- **时间序列曲线**：多指标历史趋势分析
- **数据源对比分析**：多源数据质量对比
- **历史数据趋势预测**：未来7-14天气象预测
- **极端天气告警模拟**：告警列表、规则配置

## 快速开始

### 前置要求
- Python 3.8+
- Node.js 16+
- PostgreSQL 12+

### 1. 后端服务启动

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 复制环境配置
cp .env.example .env
# 编辑 .env 文件配置数据库连接

# 数据库迁移
python manage.py makemigrations
python manage.py migrate

# 创建管理员
python manage.py createsuperuser

# 启动服务
python manage.py runserver 0.0.0.0:8000
```

API文档访问：http://localhost:8000/api/records/

### 2. 数据采集模块启动

```bash
cd data-collector

# 安装依赖
pip install -r requirements.txt

# 复制环境配置
cp .env.example .env
# 编辑 .env 文件配置

# 启动定时采集任务
python scheduler.py

# 或单独采集历史数据
python scheduler.py historical 30
```

### 3. 前端服务启动

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务
npm run dev

# 构建生产版本
npm run build
```

前端访问：http://localhost:5173

## 核心API接口

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/records/latest/ | GET | 最新数据 |
| /api/records/by_location/ | GET | 按位置查询 |
| /api/records/compare_sources/ | GET | 数据源对比 |
| /api/records/fused_data/ | GET | 融合数据 |
| /api/records/predict/ | GET | 趋势预测 |
| /api/records/alerts/ | GET | 告警信息 |
| /api/records/statistics/ | GET | 统计信息 |
| /api/records/locations/ | GET | 位置列表 |
| /api/records/data_sources/ | GET | 数据源列表 |
| /api/records/time_series/ | GET | 时间序列数据 |

## 技术栈

### 后端
- Django 4.2
- Django REST Framework
- PostgreSQL + TimescaleDB
- SQLAlchemy
- Pandas + NumPy
- Scikit-learn

### 数据采集
- APScheduler
- Requests
- Pydantic

### 前端
- Vue 3
- Vue Router 4
- Element Plus
- ECharts 5
- Axios
- Vite

## 数据分析功能

### 数据融合算法
- 加权平均融合
- 数据源权重配置：公开API(40%)、本地传感器(35%)、历史数据库(25%)
- 质量评分动态调整

### 趋势预测模型
- 线性回归模型
- 支持温度、湿度、气压、风速预测
- 预测天数可配置（3-14天）
- 置信度评估

### 极端天气检测
- 高温/低温告警
- 强风告警
- 暴雨告警
- 告警级别分级（危险/警告/提示）

## 注意事项

1. 首次运行请确保PostgreSQL服务已启动
2. 配置正确的数据库连接信息
3. OpenWeather API Key需要自行申请
4. 前端代理配置在 vite.config.js 中
5. 生产环境请关闭DEBUG模式

## 开发说明

- 后端代码遵循Django最佳实践
- 前端采用Composition API开发
- 数据采集支持扩展新的数据源
- 告警规则可灵活配置阈值

## License

MIT
