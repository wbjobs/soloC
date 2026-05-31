import sys
import os

from simulator import FPGASimulator, FPGAConfig, NetworkConfig, generate_test_data
import numpy as np


def test_multi_layer_calculation():
    print("=" * 60)
    print("测试多层网络计算准确性")
    print("=" * 60)
    
    simulator = FPGASimulator()
    
    network_config = NetworkConfig(
        matrix_size=4,
        num_layers=2,
        batch_size=1,
        use_relu=False
    )
    
    np.random.seed(42)
    input_data = np.array([[1.0, 2.0, 3.0, 4.0]], dtype=np.float32)
    
    weights = [
        np.array([[1, 0, 0, 0],
                  [0, 1, 0, 0],
                  [0, 0, 1, 0],
                  [0, 0, 0, 1]], dtype=np.float32),
        np.array([[2, 0, 0, 0],
                  [0, 2, 0, 0],
                  [0, 0, 2, 0],
                  [0, 0, 0, 2]], dtype=np.float32)
    ]
    
    biases = [
        np.array([0.0, 0.0, 0.0, 0.0], dtype=np.float32),
        np.array([0.0, 0.0, 0.0, 0.0], dtype=np.float32)
    ]
    
    print("\n输入数据:")
    print(input_data)
    
    expected_layer1 = input_data @ weights[0] + biases[0]
    print("\n第一层预期输出 (单位矩阵):")
    print(expected_layer1)
    
    expected_layer2 = expected_layer1 @ weights[1] + biases[1]
    print("\n第二层预期输出 (x2):")
    print(expected_layer2)
    
    cpu_result, cpu_time = simulator.run_cpu_reference(input_data, weights, biases, network_config)
    print("\nCPU计算结果:")
    print(cpu_result)
    
    fpga_result, sim_result = simulator.simulate_fpga_accelerator(input_data, weights, biases, network_config)
    print("\nFPGA仿真结果:")
    print(fpga_result)
    
    print("\nCPU结果是否正确?", np.allclose(cpu_result, expected_layer2))
    print("FPGA结果是否正确?", np.allclose(fpga_result, expected_layer2))
    print("CPU和FPGA结果是否一致?", np.allclose(cpu_result, fpga_result))


def test_with_random_data():
    print("\n" + "=" * 60)
    print("测试随机数据多层网络")
    print("=" * 60)
    
    simulator = FPGASimulator()
    
    for num_layers in [1, 2, 3, 5]:
        print(f"\n--- 测试 {num_layers} 层网络 ---")
        
        network_config = NetworkConfig(
            matrix_size=8,
            num_layers=num_layers,
            batch_size=1,
            use_relu=True
        )
        
        np.random.seed(num_layers * 100)
        input_data, weights, biases = generate_test_data(8, num_layers, 1)
        
        cpu_result, cpu_time = simulator.run_cpu_reference(input_data, weights, biases, network_config)
        fpga_result, sim_result = simulator.simulate_fpga_accelerator(input_data, weights, biases, network_config)
        
        are_close = np.allclose(cpu_result, fpga_result, rtol=1e-5)
        print(f"  CPU和FPGA结果一致: {are_close}")
        
        if not are_close:
            print("  差异:")
            print(f"  CPU: {cpu_result}")
            print(f"  FPGA: {fpga_result}")
            print(f"  绝对误差: {np.abs(cpu_result - fpga_result)}")


def test_speedup_calculation():
    print("\n" + "=" * 60)
    print("测试加速比计算")
    print("=" * 60)
    
    simulator = FPGASimulator()
    
    network_config = NetworkConfig(
        matrix_size=16,
        num_layers=5,
        batch_size=1
    )
    
    result = simulator.run_full_simulation(network_config)
    
    print(f"\nFPGA周期数: {result.fpga_cycles}")
    print(f"FPGA时间: {result.fpga_time_ms:.6f} ms")
    print(f"CPU时间: {result.cpu_time_ms:.6f} ms")
    print(f"加速比: {result.speedup:.4f}x")
    print(f"功耗: {result.power_consumption_mw:.2f} mW")
    print(f"吞吐量: {result.throughput_mops:.2f} MOPS")


if __name__ == "__main__":
    test_multi_layer_calculation()
    test_with_random_data()
    test_speedup_calculation()
    print("\n" + "=" * 60)
    print("所有调试测试完成!")
    print("=" * 60)
