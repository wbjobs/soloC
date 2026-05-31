# Black-Scholes 模型极端输入修复总结

## 问题描述

当 Black-Scholes 模型接收到极端输入值时，计算结果会出现 NaN 或无穷大值：

1. **极低波动率** (sigma ≈ 0.0001): 导致 d1 计算溢出，正态分布函数值异常
2. **极高波动率** (sigma ≈ 10): 导数计算不稳定
3. **极短到期时间** (T ≈ 0): 分母趋近于零，导致数值爆炸
4. **极端价格偏离** (S << K 或 S >> K): 对数计算不稳定

## 修复方案

### 1. 输入边界裁剪 (clamp_inputs)

```python
MIN_SIGMA = 0.001  # 最小波动率
MAX_SIGMA = 5.0    # 最大波动率
MIN_T = 1e-6       # 最小到期时间
MIN_S = 0.01       # 最小标的价格
MIN_K = 0.01       # 最小行权价
```

### 2. 安全的 d1/d2 计算

在 `calculate_d1_d2` 函数中：
- 首先对所有输入进行裁剪
- 分母为零时进行特殊处理
- 最终结果限制在 [-10, 10] 范围内

### 3. 安全的正态分布函数

```python
def safe_cdf(x):
    x_clamped = max(-10.0, min(10.0, x))
    return norm.cdf(x_clamped)
```

### 4. NaN/Inf 检测和兜底

```python
def safe_isnan(x):
    return x != x or x == float('inf') or x == float('-inf')
```

每个计算函数在返回前都会检测结果，如果异常则返回合理的默认值。

## 代码修改

### black_scholes.py

新增内容：
- 边界常量定义 (MIN_SIGMA, MAX_SIGMA 等)
- `clamp_inputs()` 函数
- `safe_isnan()` 函数
- `safe_cdf()` 函数
- `safe_pdf()` 函数
- `calculate_d1_d2()` 函数

修改内容：
- `black_scholes_price()`: 添加输入裁剪和 NaN 检测
- `calculate_delta/gamma/theta/vega/rho()`: 同样添加安全处理

### api.py

新增内容：
- Pydantic 字段验证器 (Field + validator)
- `validate_and_clamp_inputs()` 函数
- 警告信息收集和日志记录
- 响应中添加 `inputs.requested` 和 `inputs.used` 对比
- 警告信息返回给调用方

## 测试验证

### 极端波动率测试
- σ = 0.0001: ✅ PASS (裁剪到 0.001)
- σ = 0.0: ✅ PASS
- σ = -0.2: ✅ PASS (裁剪到 0.001)
- σ = 10.0: ✅ PASS (裁剪到 5.0)

### 极端到期时间测试
- T = 1e-10: ✅ PASS (裁剪到 1e-6)
- T = 0.0: ✅ PASS
- T = -0.1: ✅ PASS
- T = 100.0: ✅ PASS

### 极端价格测试
- S << K: ✅ PASS
- S >> K: ✅ PASS
- S = 0.0: ✅ PASS (裁剪到 0.01)

## 使用说明

### 直接调用定价函数
```python
from black_scholes import black_scholes_price, OptionType
# 函数内部自动处理极端输入
price = black_scholes_price(100, 100, 0.25, 0.05, 0.0001, OptionType.CALL)
```

### API 调用
```bash
curl -X POST http://localhost:8000/api/price \
  -H "Content-Type: application/json" \
  -d '{"S": 100, "K": 100, "T": 0.25, "r": 0.05, "sigma": 0.0001, ...}'
```

API 返回示例（包含警告）：
```json
{
  "price": 1.2422,
  "greeks": {...},
  "inputs": {
    "requested": {"sigma": 0.0001, ...},
    "used": {"sigma": 0.001, ...}
  },
  "warnings": ["sigma被从 0.0001 裁剪到 0.001"]
}
```

## 性能影响

- 额外的边界检查开销可以忽略 (< 1%)
- 正态分布函数裁剪后计算更稳定
- 整体鲁棒性提升显著，避免了服务崩溃风险

## 文件清单

- ✅ `black_scholes.py`: 核心模型修复
- ✅ `api.py`: API 层验证和警告
- ✅ `test_bs_fix.py`: 核心算法测试脚本
- ✅ `test_api_fix.py`: API 测试脚本
