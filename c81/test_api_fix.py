#!/usr/bin/env python
"""测试API极端输入修复"""

import requests
import json

BASE_URL = "http://localhost:8000"

def test_api_with_extreme_inputs():
    print("=" * 60)
    print("测试API极端输入处理")
    print("=" * 60)
    
    test_cases = [
        {
            "name": "极低波动率",
            "data": {
                "S": 100.0, "K": 100.0, "T": 0.25, "r": 0.05,
                "sigma": 0.0001, "option_type": "call", "contract_symbol": "TEST-LOW-VOL"
            }
        },
        {
            "name": "极高波动率",
            "data": {
                "S": 100.0, "K": 100.0, "T": 0.25, "r": 0.05,
                "sigma": 10.0, "option_type": "call", "contract_symbol": "TEST-HIGH-VOL"
            }
        },
        {
            "name": "极短到期时间",
            "data": {
                "S": 100.0, "K": 100.0, "T": 1e-10, "r": 0.05,
                "sigma": 0.2, "option_type": "call", "contract_symbol": "TEST-SHORT-T"
            }
        },
        {
            "name": "负波动率",
            "data": {
                "S": 100.0, "K": 100.0, "T": 0.25, "r": 0.05,
                "sigma": -0.5, "option_type": "call", "contract_symbol": "TEST-NEG-VOL"
            }
        },
        {
            "name": "正常输入",
            "data": {
                "S": 100.0, "K": 100.0, "T": 0.25, "r": 0.05,
                "sigma": 0.2, "option_type": "call", "contract_symbol": "TEST-NORMAL"
            }
        }
    ]
    
    for test in test_cases:
        print(f"\n{test['name']}")
        print("-" * 40)
        
        try:
            response = requests.post(f"{BASE_URL}/api/price", json=test['data'])
            response.raise_for_status()
            result = response.json()
            
            has_nan = False
            for key in ['price', 'delta', 'gamma', 'theta', 'vega', 'rho']:
                if key == 'price':
                    val = result.get(key, float('nan'))
                else:
                    val = result.get('greeks', {}).get(key, float('nan'))
                
                if val != val or val == float('inf') or val == float('-inf'):
                    has_nan = True
                    break
            
            print(f"  Price:  {result.get('price', 'N/A')}")
            print(f"  Delta:  {result.get('greeks', {}).get('delta', 'N/A')}")
            if 'warnings' in result:
                print(f"  Warnings: {result['warnings']}")
            print(f"  Status: {'FAIL' if has_nan else 'PASS'}")
            
        except Exception as e:
            print(f"  Error: {e}")
            print(f"  Status: FAIL")

def test_root_endpoint():
    print("\n" + "=" * 60)
    print("测试根端点")
    print("=" * 60)
    
    try:
        response = requests.get(f"{BASE_URL}/")
        result = response.json()
        print(f"API版本: {result.get('version')}")
        print(f"输入边界: {json.dumps(result.get('input_bounds', {}), indent=2)}")
    except Exception as e:
        print(f"Error: {e}")

def main():
    print("API极端输入修复验证测试")
    print("=" * 60)
    print("\n注意: 请确保API服务正在运行 (python main.py)")
    print()
    
    test_root_endpoint()
    test_api_with_extreme_inputs()
    
    print("\n" + "=" * 60)
    print("API测试完成!")
    print("=" * 60)

if __name__ == "__main__":
    main()
