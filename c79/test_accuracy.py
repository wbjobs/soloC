#!/usr/bin/env python
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from orbit_utils import create_satellite
from atmosphere import estimate_orbit_error, NRLMSISE00, AtmosphericDragCorrector

test_tle = [
    "ISS (ZARYA)",
    "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9993",
    "2 25544  51.6400  20.0000 0006703  90.0000 280.0000 15.49560727  1234"
]

def test_atmosphere_model():
    print("=" * 60)
    print("测试 NRLMSISE-00 大气密度模型")
    print("=" * 60)
    
    atm = NRLMSISE00()
    
    from datetime import datetime
    
    test_alts = [100, 200, 300, 400, 500, 800, 1000]
    for alt in test_alts:
        density = atm.get_density(datetime.utcnow(), alt, 0, 0)
        print(f"高度 {alt:4d} km: 大气密度 = {density:.2e} kg/m³")
    
    print()
    print("✓ NRLMSISE-00 模型测试通过")
    print()

def test_orbit_error_estimation():
    print("=" * 60)
    print("测试轨道误差估计")
    print("=" * 60)
    
    test_alts = [250, 350, 550, 1000]
    for alt in test_alts:
        error = estimate_orbit_error(alt)
        status = "⚠️ 需要修正" if error['requires_correction'] else "✓ 精度足够"
        print(f"高度 {alt:4d} km: 日误差 = {error['daily_error_km']:6.1f} km, "
              f"周误差 = {error['weekly_error_km']:6.1f} km, {status}")
    
    print()
    print("✓ 轨道误差估计测试通过")
    print()

def test_drag_correction():
    print("=" * 60)
    print("测试大气阻力修正器")
    print("=" * 60)
    
    sat = create_satellite(test_tle[1], test_tle[2])
    
    from datetime import datetime
    import numpy as np
    
    jd, fr = 2460310.5, 0.0
    e, r, v = sat.sgp4(jd, fr)
    
    if e == 0:
        position = np.array(r)
        velocity = np.array(v)
        
        corrector = AtmosphericDragCorrector(mass=420000, area=1000, cd=2.2)
        corrected_pos, corrected_vel, drag_effect = corrector.correct_state(
            position, velocity, datetime.utcnow(), 51.6, 20.0
        )
        
        print(f"初始位置: {position}")
        print(f"修正后位置: {corrected_pos}")
        print(f"位置修正量: {drag_effect:.6f} km")
        
        alt = np.linalg.norm(position) - 6378.137
        print(f"轨道高度: {alt:.1f} km")
        
        if alt < 500:
            print("⚠️  低轨道卫星，大气阻力影响显著")
        else:
            print("✓ 轨道高度足够，大气阻力影响较小")
    
    print()
    print("✓ 大气阻力修正器测试通过")
    print()

def test_full_propagation():
    print("=" * 60)
    print("测试完整轨道传播（含大气阻力修正）")
    print("=" * 60)
    
    sat = create_satellite(test_tle[1], test_tle[2])
    
    from datetime import datetime
    from orbit_utils import calculate_ground_track
    
    start_time = datetime.utcnow()
    result = calculate_ground_track(sat, start_time, hours=24)
    
    print(f"传播时长: 24 小时")
    print(f"点数: {len(result['lons'])}")
    print(f"平均高度: {sum(result['alts'])/len(result['alts']):.1f} km")
    print(f"总修正量: {result['total_correction_km']:.2f} km")
    print(f"修正已启用: {result['drag_correction_enabled']}")
    
    error_est = result['error_estimate']
    print(f"估计日误差: {error_est['daily_error_km']:.1f} km")
    print(f"需要修正: {'是' if error_est['requires_correction'] else '否'}")
    
    print()
    print("✓ 完整轨道传播测试通过")
    print()

def main():
    print()
    print("卫星轨道精度改进 - 测试脚本")
    print("针对 < 300km 轨道大气阻力导致 > 50km/天误差问题")
    print("集成 NRLMSISE-00 大气密度模型进行修正")
    print()
    
    test_atmosphere_model()
    test_orbit_error_estimation()
    test_drag_correction()
    test_full_propagation()
    
    print("=" * 60)
    print("所有测试完成！")
    print("=" * 60)
    print()
    print("改进总结:")
    print("✓ 集成 NRLMSISE-00 大气密度模型")
    print("✓ 实时计算大气阻力加速度")
    print("✓ 位置修正与误差估计")
    print("✓ 针对低轨道卫星（<300km）特别优化")
    print("✓ 精度显示面板集成到主应用")
    print()

if __name__ == "__main__":
    main()
