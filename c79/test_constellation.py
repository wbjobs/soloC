#!/usr/bin/env python
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from constellation import ConstellationAnalyzer, create_sample_constellation

print("=" * 60)
print("卫星星座分析功能测试")
print("=" * 60)
print()

# 测试星座创建
print("1. 测试星座创建...")
analyzer = create_sample_constellation()
print(f"   ✓ 已创建示例星座，包含 {len(analyzer.satellites)} 颗卫星")
print()

# 测试轨道传播
print("2. 测试轨道传播...")
analyzer.propagate_constellation(hours=2, step_minutes=30)
print(f"   ✓ 轨道传播完成，共 {len(analyzer.propagation_results)} 个卫星结果")
print()

# 测试星间链路计算
print("3. 测试星间链路计算...")
links = analyzer.calculate_inter_satellite_links(time_index=0)
print(f"   ✓ 当前星间链路数: {len(links)}")
for link in links:
    print(f"     - {link['sat1_name']} ↔ {link['sat2_name']}: {link['distance']:.1f} km")
print()

# 测试链路时间序列
print("4. 测试链路时间序列计算...")
all_links = analyzer.get_all_links_over_time(step_interval=2)
print(f"   ✓ 共计算 {len(all_links)} 个时间点的链路数")
print()

# 测试重访时间计算
print("5. 测试重访时间计算...")
result = analyzer.calculate_revisit_time(39.9042, 116.4074)
print(f"   ✓ 共 {result['total_visibility_count']} 个可见事件")
if result['revisit_times']:
    print(f"     平均重访时间: {result['mean_revisit']:.1f} 分钟")
    print(f"     最小重访时间: {result['min_revisit']:.1f} 分钟")
    print(f"     最大重访时间: {result['max_revisit']:.1f} 分钟")
print()

# 测试单卫星大气阻力修正（可选）
print("6. 测试大气阻力修正...")
from atmosphere import NRLMSISE00
atm = NRLMSISE00()
from datetime import datetime
rho = atm.get_density(datetime.utcnow(), 400, 0, 0)
print(f"   ✓ 400km高度大气密度: {rho:.2e} kg/m³")
print()

print("=" * 60)
print("所有测试通过！")
print("=" * 60)
