import { useEffect } from 'react';
import { Cpu } from 'lucide-react';
import { useStore } from './store';
import ThreeScene from './ThreeScene';
import { DataPanel, ControlPanel, AlarmPanel, AnimationPanel, HistoryReplayPanel } from './Panels';

function App() {
  const { connected, connect, disconnect } = useStore();

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="header">
          <h1><Cpu size={20} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} /> 工业设备数字孪生平台</h1>
          <div className="connection-status">
            <span className={`status-dot ${connected ? 'connected' : ''}`} />
            <span style={{ color: connected ? '#22c55e' : '#64748b' }}>
              {connected ? 'WebSocket 已连接' : 'WebSocket 未连接'}
            </span>
          </div>
        </div>

        <DataPanel />
        <AnimationPanel />
        <HistoryReplayPanel />
        <ControlPanel />
        <AlarmPanel />
      </div>

      <ThreeScene />
    </div>
  );
}

export default App;
