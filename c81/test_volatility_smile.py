#!/usr/bin/env python
"""测试波动率微笑校准功能"""

import sys
from black_scholes import black_scholes_price, OptionType
from volatility_smile import (
    implied_volatility_newton_raphson,
    VolatilitySmileCalibrator,
    MarketOptionData,
    volatility_storage
)

def test_implied_volatility():
    print("=" * 60)
    print("测试隐含波动率计算 (Newton-Raphson)")
    print("=" * 60)
    
    S, K, T, r, sigma_true = 100.0, 100.0, 0.25, 0.05, 0.2
    
    price = black_scholes_price(S, K, T, r, sigma_true, OptionType.CALL)
    print(f"真实波动率: {sigma_true:.4f}, 理论价格: {price:.4f}")
    
    iv, error = implied_volatility_newton_raphson(
        market_price=price,
        S=S, K=K, T=T, r=r,
        option_type=OptionType.CALL,
        initial_guess=0.15
    )
    
    print(f"计算隐含波动率: {iv:.6f}, 误差: {error:.8f}")
    print(f"精度验证: {'通过' if abs(iv - sigma_true) < 0.001 else '失败'}")
    
    print("\n测试不同虚值程度的期权:")
    for K_test in [80, 90, 95, 100, 105, 110, 120]:
        price = black_scholes_price(S, K_test, T, r, sigma_true, OptionType.CALL)
        iv, error = implied_volatility_newton_raphson(
            price, S, K_test, T, r, OptionType.CALL
        )
        moneyness = "OTM" if K_test > S else ("ITM" if K_test < S else "ATM")
        print(f"  K={K_test} ({moneyness}): IV={iv:.6f}, 误差={error:.8f}")

def test_volatility_smile_calibration():
    print("\n" + "=" * 60)
    print("测试波动率曲面校准")
    print("=" * 60)
    
    calibrator = VolatilitySmileCalibrator(underlying_symbol="TEST", risk_free_rate=0.05)
    
    S = 100.0
    strikes = [85, 90, 95, 100, 105, 110, 115]
    maturities = [0.25, 0.5, 1.0]
    
    vol_smile_params = {
        0.25: [0.28, 0.24, 0.21, 0.20, 0.21, 0.24, 0.28],
        0.5: [0.27, 0.23, 0.205, 0.20, 0.205, 0.23, 0.27],
        1.0: [0.26, 0.225, 0.205, 0.20, 0.205, 0.225, 0.26]
    }
    
    print("添加模拟的市场期权数据（含波动率微笑特征）:")
    for T in maturities:
        for i, K in enumerate(strikes):
            sigma = vol_smile_params[T][i]
            price = black_scholes_price(S, K, T, 0.05, sigma, OptionType.CALL)
            market_data = MarketOptionData(
                strike=K,
                maturity=T,
                market_price=price,
                option_type=OptionType.CALL,
                underlying_price=S,
                risk_free_rate=0.05
            )
            calibrator.add_market_data(market_data)
            print(f"  T={T:.2f}, K={K}, sigma={sigma:.4f}, price={price:.4f}")
    
    print("\n校准波动率曲面...")
    surface = calibrator.calibrate_volatility_surface(
        underlying_price=S,
        surface_id="TEST_SURFACE"
    )
    
    print(f"\n校准结果:")
    print(f"  曲面ID: {surface.surface_id}")
    print(f"  行权价数量: {len(surface.strikes)}")
    print(f"  到期时间数量: {len(surface.maturities)}")
    print(f"  校准点数: {len(surface.calibration_points)}")
    
    print("\n波动率矩阵:")
    for i, T in enumerate(surface.maturities):
        vols = [f"{v:.4f}" for v in surface.volatilities[i]]
        print(f"  T={T:.2f}: {vols}")
    
    return surface

def test_volatility_interpolation(surface):
    print("\n" + "=" * 60)
    print("测试波动率插值")
    print("=" * 60)
    
    calibrator = VolatilitySmileCalibrator("TEST", 0.05)
    
    test_points = [
        (97.5, 0.25, "行权价插值"),
        (100, 0.375, "到期时间插值"),
        (97.5, 0.375, "二维插值"),
        (80, 0.25, "边界外推（低）"),
        (130, 0.25, "边界外推（高）"),
    ]
    
    for K, T, desc in test_points:
        vol = calibrator.get_volatility_for_pricing(K, T, surface)
        print(f"  {desc}: K={K}, T={T} → σ={vol:.6f}")

def test_surface_storage():
    print("\n" + "=" * 60)
    print("测试波动率曲面存储")
    print("=" * 60)
    
    surfaces = volatility_storage.list_surfaces()
    print(f"已存储曲面数量: {len(surfaces)}")
    
    for s in surfaces:
        print(f"  - {s['surface_id']} ({s['underlying_symbol']})")
    
    if surfaces:
        latest = volatility_storage.get_latest_surface("TEST")
        if latest:
            print(f"\n获取最新曲面成功: {latest.surface_id}")

def main():
    print("波动率微笑校准功能测试")
    print("=" * 60)
    
    try:
        test_implied_volatility()
        surface = test_volatility_smile_calibration()
        test_volatility_interpolation(surface)
        test_surface_storage()
        
        print("\n" + "=" * 60)
        print("所有测试通过！")
        print("=" * 60)
        
    except Exception as e:
        print(f"测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
