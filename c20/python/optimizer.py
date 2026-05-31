from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional
from simulator import FPGASimulator, FPGAConfig, NetworkConfig, SimulationResult
import numpy as np


@dataclass
class OptimizationConfig:
    target: str = "speedup"
    num_pe_options: List[int] = None
    clock_freq_options: List[int] = None
    data_width_options: List[int] = None
    power_per_pe_options: List[float] = None
    
    def __post_init__(self):
        if self.num_pe_options is None:
            self.num_pe_options = [1, 2, 4, 8, 16]
        if self.clock_freq_options is None:
            self.clock_freq_options = [50, 100, 150, 200, 250]
        if self.data_width_options is None:
            self.data_width_options = [8, 16, 32]
        if self.power_per_pe_options is None:
            self.power_per_pe_options = [50, 100, 150]


@dataclass
class OptimizationResult:
    best_config: Dict[str, Any]
    best_result: SimulationResult
    all_results: List[Dict[str, Any]]
    target: str


class FPGAOptimizer:
    def __init__(self, simulator: FPGASimulator = None):
        self.simulator = simulator or FPGASimulator()
    
    def _calculate_score(self, result: SimulationResult, target: str) -> float:
        if target == "speedup":
            return result.speedup
        elif target == "throughput":
            return result.throughput_mops
        elif target == "power":
            return -result.power_consumption_mw
        elif target == "energy":
            return -result.energy_uj
        elif target == "efficiency":
            if result.power_consumption_mw > 0:
                return result.speedup / result.power_consumption_mw * 1000
            return 0
        else:
            return result.speedup
    
    def _normalize_value(self, value: float, min_val: float, max_val: float) -> float:
        if max_val == min_val:
            return 0.5
        return (value - min_val) / (max_val - min_val)
    
    def optimize_grid_search(self,
                              network_config: NetworkConfig,
                              optimization_config: OptimizationConfig = None
                              ) -> OptimizationResult:
        if optimization_config is None:
            optimization_config = OptimizationConfig()
        
        all_results = []
        best_score = float('-inf')
        best_config = None
        best_result = None
        
        total_combinations = (len(optimization_config.num_pe_options) *
                             len(optimization_config.clock_freq_options) *
                             len(optimization_config.data_width_options))
        
        current = 0
        for num_pe in optimization_config.num_pe_options:
            for clock_freq in optimization_config.clock_freq_options:
                for data_width in optimization_config.data_width_options:
                    current += 1
                    
                    fpga_config = FPGAConfig(
                        num_pe=num_pe,
                        clock_freq_mhz=clock_freq,
                        data_width=data_width
                    )
                    
                    result = self.simulator.run_full_simulation(
                        network_config=network_config,
                        fpga_config=fpga_config
                    )
                    
                    score = self._calculate_score(result, optimization_config.target)
                    
                    config_dict = {
                        'num_pe': num_pe,
                        'clock_freq_mhz': clock_freq,
                        'data_width': data_width,
                        'score': score
                    }
                    
                    result_dict = {
                        'config': config_dict,
                        'result': asdict(result)
                    }
                    all_results.append(result_dict)
                    
                    if score > best_score:
                        best_score = score
                        best_config = config_dict
                        best_result = result
        
        return OptimizationResult(
            best_config=best_config,
            best_result=best_result,
            all_results=all_results,
            target=optimization_config.target
        )
    
    def optimize_pareto(self,
                        network_config: NetworkConfig,
                        optimization_config: OptimizationConfig = None
                        ) -> List[Dict[str, Any]]:
        if optimization_config is None:
            optimization_config = OptimizationConfig()
        
        all_results = []
        
        for num_pe in optimization_config.num_pe_options:
            for clock_freq in optimization_config.clock_freq_options:
                for data_width in optimization_config.data_width_options:
                    fpga_config = FPGAConfig(
                        num_pe=num_pe,
                        clock_freq_mhz=clock_freq,
                        data_width=data_width
                    )
                    
                    result = self.simulator.run_full_simulation(
                        network_config=network_config,
                        fpga_config=fpga_config
                    )
                    
                    all_results.append({
                        'config': {
                            'num_pe': num_pe,
                            'clock_freq_mhz': clock_freq,
                            'data_width': data_width
                        },
                        'performance': result.speedup,
                        'power': result.power_consumption_mw,
                        'throughput': result.throughput_mops,
                        'energy': result.energy_uj
                    })
        
        pareto_front = []
        for i, r1 in enumerate(all_results):
            dominated = False
            for j, r2 in enumerate(all_results):
                if i == j:
                    continue
                if (r2['performance'] >= r1['performance'] and 
                    r2['power'] <= r1['power']):
                    dominated = True
                    break
            if not dominated:
                pareto_front.append(r1)
        
        pareto_front.sort(key=lambda x: x['performance'])
        return pareto_front
    
    def get_optimization_suggestions(self,
                                      network_config: NetworkConfig
                                      ) -> Dict[str, Any]:
        base_config = FPGAConfig()
        base_result = self.simulator.run_full_simulation(
            network_config=network_config,
            fpga_config=base_config
        )
        
        suggestions = []
        
        if network_config.matrix_size >= 8:
            suggestions.append({
                'type': 'performance',
                'title': '提高并行度',
                'description': '增加PE数量可以显著提高并行计算能力',
                'recommendation': '建议尝试 8 或 16 个PE',
                'expected_improvement': '预估加速比提升 2-4 倍'
            })
        
        if base_result.power_consumption_mw > 800:
            suggestions.append({
                'type': 'power',
                'title': '降低功耗',
                'description': '当前配置功耗较高',
                'recommendation': '尝试降低时钟频率或减少PE数量',
                'expected_improvement': '预估功耗降低 30-50%'
            })
        
        suggestions.append({
            'type': 'optimization',
            'title': '使用自动优化',
            'description': '系统可以自动搜索最佳参数组合',
            'recommendation': '点击"自动优化"按钮',
            'expected_improvement': '找到当前网络的最佳配置'
        })
        
        return {
            'current_result': asdict(base_result),
            'suggestions': suggestions
        }


def create_optimization_config(target: str = "speedup") -> OptimizationConfig:
    return OptimizationConfig(target=target)
