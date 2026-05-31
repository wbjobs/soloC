import React, { useState } from 'react';

const singleQubitGates = [
  { id: 'H', name: 'Hadamard', symbol: 'H' },
  { id: 'X', name: 'Pauli-X', symbol: 'X' },
  { id: 'Y', name: 'Pauli-Y', symbol: 'Y' },
  { id: 'Z', name: 'Pauli-Z', symbol: 'Z' },
  { id: 'S', name: 'Phase', symbol: 'S' },
  { id: 'T', name: 'T-gate', symbol: 'T' },
];

const twoQubitGates = [
  { id: 'CNOT', name: 'CNOT', symbol: 'CX' },
  { id: 'SWAP', name: 'SWAP', symbol: 'SW' },
];

const QuantumCircuit = ({ numQubits, gates, onAddGate, onRemoveGate, onClearGates, onSimulate, onNumQubitsChange }) => {
  const [dragOverQubit, setDragOverQubit] = useState(null);
  const [controlQubit, setControlQubit] = useState(0);

  const handleDragOver = (e, qubitIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverQubit(qubitIndex);
  };

  const handleDragLeave = () => {
    setDragOverQubit(null);
  };

  const handleDrop = (e, qubitIndex) => {
    e.preventDefault();
    
    const gateType = e.dataTransfer.getData('gateType');
    const isTwoQubit = e.dataTransfer.getData('isTwoQubit') === 'true';

    if (gateType) {
      if (isTwoQubit) {
        if (controlQubit !== qubitIndex) {
          onAddGate({
            type: gateType,
            control_qubit: controlQubit,
            target_qubit: qubitIndex
          });
        }
      } else {
        onAddGate({
          type: gateType,
          target_qubit: qubitIndex
        });
      }
    }
    
    setDragOverQubit(null);
  };

  const getGatesForQubit = (qubitIndex) => {
    return gates.filter(gate => 
      gate.target_qubit === qubitIndex || gate.control_qubit === qubitIndex
    );
  };

  const getGateSymbol = (gate) => {
    if (gate.type === 'CNOT') return 'CX';
    if (gate.type === 'SWAP') return 'SW';
    return gate.type;
  };

  return (
    <div className="circuit-area">
      <h3>量子电路</h3>
      
      <div className="qubit-count-control">
        <label>量子比特数:</label>
        <select 
          value={numQubits} 
          onChange={(e) => onNumQubitsChange(parseInt(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div className="circuit-container">
        {Array.from({ length: numQubits }, (_, qubitIndex) => (
          <div key={qubitIndex} className="qubit-line">
            <div className="qubit-label">q<sub>{qubitIndex}</sub></div>
            <div 
              className={`qubit-wire ${dragOverQubit === qubitIndex ? 'drag-over' : ''}`}
              onDragOver={(e) => handleDragOver(e, qubitIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, qubitIndex)}
            >
              {getGatesForQubit(qubitIndex).map((gate, idx) => (
                <div key={idx} className="gate-slot">
                  <div 
                    className="placed-gate"
                    title="点击删除"
                  >
                    <span className="gate-symbol">
                      {getGateSymbol(gate)}
                    </span>
                    <button 
                      className="remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveGate(gates.indexOf(gate));
                      }}
                    >×</button>
                  </div>
                  {gate.control_qubit !== undefined && (
                    <div className="control-qubit-label">
                      控制: q{gate.control_qubit}
                    </div>
                  )}
                </div>
              ))}
              
              <div 
                className={`drop-zone ${dragOverQubit === qubitIndex ? 'drag-over' : ''}`}
                onDragOver={(e) => handleDragOver(e, qubitIndex)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, qubitIndex)}
              >
                +
              </div>
            </div>
          </div>
        ))}
      </div>

      {numQubits >= 2 && (
        <div className="control-qubit-selector" style={{ marginTop: '20px' }}>
          <label style={{ color: '#aaa', marginRight: '10px' }}>双量子比特门 - 控制比特:</label>
          <div className="qubit-selector">
            {Array.from({ length: numQubits }, (_, i) => (
              <button
                key={i}
                className={`qubit-btn ${controlQubit === i ? 'active' : ''}`}
                onClick={() => setControlQubit(i)}
              >
                q{i}
              </button>
            ))}
          </div>
          <div style={{ marginTop: '10px', color: '#888', fontSize: '0.9rem' }}>
            提示: 先选择控制比特，然后将双量子比特门拖放到目标比特上
          </div>
        </div>
      )}

      <div className="controls">
        <button className="btn btn-primary" onClick={onSimulate}>
          运行模拟
        </button>
        <button className="btn btn-danger" onClick={onClearGates}>
          清空电路
        </button>
      </div>
    </div>
  );
};

export { singleQubitGates, twoQubitGates };
export default QuantumCircuit;
