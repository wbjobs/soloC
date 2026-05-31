import React from 'react';

const singleQubitGates = [
  { id: 'H', name: 'Hadamard', symbol: 'H', description: '创建叠加态' },
  { id: 'X', name: 'Pauli-X', symbol: 'X', description: '量子非门' },
  { id: 'Y', name: 'Pauli-Y', symbol: 'Y', description: 'Y轴旋转' },
  { id: 'Z', name: 'Pauli-Z', symbol: 'Z', description: 'Z轴旋转' },
  { id: 'S', name: 'Phase', symbol: 'S', description: '相位门(π/2)' },
  { id: 'T', name: 'T-gate', symbol: 'T', description: 'T门(π/4)' },
];

const twoQubitGates = [
  { id: 'CNOT', name: 'CNOT', symbol: 'CX', description: '受控非门' },
  { id: 'SWAP', name: 'SWAP', symbol: 'SW', description: '交换门' },
];

const GatePalette = () => {
  const handleDragStart = (e, gate, isTwoQubit) => {
    e.dataTransfer.setData('gateType', gate.id);
    e.dataTransfer.setData('isTwoQubit', isTwoQubit);
    e.dataTransfer.setData('gateName', gate.name);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="sidebar">
      <h3>量子门</h3>
      
      <div className="gate-category">
        <h4 style={{ color: '#aaa', marginBottom: '10px', fontSize: '0.9rem' }}>单量子比特门</h4>
        <div className="gate-list">
          {singleQubitGates.map(gate => (
            <div
              key={gate.id}
              className="gate-item"
              draggable
              onDragStart={(e) => handleDragStart(e, gate, false)}
              title={gate.description}
            >
              <div className="gate-symbol">{gate.symbol}</div>
              <div className="gate-name">{gate.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="gate-category">
        <h4 style={{ color: '#aaa', marginBottom: '10px', fontSize: '0.9rem' }}>双量子比特门</h4>
        <div className="gate-list">
          {twoQubitGates.map(gate => (
            <div
              key={gate.id}
              className="gate-item"
              style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}
              draggable
              onDragStart={(e) => handleDragStart(e, gate, true)}
              title={gate.description}
            >
              <div className="gate-symbol">{gate.symbol}</div>
              <div className="gate-name">{gate.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="gate-category">
        <h4 style={{ color: '#aaa', marginBottom: '10px', fontSize: '0.9rem' }}>使用说明</h4>
        <div style={{ color: '#888', fontSize: '0.85rem', lineHeight: '1.6' }}>
          <p>1. 从左侧拖拽量子门到电路中的量子比特线上</p>
          <p>2. 对于双量子比特门，先选择控制比特</p>
          <p>3. 点击已放置的门可以删除</p>
          <p>4. 点击"运行模拟"查看量子态</p>
        </div>
      </div>
    </div>
  );
};

export default GatePalette;
