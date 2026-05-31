import React, { useState, useEffect, useCallback } from 'react';
import { quantumAPI } from './services/api';
import GatePalette from './components/GatePalette';
import QuantumCircuit from './components/QuantumCircuit';
import VisualizationPanel from './components/VisualizationPanel';
import EntanglementVisualization from './components/EntanglementVisualization';

const STORAGE_KEY = 'quantum_simulator_saved_circuits';

function App() {
  const [numQubits, setNumQubits] = useState(2);
  const [gates, setGates] = useState([]);
  const [result, setResult] = useState({
    bloch_vectors: [
      { x: 0, y: 0, z: 1, qubit: 0 },
      { x: 0, y: 0, z: 1, qubit: 1 },
    ],
    probabilities: {},
    state_vector: [],
    entanglement: null
  });
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savedCircuits, setSavedCircuits] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showQASMModal, setShowQASMModal] = useState(false);
  const [circuitName, setCircuitName] = useState('');
  const [qasmCode, setQasmCode] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSavedCircuits(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load saved circuits:', e);
        setSavedCircuits([]);
      }
    }
    initSimulation();
  }, []);

  const initSimulation = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await quantumAPI.simulate([], numQubits);
      setResult(data);
      const stepData = await quantumAPI.simulateStepByStep([], numQubits);
      setHistory(stepData.history);
    } catch (err) {
      setError('无法连接到后端服务器');
    } finally {
      setIsLoading(false);
    }
  }, [numQubits]);

  const handleAddGate = (gate) => {
    setGates([...gates, gate]);
  };

  const handleRemoveGate = (index) => {
    const newGates = gates.filter((_, i) => i !== index);
    setGates(newGates);
  };

  const handleClearGates = () => {
    setGates([]);
    setResult({
      bloch_vectors: Array.from({ length: numQubits }, (_, i) => ({
        x: 0, y: 0, z: 1, qubit: i
      })),
      probabilities: {},
      state_vector: [],
      entanglement: null
    });
    setHistory([]);
  };

  const handleNumQubitsChange = (newNum) => {
    setNumQubits(newNum);
    setGates([]);
    setResult({
      bloch_vectors: Array.from({ length: newNum }, (_, i) => ({
        x: 0, y: 0, z: 1, qubit: i
      })),
      probabilities: {},
      state_vector: [],
      entanglement: null
    });
    setHistory([]);
  };

  const handleSimulate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const stepData = await quantumAPI.simulateStepByStep(gates, numQubits);
      setHistory(stepData.history);

      if (stepData.history.length > 0) {
        setResult(stepData.history[stepData.history.length - 1]);
      }
    } catch (err) {
      setError('模拟失败，请检查后端是否运行');
      console.error('Simulation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCircuit = () => {
    setShowSaveModal(true);
    setCircuitName('');
  };

  const confirmSaveCircuit = () => {
    if (!circuitName.trim()) {
      alert('请输入电路名称');
      return;
    }

    const newCircuit = {
      id: Date.now(),
      name: circuitName.trim(),
      numQubits,
      gates: [...gates],
      createdAt: new Date().toISOString()
    };

    const updatedCircuits = [...savedCircuits, newCircuit];
    setSavedCircuits(updatedCircuits);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCircuits));
    setShowSaveModal(false);
    setCircuitName('');
    alert('电路已保存！');
  };

  const handleLoadCircuit = () => {
    setShowLoadModal(true);
  };

  const loadCircuit = (circuit) => {
    setNumQubits(circuit.numQubits);
    setGates([...circuit.gates]);
    setResult({
      bloch_vectors: Array.from({ length: circuit.numQubits }, (_, i) => ({
        x: 0, y: 0, z: 1, qubit: i
      })),
      probabilities: {},
      state_vector: [],
      entanglement: null
    });
    setHistory([]);
    setShowLoadModal(false);
    alert(`已加载电路: ${circuit.name}`);
  };

  const deleteCircuit = (circuitId) => {
    if (confirm('确定要删除这个电路吗？')) {
      const updatedCircuits = savedCircuits.filter(c => c.id !== circuitId);
      setSavedCircuits(updatedCircuits);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCircuits));
    }
  };

  const exportCircuit = () => {
    const exportData = {
      numQubits,
      gates,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quantum_circuit_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCircuit = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.numQubits && data.gates) {
          setNumQubits(data.numQubits);
          setGates([...data.gates]);
          setResult({
            bloch_vectors: Array.from({ length: data.numQubits }, (_, i) => ({
              x: 0, y: 0, z: 1, qubit: i
            })),
            probabilities: {},
            state_vector: [],
            entanglement: null
          });
          setHistory([]);
          alert('电路导入成功！');
        } else {
          alert('无效的电路文件格式');
        }
      } catch (err) {
        alert('导入失败：无法解析文件');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportQASM = async () => {
    try {
      const response = await quantumAPI.exportQASM(gates, numQubits, 'my_circuit');
      if (response.success) {
        setQasmCode(response.qasm);
        setShowQASMModal(true);
      }
    } catch (err) {
      alert('导出QASM失败，请检查后端是否运行');
      console.error('QASM export error:', err);
    }
  };

  const handleDownloadQASM = async () => {
    try {
      await quantumAPI.downloadQASM(gates, numQubits, circuitName || 'quantum_circuit');
    } catch (err) {
      alert('下载QASM失败，请检查后端是否运行');
      console.error('QASM download error:', err);
    }
  };

  const copyQASMToClipboard = () => {
    navigator.clipboard.writeText(qasmCode).then(() => {
      alert('QASM代码已复制到剪贴板！');
    });
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>⚛️ 量子计算模拟器</h1>
        <p>基于 QuTiP + React + D3.js</p>
        <div className="header-controls">
          <button className="btn btn-secondary" onClick={handleSaveCircuit} title="保存当前电路">
            💾 保存电路
          </button>
          <button className="btn btn-secondary" onClick={handleLoadCircuit} title="加载已保存的电路">
            📂 加载电路
          </button>
          <button className="btn btn-secondary" onClick={handleExportQASM} title="导出为QASM格式">
            📝 导出QASM
          </button>
          <button className="btn btn-secondary" onClick={exportCircuit} title="导出为JSON文件">
            ⬇️ 导出JSON
          </button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }} title="从JSON文件导入">
            ⬆️ 导入
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportCircuit}
            />
          </label>
        </div>
      </header>

      <div className="main-grid">
        <GatePalette />
        <QuantumCircuit
          numQubits={numQubits}
          gates={gates}
          onAddGate={handleAddGate}
          onRemoveGate={handleRemoveGate}
          onClearGates={handleClearGates}
          onSimulate={handleSimulate}
          onNumQubitsChange={handleNumQubitsChange}
        />
        <div className="right-panel">
          <VisualizationPanel
            result={result}
            history={history}
            isLoading={isLoading}
            error={error}
          />
          
          {numQubits >= 2 && (
            <EntanglementVisualization
              entanglement={result.entanglement}
              numQubits={numQubits}
            />
          )}
        </div>
      </div>

      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>保存量子电路</h3>
            <input
              type="text"
              placeholder="输入电路名称..."
              value={circuitName}
              onChange={(e) => setCircuitName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && confirmSaveCircuit()}
              autoFocus
            />
            <div className="modal-controls">
              <button className="btn btn-danger" onClick={() => setShowSaveModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={confirmSaveCircuit}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoadModal && (
        <div className="modal-overlay" onClick={() => setShowLoadModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>加载量子电路</h3>
            {savedCircuits.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#888', padding: '20px' }}>
                暂无已保存的电路
              </p>
            ) : (
              <div className="circuit-list">
                {savedCircuits.map((circuit) => (
                  <div key={circuit.id} className="circuit-item">
                    <div className="circuit-info">
                      <div className="circuit-name">{circuit.name}</div>
                      <div className="circuit-meta">
                        {circuit.numQubits} 量子比特 · {circuit.gates.length} 个门 · 
                        {new Date(circuit.createdAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <div className="circuit-actions">
                      <button 
                        className="btn btn-secondary btn-sm" 
                        onClick={() => loadCircuit(circuit)}
                      >
                        加载
                      </button>
                      <button 
                        className="btn btn-danger btn-sm" 
                        onClick={() => deleteCircuit(circuit.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-controls">
              <button className="btn btn-danger" onClick={() => setShowLoadModal(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {showQASMModal && (
        <div className="modal-overlay" onClick={() => setShowQASMModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <h3>📝 QASM 代码</h3>
            <pre className="qasm-code">
              <code>{qasmCode}</code>
            </pre>
            <div className="modal-controls">
              <button className="btn btn-secondary" onClick={copyQASMToClipboard}>
                📋 复制代码
              </button>
              <button className="btn btn-primary" onClick={handleDownloadQASM}>
                ⬇️ 下载 .qasm 文件
              </button>
              <button className="btn btn-danger" onClick={() => setShowQASMModal(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
