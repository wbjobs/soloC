import sys
import os
import io
import zipfile
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'python'))

from flask import Flask, jsonify, request, render_template, send_file
from flask_cors import CORS
from dataclasses import asdict
from simulator import FPGASimulator, FPGAConfig, NetworkConfig
from optimizer import FPGAOptimizer, OptimizationConfig, OptimizationResult
from bitstream_generator import BitstreamGenerator, FPGAProjectConfig

app = Flask(__name__, 
            static_folder='web/static',
            template_folder='web/templates')
CORS(app)

simulator = FPGASimulator()
optimizer = FPGAOptimizer(simulator)
bitstream_gen = BitstreamGenerator()

simulation_history = []
optimization_history = []


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/config', methods=['GET'])
def get_default_config():
    default_network = NetworkConfig()
    default_fpga = FPGAConfig()
    
    return jsonify({
        'network_config': asdict(default_network),
        'fpga_config': asdict(default_fpga)
    })


@app.route('/api/simulate', methods=['POST'])
def run_simulation():
    try:
        data = request.get_json()
        
        network_config = NetworkConfig(
            matrix_size=data.get('matrix_size', 8),
            num_layers=data.get('num_layers', 3),
            batch_size=data.get('batch_size', 1),
            use_relu=data.get('use_relu', True)
        )
        
        fpga_config = FPGAConfig(
            num_pe=data.get('num_pe', 4),
            clock_freq_mhz=data.get('clock_freq_mhz', 100.0),
            data_width=data.get('data_width', 16),
            max_matrix_size=data.get('max_matrix_size', 16),
            power_per_pe_mw=data.get('power_per_pe_mw', 100.0),
            memory_power_mw=data.get('memory_power_mw', 200.0),
            idle_power_mw=data.get('idle_power_mw', 50.0)
        )
        
        result = simulator.run_full_simulation(network_config, fpga_config)
        
        result_dict = asdict(result)
        
        result_dict['fpga_config'] = asdict(fpga_config)
        result_dict['network_config'] = asdict(network_config)
        
        simulation_history.append(result_dict)
        if len(simulation_history) > 10:
            simulation_history.pop(0)
        
        return jsonify({
            'success': True,
            'result': result_dict
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/history', methods=['GET'])
def get_history():
    return jsonify({
        'history': simulation_history
    })


@app.route('/api/compare', methods=['POST'])
def run_comparison():
    try:
        data = request.get_json()
        
        base_network = NetworkConfig(
            matrix_size=data.get('matrix_size', 8),
            num_layers=data.get('num_layers', 3),
            batch_size=data.get('batch_size', 1),
            use_relu=data.get('use_relu', True)
        )
        
        base_fpga = FPGAConfig(num_pe=data.get('num_pe', 4))
        
        results = []
        
        for num_pe in [1, 2, 4, 8, 16]:
            fpga_config = FPGAConfig(num_pe=num_pe)
            result = simulator.run_full_simulation(base_network, fpga_config)
            results.append({
                'num_pe': num_pe,
                'result': asdict(result)
            })
        
        return jsonify({
            'success': True,
            'comparison': results
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/optimize', methods=['POST'])
def run_optimization():
    try:
        data = request.get_json()
        
        network_config = NetworkConfig(
            matrix_size=data.get('matrix_size', 8),
            num_layers=data.get('num_layers', 3),
            batch_size=data.get('batch_size', 1),
            use_relu=data.get('use_relu', True)
        )
        
        target = data.get('optimization_target', 'speedup')
        
        optimization_config = OptimizationConfig(
            target=target,
            num_pe_options=data.get('pe_options', [1, 2, 4, 8, 16]),
            clock_freq_options=data.get('freq_options', [50, 100, 150, 200, 250]),
            data_width_options=data.get('width_options', [8, 16, 32])
        )
        
        opt_result = optimizer.optimize_grid_search(network_config, optimization_config)
        
        pareto_front = optimizer.optimize_pareto(network_config, optimization_config)
        
        result_dict = {
            'best_config': opt_result.best_config,
            'best_result': asdict(opt_result.best_result),
            'target': opt_result.target,
            'all_results': opt_result.all_results,
            'pareto_front': pareto_front,
            'total_configurations': len(opt_result.all_results)
        }
        
        optimization_history.append({
            'timestamp': datetime.now().isoformat(),
            'network_config': asdict(network_config),
            'optimization_target': target,
            'result': result_dict
        })
        
        if len(optimization_history) > 5:
            optimization_history.pop(0)
        
        return jsonify({
            'success': True,
            'result': result_dict
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/suggestions', methods=['POST'])
def get_optimization_suggestions():
    try:
        data = request.get_json()
        
        network_config = NetworkConfig(
            matrix_size=data.get('matrix_size', 8),
            num_layers=data.get('num_layers', 3),
            batch_size=data.get('batch_size', 1),
            use_relu=data.get('use_relu', True)
        )
        
        suggestions = optimizer.get_optimization_suggestions(network_config)
        
        return jsonify({
            'success': True,
            'result': suggestions
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/export_project', methods=['POST'])
def export_fpga_project():
    try:
        data = request.get_json()
        
        project_name = data.get('project_name', 'fpga_nn_accelerator')
        
        project_config = FPGAProjectConfig(
            project_name=project_name,
            fpga_part=data.get('fpga_part', 'xc7a35ticsg324-1L'),
            target_family=data.get('target_family', 'Artix-7'),
            num_pe=data.get('num_pe', 4),
            clock_freq_mhz=data.get('clock_freq_mhz', 100.0),
            data_width=data.get('data_width', 16),
            matrix_size=data.get('matrix_size', 8),
            num_layers=data.get('num_layers', 3),
            use_relu=data.get('use_relu', True)
        )
        
        project_files = bitstream_gen.generate_full_project(project_config)
        
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for filepath, content in project_files.items():
                zip_file.writestr(filepath, content)
            
            design_summary = f"""# Design Summary
# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Project Configuration
- Project Name: {project_config.project_name}
- Target FPGA: {project_config.fpga_part}
- Clock Frequency: {project_config.clock_freq_mhz} MHz
- Number of PEs: {project_config.num_pe}
- Data Width: {project_config.data_width} bits
- Matrix Size: {project_config.matrix_size} x {project_config.matrix_size}
- Network Layers: {project_config.num_layers}

## Estimated Resource Usage
- LUTs: ~{project_config.num_pe * 200}
- FFs: ~{project_config.num_pe * 150}
- DSPs: ~{project_config.num_pe}
- BRAMs: ~{project_config.matrix_size // 4}

## Performance Estimates
- Theoretical Throughput: {project_config.num_pe * project_config.clock_freq_mhz} MAC ops/s
- Estimated Time: ~{((project_config.num_layers * ((project_config.matrix_size ** 3) // project_config.num_pe + project_config.matrix_size ** 2)) / (project_config.clock_freq_mhz * 1e6)) * 1000:.4f} ms

## Next Steps
1. Extract this ZIP file
2. Open Vivado
3. Run: Tools -> Run Tcl Script -> select scripts/build.tcl
4. Wait for bitstream generation
5. Program your FPGA

## Notes
- This is a parameterized design
- Adjust constraints in constraints/accelerator.xdc if needed
- For different FPGA parts, update the fpga_part parameter
"""
            zip_file.writestr('DESIGN_SUMMARY.txt', design_summary)
        
        zip_buffer.seek(0)
        
        filename = f"{project_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/export_config', methods=['POST'])
def export_config():
    try:
        data = request.get_json()
        
        config_data = {
            'exported_at': datetime.now().isoformat(),
            'version': '1.0.0',
            'network_config': {
                'matrix_size': data.get('matrix_size', 8),
                'num_layers': data.get('num_layers', 3),
                'batch_size': data.get('batch_size', 1),
                'use_relu': data.get('use_relu', True)
            },
            'fpga_config': {
                'num_pe': data.get('num_pe', 4),
                'clock_freq_mhz': data.get('clock_freq_mhz', 100.0),
                'data_width': data.get('data_width', 16)
            },
            'project_config': {
                'project_name': data.get('project_name', 'fpga_nn_accelerator'),
                'fpga_part': data.get('fpga_part', 'xc7a35ticsg324-1L'),
                'target_family': data.get('target_family', 'Artix-7')
            }
        }
        
        json_content = json.dumps(config_data, indent=2)
        
        buffer = io.BytesIO(json_content.encode('utf-8'))
        
        return send_file(
            buffer,
            mimetype='application/json',
            as_attachment=True,
            download_name=f"fpga_config_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        )
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


import json


if __name__ == '__main__':
    print("Starting FPGA Neural Network Accelerator Simulation Platform...")
    app.run(debug=True, host='0.0.0.0', port=5000)
