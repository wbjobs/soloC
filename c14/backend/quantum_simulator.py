from qutip import basis, tensor, sigmax, sigmay, sigmaz, hadamard, identity
from qutip.qip.operations import snot, s, t, cnot, swap, iswap, toffoli
import numpy as np
from typing import List, Dict, Tuple, Optional

GATE_MAP = {
    'H': hadamard,
    'X': sigmax,
    'Y': sigmay,
    'Z': sigmaz,
    'S': s,
    'T': t,
}

GATE_TO_QASM = {
    'H': 'h',
    'X': 'x',
    'Y': 'y',
    'Z': 'z',
    'S': 's',
    'T': 't',
    'CNOT': 'cx',
    'SWAP': 'swap',
}

class QuantumCircuit:
    def __init__(self, num_qubits: int = 2):
        self.num_qubits = num_qubits
        self.gates: List[Dict] = []
        self._state_history: List = []
        self._reset()

    def _reset(self):
        self._state = tensor([basis(2, 0) for _ in range(self.num_qubits)])
        self._state_history = [self._state.copy()]

    def add_gate(self, gate: Dict):
        self.gates.append(gate)

    def remove_gate(self, index: int):
        if 0 <= index < len(self.gates):
            del self.gates[index]

    def clear_gates(self):
        self.gates = []

    def _create_single_qubit_gate(self, gate_type: str, target_qubit: int):
        if gate_type not in GATE_MAP:
            raise ValueError(f"Unknown gate type: {gate_type}")
        
        gate = GATE_MAP[gate_type]()
        ops = [identity(2) for _ in range(self.num_qubits)]
        ops[target_qubit] = gate
        return tensor(ops)

    def _create_two_qubit_gate(self, gate_type: str, control_qubit: int, target_qubit: int):
        if gate_type == 'CNOT':
            return cnot(self.num_qubits, control_qubit, target_qubit)
        elif gate_type == 'SWAP':
            return swap(self.num_qubits, [control_qubit, target_qubit])
        elif gate_type == 'iSWAP':
            return iswap(self.num_qubits, [control_qubit, target_qubit])
        else:
            raise ValueError(f"Unknown two-qubit gate: {gate_type}")

    def _apply_gate(self, gate: Dict):
        if 'control_qubit' in gate:
            op = self._create_two_qubit_gate(gate['type'], gate['control_qubit'], gate['target_qubit'])
        else:
            op = self._create_single_qubit_gate(gate['type'], gate['target_qubit'])
        self._state = op * self._state

    def simulate(self, record_history: bool = True) -> Dict:
        self._reset()
        if record_history:
            self._state_history = [self._state.copy()]

        for gate in self.gates:
            self._apply_gate(gate)
            if record_history:
                self._state_history.append(self._state.copy())

        return self._get_result()

    def simulate_step_by_step(self) -> List[Dict]:
        self._reset()
        history = [self._get_state_info(self._state)]

        for gate in self.gates:
            self._apply_gate(gate)
            history.append(self._get_state_info(self._state))

        return history

    def _get_state_info(self, state) -> Dict:
        probabilities = np.abs(state.full().flatten()) ** 2
        state_labels = self._get_state_labels()
        
        state_dict = {}
        for label, prob in zip(state_labels, probabilities):
            if prob > 1e-10:
                state_dict[label] = float(prob)

        bloch_vectors = self._get_bloch_vectors(state)
        entanglement_info = self._get_entanglement_info(state)

        return {
            'state_vector': state.full().flatten().tolist(),
            'probabilities': state_dict,
            'bloch_vectors': bloch_vectors,
            'entanglement': entanglement_info,
        }

    def _get_state_labels(self) -> List[str]:
        labels = []
        for i in range(2 ** self.num_qubits):
            label = format(i, f'0{self.num_qubits}b')
            labels.append(f'|{label}>')
        return labels

    def _get_bloch_vectors(self, state) -> List[Dict]:
        vectors = []
        for qubit in range(self.num_qubits):
            rho = state.ptrace(qubit)
            x = 2 * rho[0, 1].real
            y = 2 * rho[0, 1].imag
            z = rho[0, 0].real - rho[1, 1].real
            
            vectors.append({
                'x': float(x),
                'y': float(y),
                'z': float(z),
                'qubit': qubit
            })
        return vectors

    def _get_entanglement_info(self, state) -> Dict:
        if self.num_qubits < 2:
            return {
                'is_entangled': False,
                'entropy': 0.0,
                'concurrence': 0.0,
                'pairs': []
            }

        pairs = []
        total_entropy = 0.0

        for i in range(self.num_qubits):
            for j in range(i + 1, self.num_qubits):
                other_qubits = [k for k in range(self.num_qubits) if k != i and k != j]
                
                if other_qubits:
                    rho_pair = state.ptrace([i, j])
                    rho_i = rho_pair.ptrace(0)
                else:
                    rho_i = state.ptrace(i)
                
                eigenvalues = rho_i.eigenenergies()
                eigenvalues = [max(0.0, float(e)) for e in eigenvalues]
                
                entropy = 0.0
                for e in eigenvalues:
                    if e > 1e-10:
                        entropy -= e * np.log2(e)
                
                purity = float((rho_i * rho_i).tr())
                concurrence = 2 * (1 - purity) if purity <= 0.5 else 0.0
                
                is_entangled = entropy > 0.1 or concurrence > 0.1
                
                pairs.append({
                    'qubits': [i, j],
                    'entropy': float(entropy),
                    'concurrence': float(concurrence),
                    'is_entangled': is_entangled,
                    'purity': float(purity),
                })
                
                total_entropy += entropy

        global_entropy = 0.0
        for qubit in range(self.num_qubits):
            rho = state.ptrace(qubit)
            eigenvalues = rho.eigenenergies()
            eigenvalues = [max(0.0, float(e)) for e in eigenvalues]
            for e in eigenvalues:
                if e > 1e-10:
                    global_entropy -= e * np.log2(e)

        max_possible_entropy = 1.0
        entanglement_score = min(1.0, global_entropy / max_possible_entropy) if max_possible_entropy > 0 else 0.0

        is_entangled = any(p['is_entangled'] for p in pairs)

        return {
            'is_entangled': is_entangled,
            'global_entropy': float(global_entropy),
            'entanglement_score': float(entanglement_score),
            'pairs': pairs,
            'per_qubit_purity': [
                float((state.ptrace(i) * state.ptrace(i)).tr())
                for i in range(self.num_qubits)
            ]
        }

    def to_qasm(self, circuit_name: str = "quantum_circuit") -> str:
        lines = []
        
        lines.append(f'OPENQASM 2.0;')
        lines.append(f'include "qelib1.inc";')
        lines.append('')
        lines.append(f'qreg q[{self.num_qubits}];')
        lines.append(f'creg c[{self.num_qubits}];')
        lines.append('')

        for gate in self.gates:
            gate_type = gate['type']
            qasm_gate = GATE_TO_QASM.get(gate_type, gate_type.lower())
            
            if 'control_qubit' in gate:
                control = gate['control_qubit']
                target = gate['target_qubit']
                
                if gate_type == 'CNOT':
                    lines.append(f'cx q[{control}], q[{target}];')
                elif gate_type == 'SWAP':
                    lines.append(f'swap q[{control}], q[{target}];')
                else:
                    lines.append(f'{qasm_gate} q[{control}], q[{target}];')
            else:
                target = gate['target_qubit']
                lines.append(f'{qasm_gate} q[{target}];')

        lines.append('')
        for i in range(self.num_qubits):
            lines.append(f'measure q[{i}] -> c[{i}];')

        return '\n'.join(lines)

    def to_qiskit_circuit(self):
        try:
            from qiskit import QuantumCircuit as QiskitCircuit
            
            qc = QiskitCircuit(self.num_qubits, self.num_qubits)
            
            for gate in self.gates:
                gate_type = gate['type']
                
                if 'control_qubit' in gate:
                    control = gate['control_qubit']
                    target = gate['target_qubit']
                    
                    if gate_type == 'CNOT':
                        qc.cx(control, target)
                    elif gate_type == 'SWAP':
                        qc.swap(control, target)
                else:
                    target = gate['target_qubit']
                    
                    if gate_type == 'H':
                        qc.h(target)
                    elif gate_type == 'X':
                        qc.x(target)
                    elif gate_type == 'Y':
                        qc.y(target)
                    elif gate_type == 'Z':
                        qc.z(target)
                    elif gate_type == 'S':
                        qc.s(target)
                    elif gate_type == 'T':
                        qc.t(target)
            
            for i in range(self.num_qubits):
                qc.measure(i, i)
            
            return qc
        except ImportError:
            return None

    def _get_result(self) -> Dict:
        return self._get_state_info(self._state)

    def get_gate_list(self) -> List[Dict]:
        return self.gates
