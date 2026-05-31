const API_BASE = '/api';

export const quantumAPI = {
  async simulate(gates, numQubits = 2) {
    const response = await fetch(`${API_BASE}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gates, num_qubits: numQubits })
    });
    return response.json();
  },

  async simulateStepByStep(gates, numQubits = 2) {
    const response = await fetch(`${API_BASE}/simulate/step-by-step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gates, num_qubits: numQubits })
    });
    return response.json();
  },

  async getAvailableGates() {
    const response = await fetch(`${API_BASE}/gates`);
    return response.json();
  },

  async setNumQubits(numQubits) {
    const response = await fetch(`${API_BASE}/set-qubits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ num_qubits: numQubits })
    });
    return response.json();
  },

  async exportQASM(gates, numQubits, circuitName = 'quantum_circuit') {
    const response = await fetch(`${API_BASE}/export/qasm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        gates, 
        num_qubits: numQubits,
        circuit_name: circuitName 
      })
    });
    return response.json();
  },

  async downloadQASM(gates, numQubits, circuitName = 'quantum_circuit') {
    const response = await fetch(`${API_BASE}/export/qasm/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        gates, 
        num_qubits: numQubits,
        circuit_name: circuitName 
      })
    });
    
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${circuitName}.qasm`;
      a.click();
      window.URL.revokeObjectURL(url);
      return { success: true };
    }
    
    return { success: false };
  },

  async analyzeEntanglement(gates, numQubits = 2) {
    const response = await fetch(`${API_BASE}/entanglement/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gates, num_qubits: numQubits })
    });
    return response.json();
  }
};
