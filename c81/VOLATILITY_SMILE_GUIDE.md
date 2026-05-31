# 波动率微笑校准功能使用指南

## 概述

本系统实现了完整的波动率微笑校准功能，支持：
- 单期权隐含波动率计算（Newton-Raphson 方法）
- 基于市场期权价格的波动率曲面校准
- 波动率插值与外推
- 曲面持久化存储
- 使用校准后的曲面进行期权定价

## 核心概念

### 波动率微笑 (Volatility Smile)
在 Black-Scholes 模型中，假设波动率是常数。但实际市场中，不同行权价和到期日的期权隐含波动率不同，通常呈现"微笑"形状（ATM 最低，ITM/OTM 较高）。

### 波动率曲面 (Volatility Surface)
波动率曲面是波动率关于行权价和到期时间的二维函数，是期权定价的关键输入。

## API 接口说明

### 1. 隐含波动率计算

**端点**: `POST /api/implied-volatility`

根据市场期权价格反推隐含波动率。

**请求示例**:
```json
{
    "S": 100.0,
    "K": 100.0,
    "T": 0.25,
    "r": 0.05,
    "market_price": 4.615,
    "option_type": "call",
    "initial_guess": 0.2
}
```

**响应示例**:
```json
{
    "implied_volatility": 0.2,
    "pricing_error": 1.2e-10,
    "inputs": {...}
}
```

### 2. 波动率曲面校准

**端点**: `POST /api/volatility-surface/calibrate`

根据多个期权的市场价格校准波动率曲面。

**请求示例**:
```json
{
    "underlying_symbol": "AAPL",
    "underlying_price": 150.0,
    "risk_free_rate": 0.05,
    "market_options": [
        {"strike": 140, "maturity": 0.25, "market_price": 15.5, "option_type": "call"},
        {"strike": 145, "maturity": 0.25, "market_price": 10.8, "option_type": "call"},
        {"strike": 150, "maturity": 0.25, "market_price": 6.9, "option_type": "call"},
        {"strike": 155, "maturity": 0.25, "market_price": 4.1, "option_type": "call"},
        {"strike": 160, "maturity": 0.25, "market_price": 2.2, "option_type": "call"},
        {"strike": 150, "maturity": 0.5, "market_price": 10.5, "option_type": "call"},
        {"strike": 150, "maturity": 1.0, "market_price": 15.8, "option_type": "call"}
    ],
    "surface_id": "AAPL_VOL_SURFACE_2024",
    "interpolation_method": "cubic"
}
```

**响应示例**:
```json
{
    "surface_id": "AAPL_VOL_SURFACE_2024",
    "underlying_symbol": "AAPL",
    "calibration_date": "2024-01-15T10:30:00",
    "strikes": [140, 145, 150, 155, 160],
    "maturities": [0.25, 0.5, 1.0],
    "volatility_matrix": [
        [0.28, 0.24, 0.21, 0.20, 0.21],
        [0.27, 0.235, 0.205, 0.20, 0.205],
        [0.26, 0.23, 0.21, 0.20, 0.21]
    ],
    "calibration_points": [...],
    "num_points": 7
}
```

### 3. 获取波动率曲面列表

**端点**: `GET /api/volatility-surface?underlying_symbol=AAPL`

### 4. 获取特定波动率曲面

**端点**: `GET /api/volatility-surface/{surface_id}`

### 5. 获取标的最新波动率曲面

**端点**: `GET /api/volatility-surface/latest/{underlying_symbol}`

### 6. 波动率插值查询

**端点**: `GET /api/volatility-surface/{surface_id}/interpolate?K=152&T=0.3`

**响应示例**:
```json
{
    "surface_id": "AAPL_VOL_SURFACE_2024",
    "requested_strike": 152,
    "requested_maturity": 0.3,
    "interpolated_volatility": 0.2035,
    "surface_strike_range": [140, 160],
    "surface_maturity_range": [0.25, 1.0]
}
```

### 7. 使用波动率微笑定价

**端点**: `POST /api/price-with-smile`

使用校准后的波动率曲面进行期权定价。

**请求示例**:
```json
{
    "S": 150.0,
    "K": 152.0,
    "T": 0.3,
    "r": 0.05,
    "option_type": "call",
    "contract_symbol": "AAPL-C-152-0.3Y",
    "surface_id": "AAPL_VOL_SURFACE_2024"
}
```

或使用最新曲面:
```json
{
    "S": 150.0,
    "K": 152.0,
    "T": 0.3,
    "r": 0.05,
    "option_type": "call",
    "contract_symbol": "AAPL-C-152-0.3Y",
    "underlying_symbol": "AAPL"
}
```

### 8. 删除波动率曲面

**端点**: `DELETE /api/volatility-surface/{surface_id}`

## 算法说明

### 隐含波动率计算 - Newton-Raphson 方法

```python
sigma_{n+1} = sigma_n - (BS_price(sigma_n) - market_price) / vega(sigma_n)
```

特点:
- 收敛速度快（二次收敛）
- 通常 5-10 次迭代即可达到精度
- 使用 Vega 作为导数

### 波动率插值方法

1. **行权价维度**: 线性或三次样条插值
2. **到期时间维度**: 线性插值
3. **边界处理**: 超出范围时使用边界值

### 波动率曲面构建流程

1. 对每个市场期权计算隐含波动率
2. 按到期时间分组
3. 每组内进行行权价插值形成波动率曲线
4. 组合所有曲线形成波动率曲面

## 数据结构

### MarketOptionData (市场期权数据)
```python
{
    "strike": float,           # 行权价格
    "maturity": float,         # 到期时间（年）
    "market_price": float,     # 市场价格
    "option_type": str,        # "call" / "put"
    "underlying_price": float, # 标的价格
    "risk_free_rate": float    # 无风险利率
}
```

### VolatilitySurface (波动率曲面)
```python
{
    "surface_id": str,                      # 曲面ID
    "underlying_symbol": str,               # 标的代码
    "calibration_date": datetime,           # 校准日期
    "risk_free_rate": float,                # 无风险利率
    "underlying_price": float,              # 标的价格
    "strikes": List[float],                 # 行权价网格
    "maturities": List[float],              # 到期时间网格
    "volatilities": List[List[float]],      # 波动率矩阵 [maturity][strike]
    "calibration_points": List[CalibrationPoint],
    "interpolation_method": str
}
```

## 典型使用流程

### 场景 1: 日常校准与定价

```
1. 收市后获取所有期权的收盘价格
   ↓
2. 调用 /api/volatility-surface/calibrate 校准曲面
   ↓
3. 曲面自动保存到 volatility_storage
   ↓
4. 日常定价调用 /api/price-with-smile
   ↓
5. 系统自动从曲面插值获取对应波动率
```

### 场景 2: 研究分析

```
1. 获取历史期权价格数据
   ↓
2. 每日生成历史波动率曲面
   ↓
3. 分析波动率曲面的动态变化
   ↓
4. 支持 VaR 计算、压力测试等风险管理功能
```

## 注意事项

### 1. 数据质量要求
- 至少需要 3 个不同行权价的期权数据
- 建议包含不同到期时间的数据
- 价格数据应准确（避免买卖价差影响）

### 2. 插值范围
- 尽量在校准范围内使用插值
- 超出范围时结果为边界值
- 极端外推可能不准确

### 3. 重新校准频率
- 建议每日收市后重新校准
- 重大市场波动后应立即校准
- 到期时间变化需要更新曲面

## 测试验证

运行核心功能测试:
```bash
python test_volatility_smile.py
```

运行 API 测试（需要服务启动）:
```bash
python test_api_volatility_smile.py
```

## 性能指标

- 单隐含波动率计算: < 1ms
- 20个点的曲面校准: < 50ms
- 波动率插值查询: < 0.1ms
- 内存占用: 每个曲面约 1KB
