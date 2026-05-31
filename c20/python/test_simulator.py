from simulator import FPGASimulator, FPGAConfig, NetworkConfig


def test_basic_simulation():
    print("Testing basic FPGA accelerator simulation...")
    
    simulator = FPGASimulator()
    
    network_config = NetworkConfig(
        matrix_size=8,
        num_layers=3,
        batch_size=1,
        use_relu=True
    )
    
    result = simulator.run_full_simulation(network_config)
    
    print(f"  FPGA Cycles: {result.fpga_cycles}")
    print(f"  FPGA Time: {result.fpga_time_ms:.4f} ms")
    print(f"  CPU Time: {result.cpu_time_ms:.4f} ms")
    print(f"  Speedup: {result.speedup:.2f}x")
    print(f"  Power: {result.power_consumption_mw:.2f} mW")
    print(f"  Energy: {result.energy_uj:.2f} uJ")
    print(f"  Throughput: {result.throughput_mops:.2f} MOPS")
    
    assert result.fpga_cycles > 0
    assert result.speedup > 0
    print("  PASSED!\n")


def test_different_configurations():
    print("Testing different configurations...")
    
    simulator = FPGASimulator()
    
    configs = [
        ("Small Network", 4, 2),
        ("Medium Network", 8, 3),
        ("Large Network", 16, 5)
    ]
    
    for name, size, layers in configs:
        network_config = NetworkConfig(
            matrix_size=size,
            num_layers=layers,
            batch_size=1
        )
        
        result = simulator.run_full_simulation(network_config)
        
        print(f"  {name} (size={size}, layers={layers}):")
        print(f"    Speedup: {result.speedup:.2f}x")
        print(f"    Power: {result.power_consumption_mw:.2f} mW")
        print(f"    Throughput: {result.throughput_mops:.2f} MOPS")
    
    print("  PASSED!\n")


def test_different_pe_configurations():
    print("Testing different PE configurations...")
    
    simulator = FPGASimulator()
    network_config = NetworkConfig(matrix_size=8, num_layers=3)
    
    for num_pe in [2, 4, 8, 16]:
        fpga_config = FPGAConfig(num_pe=num_pe)
        result = simulator.run_full_simulation(network_config, fpga_config)
        
        print(f"  {num_pe} PEs:")
        print(f"    Cycles: {result.fpga_cycles}")
        print(f"    Speedup: {result.speedup:.2f}x")
    
    print("  PASSED!\n")


if __name__ == "__main__":
    print("=" * 50)
    print("FPGA Neural Network Accelerator Simulator Tests")
    print("=" * 50 + "\n")
    
    test_basic_simulation()
    test_different_configurations()
    test_different_pe_configurations()
    
    print("All tests passed!")
