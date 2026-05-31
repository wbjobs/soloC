import numpy as np
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
from orbit_utils import create_satellite, propagate_satellite_sgp4, propagate_satellite_with_drag_correction
from atmosphere import estimate_orbit_error


class OrbitAccuracyAnalyzer:
    def __init__(self, line1, line2, sat_name="Satellite"):
        self.sat = create_satellite(line1, line2)
        self.sat_name = sat_name
        self.results = {}
    
    def run_accuracy_analysis(self, hours=168):
        start_time = datetime.utcnow()
        
        result_sgp4 = self._propagate_without_correction(start_time, hours)
        result_corrected = self._propagate_with_correction(start_time, hours)
        
        error_analysis = self._calculate_error_statistics(result_sgp4, result_corrected)
        
        self.results = {
            'sgp4': result_sgp4,
            'corrected': result_corrected,
            'error_analysis': error_analysis
        }
        
        return self.results
    
    def _propagate_without_correction(self, start_time, hours):
        positions, velocities, times = propagate_satellite_sgp4(
            self.sat, start_time, hours, step_minutes=1
        )
        
        alts = np.linalg.norm(positions, axis=1) - 6378.137
        
        return {
            'positions': positions,
            'velocities': velocities,
            'times': times,
            'altitudes': alts
        }
    
    def _propagate_with_correction(self, start_time, hours):
        result = propagate_satellite_with_drag_correction(
            self.sat, start_time, hours, step_minutes=1
        )
        
        alts = np.linalg.norm(result['positions'], axis=1) - 6378.137
        result['altitudes'] = alts
        
        return result
    
    def _calculate_error_statistics(self, result_sgp4, result_corrected):
        positions_sgp4 = result_sgp4['positions']
        positions_corrected = result_corrected['positions']
        
        position_diffs = positions_corrected - positions_sgp4
        diff_magnitudes = np.linalg.norm(position_diffs, axis=1)
        
        hours_elapsed = np.arange(len(diff_magnitudes)) / 60
        daily_error = np.polyfit(hours_elapsed, diff_magnitudes, 1)[0] * 24
        
        mean_alt = np.mean(result_corrected['altitudes'])
        error_est = estimate_orbit_error(mean_alt, days=7)
        
        correction_effectiveness = self._calculate_correction_effectiveness(
            diff_magnitudes, error_est['daily_error_km']
        )
        
        return {
            'mean_position_difference_km': np.mean(diff_magnitudes),
            'max_position_difference_km': np.max(diff_magnitudes),
            'final_position_difference_km': diff_magnitudes[-1],
            'estimated_daily_error_km': error_est['daily_error_km'],
            'estimated_weekly_error_km': error_est['weekly_error_km'],
            'actual_daily_drift_km': daily_error,
            'mean_altitude_km': mean_alt,
            'requires_correction': error_est['requires_correction'],
            'correction_effectiveness': correction_effectiveness,
            'difference_time_series': diff_magnitudes,
            'times': result_sgp4['times']
        }
    
    def _calculate_correction_effectiveness(self, actual_diffs, estimated_daily_error):
        if estimated_daily_error < 1e-6:
            return 1.0
        
        max_expected = estimated_daily_error * 7
        if max_expected < 1e-6:
            return 1.0
        
        effectiveness = max(0, 1 - np.max(actual_diffs) / max_expected)
        return effectiveness
    
    def generate_accuracy_report(self):
        if not self.results:
            self.run_accuracy_analysis()
        
        analysis = self.results['error_analysis']
        
        report = []
        report.append("=" * 60)
        report.append(f"卫星轨道精度分析报告: {self.sat_name}")
        report.append("=" * 60)
        report.append("")
        report.append(f"平均轨道高度: {analysis['mean_altitude_km']:.1f} km")
        report.append("")
        report.append("误差分析:")
        report.append(f"  7天内最大位置差异: {analysis['max_position_difference_km']:.2f} km")
        report.append(f"  7天内平均位置差异: {analysis['mean_position_difference_km']:.2f} km")
        report.append(f"  7天后最终位置差异: {analysis['final_position_difference_km']:.2f} km")
        report.append("")
        report.append("日漂移估计:")
        report.append(f"  估计日误差（SGP4）: {analysis['estimated_daily_error_km']:.2f} km")
        report.append(f"  实际日漂移（修正前后）: {analysis['actual_daily_drift_km']:.2f} km")
        report.append(f"  估计周误差（SGP4）: {analysis['estimated_weekly_error_km']:.2f} km")
        report.append("")
        report.append("修正评估:")
        report.append(f"  需要大气阻力修正: {'是' if analysis['requires_correction'] else '否'}")
        
        if analysis['mean_altitude_km'] < 300:
            report.append("  ⚠️ 警告: 轨道高度<300km，大气阻力影响显著")
            report.append(f"  修正有效性: {analysis['correction_effectiveness']:.1%}")
        elif analysis['mean_altitude_km'] < 500:
            report.append("  ℹ️ 注意: 轨道高度300-500km，大气阻力影响中等")
        else:
            report.append("  ✓ 轨道高度>500km，大气阻力影响较小")
        
        report.append("")
        report.append("修正建议:")
        if analysis['mean_altitude_km'] < 300:
            report.append("  - 强烈建议启用NRLMSISE-00大气阻力修正")
            report.append("  - 建议缩短TLE更新周期至1-3天")
            report.append("  - 考虑增加卫星质量/面积比以减小阻力影响")
        elif analysis['mean_altitude_km'] < 500:
            report.append("  - 建议启用大气阻力修正")
            report.append("  - TLE更新周期建议3-7天")
        else:
            report.append("  - 基础SGP4模型通常已足够")
            report.append("  - 可根据精度需求选择性启用修正")
        
        report.append("")
        report.append("=" * 60)
        
        return "\n".join(report)
    
    def plot_error_comparison(self, save_path=None):
        if not self.results:
            self.run_accuracy_analysis()
        
        analysis = self.results['error_analysis']
        times = analysis['times']
        diffs = analysis['difference_time_series']
        
        hours_elapsed = np.arange(len(diffs)) / 60
        
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
        
        ax1.plot(hours_elapsed, diffs, 'b-', linewidth=1.5)
        ax1.set_xlabel('时间 (小时)')
        ax1.set_ylabel('位置差异 (km)')
        ax1.set_title(f'修正前后位置差异 - {self.sat_name}')
        ax1.grid(True, alpha=0.3)
        ax1.axhline(y=50, color='r', linestyle='--', alpha=0.5, label='50km阈值')
        ax1.legend()
        
        altitudes = self.results['corrected']['altitudes']
        ax2.plot(hours_elapsed, altitudes, 'g-', linewidth=1.5)
        ax2.set_xlabel('时间 (小时)')
        ax2.set_ylabel('轨道高度 (km)')
        ax2.set_title('轨道高度变化')
        ax2.grid(True, alpha=0.3)
        ax2.axhline(y=300, color='r', linestyle='--', alpha=0.5, label='300km')
        ax2.axhline(y=500, color='y', linestyle='--', alpha=0.5, label='500km')
        ax2.legend()
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches='tight')
            plt.close()
            return save_path
        else:
            plt.show()
            return None


def verify_low_orbit_accuracy(line1, line2, sat_name="Satellite"):
    analyzer = OrbitAccuracyAnalyzer(line1, line2, sat_name)
    results = analyzer.run_accuracy_analysis()
    report = analyzer.generate_accuracy_report()
    
    return {
        'analyzer': analyzer,
        'results': results,
        'report': report,
        'accuracy_acceptable': results['error_analysis']['max_position_difference_km'] < 50 or \
                              not results['error_analysis']['requires_correction']
    }
