import numpy as np
from dataclasses import dataclass
from typing import List, Tuple
import time


@dataclass
class FPGAConfig:
    num_pe: int = 4
    clock_freq_mhz: float = 100.0
    data_width: int = 16
    max_matrix_size: int = 16
    power_per_pe_mw: float = 100.0
    memory_power_mw: float = 200.0
    idle_power_mw: float = 50.0


@dataclass
class NetworkConfig:
    matrix_size: int = 8
    num_layers: int = 3
    batch_size: int = 1
    use_relu: bool = True


@dataclass
class SimulationResult:
    fpga_cycles: int
    fpga_time_ms: float
    cpu_time_ms: float
    speedup: float
    power_consumption_mw: float
    energy_uj: float
    throughput_mops: float


class FPGASimulator:
    def __init__(self, fpga_config: FPGAConfig = None):
        self.fpga_config = fpga_config or FPGAConfig()
        
    def relu(self, x: np.ndarray) -> np.ndarray:
        return np.maximum(x, 0)
    
    def simulate_fpga_accelerator(self, 
                                   input_data: np.ndarray,
                                   weights: List[np.ndarray],
                                   biases: List[np.ndarray],
                                   network_config: NetworkConfig) -> Tuple[np.ndarray, SimulationResult]:
        n = network_config.matrix_size
        num_layers = network_config.num_layers
        num_pe = self.fpga_config.num_pe
        clock_freq = self.fpga_config.clock_freq_mhz
        
        cycles_per_matrix_mul = (n * n * n) // num_pe + (n * n)
        cycles_per_relu = n * n
        total_cycles = 0
        
        active_cycles = 0
        result = input_data.copy()
        
        for layer in range(num_layers):
            matmul_cycles = cycles_per_matrix_mul
            total_cycles += matmul_cycles
            active_cycles += matmul_cycles
            
            result = result @ weights[layer] + biases[layer]
            
            if network_config.use_relu:
                relu_cycles = cycles_per_relu
                total_cycles += relu_cycles
                active_cycles += relu_cycles
                result = self.relu(result)
        
        total_time_ms = (total_cycles / (clock_freq * 1e6)) * 1000
        active_time_ms = (active_cycles / (clock_freq * 1e6)) * 1000
        
        active_power = (num_pe * self.fpga_config.power_per_pe_mw + 
                       self.fpga_config.memory_power_mw)
        total_power = self.fpga_config.idle_power_mw + active_power
        
        total_ops = num_layers * (2 * n * n * n + n * n)
        if network_config.use_relu:
            total_ops += num_layers * n * n
        
        throughput_mops = (total_ops / (total_time_ms / 1000)) / 1e6
        energy_uj = total_power * (total_time_ms / 1000) * 1000
        
        sim_result = SimulationResult(
            fpga_cycles=total_cycles,
            fpga_time_ms=total_time_ms,
            cpu_time_ms=0,
            speedup=0,
            power_consumption_mw=total_power,
            energy_uj=energy_uj,
            throughput_mops=throughput_mops
        )
        
        return result, sim_result
    
    def run_cpu_reference(self,
                           input_data: np.ndarray,
                           weights: List[np.ndarray],
                           biases: List[np.ndarray],
                           network_config: NetworkConfig) -> Tuple[np.ndarray, float]:
        num_layers = network_config.num_layers
        result = input_data.copy()
        
        n = network_config.matrix_size
        estimated_ops = num_layers * (2 * n * n * n + n * n)
        if network_config.use_relu:
            estimated_ops += num_layers * n * n
        
        base_iterations = 10
        if estimated_ops < 10000:
            iterations = 1000
        elif estimated_ops < 100000:
            iterations = 100
        elif estimated_ops < 1000000:
            iterations = 10
        else:
            iterations = 1
        
        result = None
        total_time = 0.0
        
        for i in range(iterations):
            current_result = input_data.copy()
            start_time = time.perf_counter()
            for layer in range(num_layers):
                current_result = current_result @ weights[layer] + biases[layer]
                if network_config.use_relu:
                    current_result = self.relu(current_result)
            end_time = time.perf_counter()
            total_time += (end_time - start_time)
            if i == 0:
                result = current_result
        
        avg_time_ms = (total_time / iterations) * 1000
        return result, avg_time_ms
    
    def run_full_simulation(self,
                             network_config: NetworkConfig = None,
                             fpga_config: FPGAConfig = None) -> SimulationResult:
        if network_config is None:
            network_config = NetworkConfig()
        if fpga_config is not None:
            self.fpga_config = fpga_config
        
        n = network_config.matrix_size
        num_layers = network_config.num_layers
        
        input_data = np.random.randn(network_config.batch_size, n).astype(np.float32)
        weights = [np.random.randn(n, n).astype(np.float32) for _ in range(num_layers)]
        biases = [np.random.randn(n).astype(np.float32) for _ in range(num_layers)]
        
        cpu_result, cpu_time_ms = self.run_cpu_reference(input_data, weights, biases, network_config)
        fpga_result, sim_result = self.simulate_fpga_accelerator(input_data, weights, biases, network_config)
        
        sim_result.cpu_time_ms = cpu_time_ms
        sim_result.speedup = cpu_time_ms / sim_result.fpga_time_ms if sim_result.fpga_time_ms > 0 else 0
        
        return sim_result


def generate_test_data(matrix_size: int, num_layers: int, batch_size: int = 1):
    input_data = np.random.randn(batch_size, matrix_size).astype(np.float32)
    weights = [np.random.randn(matrix_size, matrix_size).astype(np.float32) for _ in range(num_layers)]
    biases = [np.random.randn(matrix_size).astype(np.float32) for _ in range(num_layers)]
    return input_data, weights, biases
