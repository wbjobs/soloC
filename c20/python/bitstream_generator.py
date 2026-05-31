from dataclasses import dataclass, asdict
from typing import Dict, Any, List
from datetime import datetime
import json
import os


@dataclass
class FPGAProjectConfig:
    project_name: str = "fpga_nn_accelerator"
    fpga_part: str = "xc7a35ticsg324-1L"
    target_family: str = "Artix-7"
    num_pe: int = 4
    clock_freq_mhz: float = 100.0
    data_width: int = 16
    matrix_size: int = 8
    num_layers: int = 3
    use_relu: bool = True


class BitstreamGenerator:
    def __init__(self):
        self.template_dir = os.path.join(os.path.dirname(__file__), '..', 'verilog')
    
    def _read_verilog_file(self, filename: str) -> str:
        filepath = os.path.join(self.template_dir, filename)
        if os.path.exists(filepath):
            with open(filepath, 'r') as f:
                return f.read()
        return ""
    
    def generate_parameterized_verilog(self, config: FPGAProjectConfig) -> str:
        return f"""// ============================================================
// FPGA Neural Network Accelerator - Parameterized Module
// Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
// Configuration:
//   - Number of PEs: {config.num_pe}
//   - Clock Frequency: {config.clock_freq_mhz} MHz
//   - Data Width: {config.data_width} bits
//   - Matrix Size: {config.matrix_size} x {config.matrix_size}
//   - Network Layers: {config.num_layers}
//   - ReLU Activation: {'Enabled' if config.use_relu else 'Disabled'}
// ============================================================

`timescale 1ns / 1ps

package fpga_types_pkg;
    parameter DATA_WIDTH = {config.data_width};
    parameter WEIGHT_WIDTH = {config.data_width};
    parameter ACC_WIDTH = {config.data_width * 2};
    parameter FRAC_BITS = 8;
    parameter NUM_PE = {config.num_pe};
    parameter MAX_MATRIX_SIZE = {config.matrix_size};
    
    typedef logic signed [DATA_WIDTH-1:0] data_t;
    typedef logic signed [WEIGHT_WIDTH-1:0] weight_t;
    typedef logic signed [ACC_WIDTH-1:0] acc_t;
    
endpackage

// ============================================================
// MAC Unit (Multiply-Accumulate)
// ============================================================
module mac_unit #(
    parameter DATA_WIDTH = {config.data_width},
    parameter WEIGHT_WIDTH = {config.data_width},
    parameter ACC_WIDTH = {config.data_width * 2}
)(
    input logic clk,
    input logic rst_n,
    input logic en,
    input logic signed [DATA_WIDTH-1:0] a,
    input logic signed [WEIGHT_WIDTH-1:0] b,
    input logic signed [ACC_WIDTH-1:0] c_in,
    output logic signed [ACC_WIDTH-1:0] c_out,
    output logic valid
);

    logic signed [ACC_WIDTH-1:0] product;
    logic signed [ACC_WIDTH-1:0] accumulator;

    always_comb begin
        product = $signed(a) * $signed(b);
        accumulator = c_in + product;
    end

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            c_out <= '0;
            valid <= 1'b0;
        end else if (en) begin
            c_out <= accumulator;
            valid <= 1'b1;
        end else begin
            c_out <= c_out;
            valid <= 1'b0;
        end
    end

endmodule

// ============================================================
// ReLU Activation Unit
// ============================================================
module relu_unit #(
    parameter DATA_WIDTH = {config.data_width},
    parameter ACC_WIDTH = {config.data_width * 2},
    parameter FRAC_BITS = 8
)(
    input logic clk,
    input logic rst_n,
    input logic en,
    input logic signed [ACC_WIDTH-1:0] data_in,
    output logic signed [DATA_WIDTH-1:0] data_out,
    output logic valid
);

    logic signed [ACC_WIDTH-1:0] clamped;
    logic signed [DATA_WIDTH-1:0] result;

    always_comb begin
        if (data_in < 0) begin
            clamped = 0;
        end else begin
            clamped = data_in;
        end
        
        result = clamped[DATA_WIDTH+FRAC_BITS-1:FRAC_BITS];
    end

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            data_out <= '0;
            valid <= 1'b0;
        end else if (en) begin
            data_out <= result;
            valid <= 1'b1;
        end else begin
            data_out <= data_out;
            valid <= 1'b0;
        end
    end

endmodule

// ============================================================
// Processing Element (PE) Array
// ============================================================
module pe_array #(
    parameter NUM_PE = {config.num_pe},
    parameter DATA_WIDTH = {config.data_width},
    parameter WEIGHT_WIDTH = {config.data_width},
    parameter ACC_WIDTH = {config.data_width * 2}
)(
    input logic clk,
    input logic rst_n,
    input logic en,
    input logic signed [DATA_WIDTH-1:0] data_in [NUM_PE],
    input logic signed [WEIGHT_WIDTH-1:0] weight_in [NUM_PE],
    input logic signed [ACC_WIDTH-1:0] acc_in [NUM_PE],
    output logic signed [ACC_WIDTH-1:0] acc_out [NUM_PE],
    output logic [NUM_PE-1:0] valid
);

    genvar i;
    generate
        for (i = 0; i < NUM_PE; i = i + 1) begin : pe_gen
            mac_unit #(
                .DATA_WIDTH(DATA_WIDTH),
                .WEIGHT_WIDTH(WEIGHT_WIDTH),
                .ACC_WIDTH(ACC_WIDTH)
            ) mac_i (
                .clk(clk),
                .rst_n(rst_n),
                .en(en),
                .a(data_in[i]),
                .b(weight_in[i]),
                .c_in(acc_in[i]),
                .c_out(acc_out[i]),
                .valid(valid[i])
            );
        end
    endgenerate

endmodule

// ============================================================
// Top-Level FPGA Accelerator
// ============================================================
module fpga_nn_accelerator #(
    parameter NUM_PE = {config.num_pe},
    parameter DATA_WIDTH = {config.data_width},
    parameter MAX_MATRIX_SIZE = {config.matrix_size}
)(
    input logic clk,
    input logic rst_n,
    input logic start,
    input logic [31:0] matrix_size,
    input logic [31:0] num_layers,
    input logic [DATA_WIDTH-1:0] input_data [MAX_MATRIX_SIZE*MAX_MATRIX_SIZE],
    output logic [DATA_WIDTH-1:0] output_data [MAX_MATRIX_SIZE*MAX_MATRIX_SIZE],
    output logic done,
    output logic [63:0] cycle_count
);

    typedef enum logic [2:0] {{
        IDLE,
        LOAD,
        COMPUTE,
        ACTIVATE,
        DONE
    }} state_t;

    state_t current_state, next_state;
    logic [31:0] layer_cnt, row_cnt, col_cnt;
    logic [63:0] cycle_cnt;
    
    // Internal signals for PE array
    logic pe_en, relu_en;
    logic [NUM_PE-1:0] pe_valid;
    
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            current_state <= IDLE;
            layer_cnt <= 0;
            row_cnt <= 0;
            col_cnt <= 0;
            cycle_cnt <= 0;
        end else begin
            current_state <= next_state;
            if (current_state == COMPUTE || current_state == ACTIVATE) begin
                cycle_cnt <= cycle_cnt + 1;
            end
        end
    end
    
    always_comb begin
        next_state = current_state;
        pe_en = 1'b0;
        relu_en = 1'b0;
        done = 1'b0;
        
        case (current_state)
            IDLE: begin
                if (start) next_state = LOAD;
            end
            LOAD: begin
                next_state = COMPUTE;
            end
            COMPUTE: begin
                pe_en = 1'b1;
                if (&pe_valid) next_state = ACTIVATE;
            end
            ACTIVATE: begin
                relu_en = 1'b1;
                if (layer_cnt >= num_layers) begin
                    next_state = DONE;
                end else begin
                    next_state = COMPUTE;
                end
            end
            DONE: begin
                done = 1'b1;
                next_state = IDLE;
            end
        endcase
    end
    
    assign cycle_count = cycle_cnt;

endmodule
"""
    
    def generate_vivado_tcl(self, config: FPGAProjectConfig) -> str:
        clock_ns = 1000.0 / config.clock_freq_mhz
        
        return f"""# ============================================================
# Vivado Synthesis Script for FPGA Neural Network Accelerator
# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
# Project: {config.project_name}
# Target FPGA: {config.fpga_part}
# ============================================================

# Create project
create_project {config.project_name} ./vivado_project -part {config.fpga_part}

# Add source files
add_files {{
    ./src/fpga_accelerator.v
}}

add_files -fileset constrs_1 {{
    ./constraints/accelerator.xdc
}}

# Set properties
set_property TOP "fpga_nn_accelerator" [current_fileset]
set_property target_language Verilog [current_project]

# Configure synthesis settings
set_property STEPS.SYNTH_DESIGN.ARGS.RETIMING true [get_runs synth_1]
set_property STEPS.SYNTH_DESIGN.ARGS.FLATTEN_HIERARCHY rebuilt [get_runs synth_1]

# Configure implementation settings
set_property STEPS.OPT_DESIGN.ARGS.DIRECTIVE Explore [get_runs impl_1]
set_property STEPS.PLACE_DESIGN.ARGS.DIRECTIVE Explore [get_runs impl_1]
set_property STEPS.ROUTE_DESIGN.ARGS.DIRECTIVE Explore [get_runs impl_1]

# Run synthesis
launch_runs synth_1
wait_on_run synth_1

# Run implementation
launch_runs impl_1 -to_step write_bitstream
wait_on_run impl_1

# Generate reports
open_run impl_1
report_utilization -file ./reports/utilization.rpt
report_timing -file ./reports/timing.rpt
report_power -file ./reports/power.rpt

# Export hardware
write_hw_platform -fixed -include_bit -force -file ./exports/{config.project_name}.xsa

# Close project
close_project

puts "Bitstream generation complete!"
puts "Output: ./vivado_project/{config.project_name}.runs/impl_1/fpga_nn_accelerator.bit"
"""
    
    def generate_xdc_constraints(self, config: FPGAProjectConfig) -> str:
        clock_period_ns = 1000.0 / config.clock_freq_mhz
        
        return f"""# ============================================================
# Constraints File for FPGA Neural Network Accelerator
# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
# Clock Frequency: {config.clock_freq_mhz} MHz (Period: {clock_period_ns:.3f} ns)
# ============================================================

# Clock constraints
create_clock -name clk -period {clock_period_ns:.3f} [get_ports clk]
set_property PACKAGE_PIN E3 [get_ports clk]
set_property IOSTANDARD LVCMOS33 [get_ports clk]

# Reset
set_property PACKAGE_PIN B3 [get_ports rst_n]
set_property IOSTANDARD LVCMOS33 [get_ports rst_n]

# Control signals
set_property PACKAGE_PIN C3 [get_ports start]
set_property IOSTANDARD LVCMOS33 [get_ports start]

set_property PACKAGE_PIN A4 [get_ports done]
set_property IOSTANDARD LVCMOS33 [get_ports done]

# Timing constraints
set_clock_uncertainty 0.3 [get_clocks clk]
set_input_delay -clock clk 0.2 [get_ports input_data[*]]
set_input_delay -clock clk 0.2 [get_ports {{matrix_size num_layers start}}]
set_output_delay -clock clk 0.2 [get_ports output_data[*]]
set_output_delay -clock clk 0.2 [get_ports {{done cycle_count[*]}}]

# Physical constraints
set_property CONFIG_MODE SPIx4 [current_design]
set_property BITSTREAM.CONFIG.SPI_BUSWIDTH 4 [current_design]
set_property BITSTREAM.GENERAL.COMPRESS TRUE [current_design]

# Power optimization
set_property STEPS.PHYS_OPT_DESIGN.IS_ENABLED true [get_runs impl_1]
"""
    
    def generate_makefile(self, config: FPGAProjectConfig) -> str:
        return f"""# ============================================================
# Makefile for FPGA Neural Network Accelerator Project
# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
# Project: {config.project_name}
# ============================================================

# Variables
PROJECT_NAME := {config.project_name}
FPGA_PART := {config.fpga_part}
CLOCK_FREQ := {config.clock_freq_mhz}
NUM_PE := {config.num_pe}
DATA_WIDTH := {config.data_width}

# Vivado settings
VIVADO := vivado
VIVADO_MODE := -mode tcl

# Directories
SRC_DIR := ./src
CONST_DIR := ./constraints
SCRIPT_DIR := ./scripts
BUILD_DIR := ./vivado_project
REPORT_DIR := ./reports
EXPORT_DIR := ./exports

# Default target
.PHONY: all clean synth impl bitstream program help

all: bitstream

help:
	@echo "FPGA Neural Network Accelerator Build System"
	@echo ""
	@echo "Targets:"
	@echo "  synth      - Run synthesis"
	@echo "  impl       - Run synthesis and implementation"
	@echo "  bitstream  - Generate bitstream (default)"
	@echo "  program    - Program FPGA"
	@echo "  clean      - Clean build files"
	@echo ""
	@echo "Configuration:"
	@echo "  FPGA Part: $(FPGA_PART)"
	@echo "  Clock: $(CLOCK_FREQ) MHz"
	@echo "  PEs: $(NUM_PE)"
	@echo "  Data Width: $(DATA_WIDTH) bits"

synth:
	$(VIVADO) $(VIVADO_MODE) -source $(SCRIPT_DIR)/synth.tcl

impl: synth
	$(VIVADO) $(VIVADO_MODE) -source $(SCRIPT_DIR)/impl.tcl

bitstream:
	@echo "Building bitstream for $(PROJECT_NAME)..."
	@echo "Configuration: $(NUM_PE) PEs @ $(CLOCK_FREQ) MHz, $(DATA_WIDTH)-bit data"
	$(VIVADO) $(VIVADO_MODE) -source $(SCRIPT_DIR)/build.tcl
	@echo ""
	@echo "Bitstream generated successfully!"
	@echo "Output: $(BUILD_DIR)/$(PROJECT_NAME).runs/impl_1/fpga_nn_accelerator.bit"

program: bitstream
	@echo "Programming FPGA..."
	$(VIVADO) $(VIVADO_MODE) -source $(SCRIPT_DIR)/program.tcl

clean:
	@echo "Cleaning build files..."
	rm -rf $(BUILD_DIR)
	rm -rf $(REPORT_DIR)
	rm -rf $(EXPORT_DIR)
	rm -f *.jou *.log
	@echo "Clean complete!"

# Simulation target (if using ModelSim/QuestaSim)
sim:
	@echo "Running simulation..."
	# Add simulation commands here
"""
    
    def generate_readme(self, config: FPGAProjectConfig) -> str:
        return f"""# FPGA Neural Network Accelerator Project

**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Project Configuration

| Parameter | Value |
|-----------|-------|
| Project Name | {config.project_name} |
| Target FPGA | {config.fpga_part} ({config.target_family}) |
| Clock Frequency | {config.clock_freq_mhz} MHz |
| Processing Elements | {config.num_pe} |
| Data Width | {config.data_width} bits |
| Matrix Size | {config.matrix_size} x {config.matrix_size} |
| Network Layers | {config.num_layers} |
| ReLU Activation | {'Enabled' if config.use_relu else 'Disabled'} |

## Directory Structure

```
{config.project_name}/
├── src/
│   └── fpga_accelerator.v      # Parameterized Verilog source
├── constraints/
│   └── accelerator.xdc         # Timing & physical constraints
├── scripts/
│   ├── build.tcl               # Complete build script
│   ├── synth.tcl               # Synthesis only
│   └── impl.tcl                # Implementation only
├── reports/                    # Generated reports
├── exports/                    # Exported hardware
└── Makefile                    # Build automation
```

## Quick Start

### Using Makefile

```bash
# Generate bitstream
make bitstream

# Run synthesis only
make synth

# Run implementation only
make impl

# Program FPGA
make program

# Clean build files
make clean
```

### Using Vivado GUI

1. Open Vivado
2. Run `Tools -> Run Tcl Script`
3. Select `scripts/build.tcl`
4. Wait for bitstream generation

## Expected Resource Usage (Estimated)

| Resource | Estimated Usage |
|----------|-----------------|
| LUTs | ~{config.num_pe * 200} |
| FFs | ~{config.num_pe * 150} |
| DSPs | ~{config.num_pe} |
| BRAMs | ~{config.matrix_size // 4} |

## Performance Estimates

- **Theoretical Throughput:** {config.num_pe * config.clock_freq_mhz} MAC operations/sec
- **Matrix Multiplication Time:** ~{(config.matrix_size ** 3) // config.num_pe} cycles
- **Latency per Layer:** ~{(config.matrix_size ** 3) // config.num_pe + config.matrix_size ** 2} cycles

## Notes

1. This is a parameterized design - adjust NUM_PE and CLOCK_FREQ for your needs
2. Timing constraints are set for {config.clock_freq_mhz} MHz - adjust if needed
3. For larger designs, consider using pipelining and more aggressive optimization
4. Power estimates can be found in the generated reports after implementation

## Troubleshooting

- **Timing violations:** Reduce clock frequency or add pipeline stages
- **Resource overflow:** Reduce NUM_PE or matrix size
- **Simulation issues:** Check testbench and stimulus generation
"""
    
    def generate_config_json(self, config: FPGAProjectConfig) -> str:
        config_dict = asdict(config)
        config_dict['generated_at'] = datetime.now().isoformat()
        config_dict['version'] = '1.0.0'
        
        estimated_resources = {
            'LUTs': config.num_pe * 200,
            'FFs': config.num_pe * 150,
            'DSPs': config.num_pe,
            'BRAMs': config.matrix_size // 4
        }
        
        performance_estimates = {
            'theoretical_throughput_gops': config.num_pe * config.clock_freq_mhz / 1000,
            'cycles_per_matrix_mul': (config.matrix_size ** 3) // config.num_pe,
            'cycles_per_layer': (config.matrix_size ** 3) // config.num_pe + config.matrix_size ** 2,
            'estimated_time_ms': ((config.num_layers * ((config.matrix_size ** 3) // config.num_pe + config.matrix_size ** 2)) / (config.clock_freq_mhz * 1e6)) * 1000
        }
        
        full_config = {
            'project': config_dict,
            'estimated_resources': estimated_resources,
            'performance_estimates': performance_estimates
        }
        
        return json.dumps(full_config, indent=2)
    
    def generate_full_project(self, config: FPGAProjectConfig) -> Dict[str, str]:
        return {
            'src/fpga_accelerator.v': self.generate_parameterized_verilog(config),
            'constraints/accelerator.xdc': self.generate_xdc_constraints(config),
            'scripts/build.tcl': self.generate_vivado_tcl(config),
            'Makefile': self.generate_makefile(config),
            'README.md': self.generate_readme(config),
            'config.json': self.generate_config_json(config)
        }


def create_project_config(
    num_pe: int = 4,
    clock_freq_mhz: float = 100.0,
    data_width: int = 16,
    matrix_size: int = 8,
    num_layers: int = 3,
    project_name: str = "fpga_nn_accelerator"
) -> FPGAProjectConfig:
    return FPGAProjectConfig(
        project_name=project_name,
        num_pe=num_pe,
        clock_freq_mhz=clock_freq_mhz,
        data_width=data_width,
        matrix_size=matrix_size,
        num_layers=num_layers
    )
