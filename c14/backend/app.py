from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from .quantum_simulator import QuantumCircuit
import io

app = Flask(__name__)
CORS(app)

circuit = QuantumCircuit(num_qubits=2)

@app.route('/api/circuit', methods=['GET'])
def get_circuit():
    return jsonify({
        'num_qubits': circuit.num_qubits,
        'gates': circuit.get_gate_list()
    })

@app.route('/api/circuit/gates', methods=['POST'])
def add_gate():
    data = request.get_json()
    gate_type = data.get('type')
    target_qubit = data.get('target_qubit')
    control_qubit = data.get('control_qubit')

    if not gate_type or target_qubit is None:
        return jsonify({'error': 'Missing gate information'}), 400

    gate = {'type': gate_type, 'target_qubit': target_qubit}
    if control_qubit is not None:
        gate['control_qubit'] = control_qubit

    circuit.add_gate(gate)
    return jsonify({'status': 'success', 'gate': gate})

@app.route('/api/circuit/gates/<int:index>', methods=['DELETE'])
def remove_gate(index):
    circuit.remove_gate(index)
    return jsonify({'status': 'success'})

@app.route('/api/circuit/clear', methods=['POST'])
def clear_gates():
    circuit.clear_gates()
    return jsonify({'status': 'success'})

@app.route('/api/simulate', methods=['POST'])
def simulate():
    data = request.get_json()
    gates = data.get('gates', [])
    num_qubits = data.get('num_qubits', 2)

    temp_circuit = QuantumCircuit(num_qubits=num_qubits)
    for gate in gates:
        temp_circuit.add_gate(gate)

    result = temp_circuit.simulate()
    return jsonify(result)

@app.route('/api/simulate/step-by-step', methods=['POST'])
def simulate_step_by_step():
    data = request.get_json()
    gates = data.get('gates', [])
    num_qubits = data.get('num_qubits', 2)

    temp_circuit = QuantumCircuit(num_qubits=num_qubits)
    for gate in gates:
        temp_circuit.add_gate(gate)

    history = temp_circuit.simulate_step_by_step()
    return jsonify({'history': history})

@app.route('/api/gates', methods=['GET'])
def get_available_gates():
    gates = {
        'single_qubit': [
            {'id': 'H', 'name': 'Hadamard', 'description': 'Hadamard gate (superposition)'},
            {'id': 'X', 'name': 'Pauli-X', 'description': 'NOT gate'},
            {'id': 'Y', 'name': 'Pauli-Y', 'description': 'Pauli-Y gate'},
            {'id': 'Z', 'name': 'Pauli-Z', 'description': 'Pauli-Z gate'},
            {'id': 'S', 'name': 'Phase', 'description': 'Phase gate (π/2)'},
            {'id': 'T', 'name': 'T-gate', 'description': 'T gate (π/4)'},
        ],
        'two_qubit': [
            {'id': 'CNOT', 'name': 'CNOT', 'description': 'Controlled-NOT gate'},
            {'id': 'SWAP', 'name': 'SWAP', 'description': 'Swap two qubits'},
        ]
    }
    return jsonify(gates)

@app.route('/api/set-qubits', methods=['POST'])
def set_num_qubits():
    global circuit
    data = request.get_json()
    num_qubits = data.get('num_qubits', 2)
    
    if 1 <= num_qubits <= 5:
        circuit = QuantumCircuit(num_qubits=num_qubits)
        return jsonify({'status': 'success', 'num_qubits': num_qubits})
    else:
        return jsonify({'error': 'Number of qubits must be between 1 and 5'}), 400

@app.route('/api/export/qasm', methods=['POST'])
def export_qasm():
    data = request.get_json()
    gates = data.get('gates', [])
    num_qubits = data.get('num_qubits', 2)
    circuit_name = data.get('circuit_name', 'quantum_circuit')

    temp_circuit = QuantumCircuit(num_qubits=num_qubits)
    for gate in gates:
        temp_circuit.add_gate(gate)

    qasm_code = temp_circuit.to_qasm(circuit_name)
    
    return jsonify({
        'qasm': qasm_code,
        'success': True
    })

@app.route('/api/export/qasm/download', methods=['POST'])
def download_qasm():
    data = request.get_json()
    gates = data.get('gates', [])
    num_qubits = data.get('num_qubits', 2)
    circuit_name = data.get('circuit_name', 'quantum_circuit')

    temp_circuit = QuantumCircuit(num_qubits=num_qubits)
    for gate in gates:
        temp_circuit.add_gate(gate)

    qasm_code = temp_circuit.to_qasm(circuit_name)
    
    buffer = io.BytesIO(qasm_code.encode('utf-8'))
    
    return send_file(
        buffer,
        mimetype='text/plain',
        as_attachment=True,
        download_name=f'{circuit_name}.qasm'
    )

@app.route('/api/entanglement/analyze', methods=['POST'])
def analyze_entanglement():
    data = request.get_json()
    gates = data.get('gates', [])
    num_qubits = data.get('num_qubits', 2)

    temp_circuit = QuantumCircuit(num_qubits=num_qubits)
    for gate in gates:
        temp_circuit.add_gate(gate)

    result = temp_circuit.simulate()
    
    return jsonify({
        'entanglement': result.get('entanglement', {}),
        'probabilities': result.get('probabilities', {}),
        'bloch_vectors': result.get('bloch_vectors', [])
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
