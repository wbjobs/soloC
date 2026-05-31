#!/usr/bin/env python
"""测试Black-Scholes模型极端输入修复"""

import sys
from black_scholes import (
    black_scholes_price, calculate_greeks, OptionType,
    MIN_SIGMA, MAX_SIGMA, safe_isnan, clamp_inputs
)

def test_extreme_volatility():
    print("=" * 60)
    print("测试极端波动率输入")
    print("=" * 60)
    
    test_cases = [
        ("极低波动率", 0.0001),
        ("零波动率", 0.0),
        ("负波动率", -0.2),
        ("极高波动率", 10.0),
        ("正常波动率", 0.2),
    ]
    
    S, K, T, r = 100.0, 100.0, 0.25, 0.05
    
    for name, sigma in test_cases:
        print(f"\n{name}: sigma = {sigma}")
        print("-" * 40)
        
        price = black_scholes_price(S, K, T, r, sigma, OptionType.CALL)
        greeks = calculate_greeks(S, K, T, r, sigma, OptionType.CALL)
        
        has_nan = any(safe_isnan(x) for x in [price, greeks.delta, greeks.gamma, greeks.theta, greeks.vega, greeks.rho])
        
        print(f"  Price:  {price:.6f} {'(NaN/Inf)' if safe_isnan(price) else ''}")
        print(f"  Delta:  {greeks.delta:.6f} {'(NaN/Inf)' if safe_isnan(greeks.delta) else ''}")
        print(f"  Gamma:  {greeks.gamma:.6f} {'(NaN/Inf)' if safe_isnan(greeks.gamma) else ''}")
        print(f"  Theta:  {greeks.theta:.6f} {'(NaN/Inf)' if safe_isnan(greeks.theta) else ''}")
        print(f"  Vega:   {greeks.vega:.6f} {'(NaN/Inf)' if safe_isnan(greeks.vega) else ''}")
        print(f"  Rho:    {greeks.rho:.6f} {'(NaN/Inf)' if safe_isnan(greeks.rho) else ''}")
        print(f"  Status: {'FAIL' if has_nan else 'PASS'}")

def test_extreme_maturity():
    print("\n" + "=" * 60)
    print("测试极端到期时间输入")
    print("=" * 60)
    
    test_cases = [
        ("极短到期", 1e-10),
        ("零到期", 0.0),
        ("负到期", -0.1),
        ("极长到期", 100.0),
        ("正常到期", 0.25),
    ]
    
    S, K, sigma, r = 100.0, 100.0, 0.2, 0.05
    
    for name, T in test_cases:
        print(f"\n{name}: T = {T}")
        print("-" * 40)
        
        price = black_scholes_price(S, K, T, r, sigma, OptionType.CALL)
        greeks = calculate_greeks(S, K, T, r, sigma, OptionType.CALL)
        
        has_nan = any(safe_isnan(x) for x in [price, greeks.delta, greeks.gamma, greeks.theta, greeks.vega, greeks.rho])
        
        print(f"  Price:  {price:.6f} {'(NaN/Inf)' if safe_isnan(price) else ''}")
        print(f"  Delta:  {greeks.delta:.6f} {'(NaN/Inf)' if safe_isnan(greeks.delta) else ''}")
        print(f"  Gamma:  {greeks.gamma:.6f} {'(NaN/Inf)' if safe_isnan(greeks.gamma) else ''}")
        print(f"  Theta:  {greeks.theta:.6f} {'(NaN/Inf)' if safe_isnan(greeks.theta) else ''}")
        print(f"  Vega:   {greeks.vega:.6f} {'(NaN/Inf)' if safe_isnan(greeks.vega) else ''}")
        print(f"  Rho:    {greeks.rho:.6f} {'(NaN/Inf)' if safe_isnan(greeks.rho) else ''}")
        print(f"  Status: {'FAIL' if has_nan else 'PASS'}")

def test_extreme_prices():
    print("\n" + "=" * 60)
    print("测试极端价格输入")
    print("=" * 60)
    
    test_cases = [
        ("S << K", 1.0, 100.0),
        ("S >> K", 1000.0, 100.0),
        ("S ≈ K", 100.0, 100.0),
        ("零S", 0.0, 100.0),
        ("负S", -10.0, 100.0),
    ]
    
    T, sigma, r = 0.25, 0.2, 0.05
    
    for name, S, K in test_cases:
        print(f"\n{name}: S = {S}, K = {K}")
        print("-" * 40)
        
        price = black_scholes_price(S, K, T, r, sigma, OptionType.CALL)
        greeks = calculate_greeks(S, K, T, r, sigma, OptionType.CALL)
        
        has_nan = any(safe_isnan(x) for x in [price, greeks.delta, greeks.gamma, greeks.theta, greeks.vega, greeks.rho])
        
        print(f"  Price:  {price:.6f} {'(NaN/Inf)' if safe_isnan(price) else ''}")
        print(f"  Delta:  {greeks.delta:.6f} {'(NaN/Inf)' if safe_isnan(greeks.delta) else ''}")
        print(f"  Gamma:  {greeks.gamma:.6e} {'(NaN/Inf)' if safe_isnan(greeks.gamma) else ''}")
        print(f"  Status: {'FAIL' if has_nan else 'PASS'}")

def test_clamp_function():
    print("\n" + "=" * 60)
    print("测试输入裁剪函数")
    print("=" * 60)
    
    test_inputs = [
        (100, 100, 0.25, 0.05, 0.0001),
        (100, 100, 0.25, 0.05, 10.0),
        (100, 100, 1e-10, 0.05, 0.2),
        (0, 100, 0.25, 0.05, 0.2),
        (100, 0, 0.25, 0.05, 0.2),
    ]
    
    for S, K, T, r, sigma in test_inputs:
        clamped = clamp_inputs(S, K, T, r, sigma)
        print(f"\n输入: S={S}, K={K}, T={T}, r={r}, sigma={sigma}")
        print(f"裁剪: S={clamped[0]}, K={clamped[1]}, T={clamped[2]}, r={clamped[3]}, sigma={clamped[4]}")
        print(f"波动率范围: [{MIN_SIGMA}, {MAX_SIGMA}]")

def main():
    print("Black-Scholes 模型极端输入修复验证测试")
    print("=" * 60)
    
    test_extreme_volatility()
    test_extreme_maturity()
    test_extreme_prices()
    test_clamp_function()
    
    print("\n" + "=" * 60)
    print("所有测试完成!")
    print("=" * 60)

if __name__ == "__main__":
    main()
