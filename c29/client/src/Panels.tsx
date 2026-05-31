import { useState, useEffect, useCallback } from 'react';
import { Activity, Thermometer, Gauge, Wind, Zap, Settings, AlertTriangle, AlertCircle, Package, Box, RotateCcw, Play, Pause, SkipBack, SkipForward, Clock, History, Download } from 'lucide-react';
import { useStore, useAnimationState, useReplayState, useHistory } from './store';
import { THRESHOLDS, DeviceData } from './types';

function getStatus(value: number, threshold: typeof THRESHOLDS['temperature']): 'normal' | 'warning' | 'critical' {
  if (value > threshold.max || value < threshold.min) return 'critical';
  if (value > threshold.warning) return 'warning';
  return 'normal';
}

function getProgress(value: number, threshold: typeof THRESHOLDS['temperature']): number {
  const range = threshold.max - threshold.min;
  return Math.min(100, Math.max(0, ((value - threshold.min) / range) * 100));
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function DataPanel() {
  const { data } = useStore();

  if (!data) {
    return (
      <div className="data-panel">
        <h2><Activity size={16} /> 实时数据</h2>
        <div className="no-alarms">等待数据...</div>
      </div>
    );
  }

  const tempStatus = getStatus(data.temperature, THRESHOLDS.temperature);
  const pressStatus = getStatus(data.pressure, THRESHOLDS.pressure);
  const speedStatus = getStatus(data.speed, THRESHOLDS.speed);

  return (
    <div className="data-panel">
      <h2><Activity size={16} /> 实时数据</h2>
      
      <div className="metric-item">
        <div className="metric-label">
          <span className="metric-name"><Thermometer size={14} style={{ display: 'inline', marginRight: 4 }} /> 温度</span>
          <span className="metric-sub">阈值: {THRESHOLDS.temperature.min}-{THRESHOLDS.temperature.max}°C</span>
        </div>
        <div className="metric-value">
          <span className={`value-text ${tempStatus}`}>
            {data.temperature.toFixed(1)}°C
          </span>
          <div className="progress-bar">
            <div 
              className={`progress-fill ${tempStatus}`} 
              style={{ width: `${getProgress(data.temperature, THRESHOLDS.temperature)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="metric-item">
        <div className="metric-label">
          <span className="metric-name"><Gauge size={14} style={{ display: 'inline', marginRight: 4 }} /> 压力</span>
          <span className="metric-sub">阈值: {THRESHOLDS.pressure.min}-{THRESHOLDS.pressure.max} MPa</span>
        </div>
        <div className="metric-value">
          <span className={`value-text ${pressStatus}`}>
            {data.pressure.toFixed(2)} MPa
          </span>
          <div className="progress-bar">
            <div 
              className={`progress-fill ${pressStatus}`} 
              style={{ width: `${getProgress(data.pressure, THRESHOLDS.pressure)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="metric-item">
        <div className="metric-label">
          <span className="metric-name"><Wind size={14} style={{ display: 'inline', marginRight: 4 }} /> 转速</span>
          <span className="metric-sub">阈值: {THRESHOLDS.speed.min}-{THRESHOLDS.speed.max} RPM</span>
        </div>
        <div className="metric-value">
          <span className={`value-text ${speedStatus}`}>
            {data.speed} RPM
          </span>
          <div className="progress-bar">
            <div 
              className={`progress-fill ${speedStatus}`} 
              style={{ width: `${getProgress(data.speed, THRESHOLDS.speed)}%` }}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="metric-sub">设备状态</span>
        <span className={`status-indicator ${data.isRunning ? 'running' : 'stopped'}`}>
          <Zap size={12} />
          {data.isRunning ? '运行中' : '已停止'}
        </span>
      </div>
    </div>
  );
}

export function ControlPanel() {
  const { data, sendControl } = useStore();
  const [tempValue, setTempValue] = useState('');
  const [pressValue, setPressValue] = useState('');
  const [speedValue, setSpeedValue] = useState('');

  useEffect(() => {
    if (data) {
      setTempValue(data.temperature.toFixed(1));
      setPressValue(data.pressure.toFixed(2));
      setSpeedValue(data.speed.toString());
    }
  }, [data?.temperature, data?.pressure, data?.speed]);

  return (
    <div className="control-panel">
      <h2><Settings size={16} /> 设备控制</h2>

      <div className="control-group">
        <label className="control-label">电源控制</label>
        <button
          className={`btn ${data?.isRunning ? 'btn-danger' : 'btn-success'}`}
          onClick={() => sendControl('toggle')}
        >
          {data?.isRunning ? '停止设备' : '启动设备'}
        </button>
      </div>

      <div className="control-group">
        <label className="control-label">运行模式</label>
        <div className="mode-buttons">
          <button
            className={`mode-btn ${data?.operationMode === 'normal' ? 'active' : ''}`}
            onClick={() => sendControl('setMode', 'normal')}
          >
            正常
          </button>
          <button
            className={`mode-btn ${data?.operationMode === 'warning' ? 'active' : ''}`}
            onClick={() => sendControl('setMode', 'warning')}
          >
            波动
          </button>
          <button
            className={`mode-btn ${data?.operationMode === 'critical' ? 'active' : ''}`}
            onClick={() => sendControl('setMode', 'critical')}
          >
            极限
          </button>
        </div>
      </div>

      <div className="control-group">
        <label className="control-label">手动设置温度 (°C)</label>
        <div className="control-row">
          <input
            type="number"
            className="control-input"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
          />
          <button
            className="btn btn-primary"
            onClick={() => sendControl('setTemperature', tempValue)}
          >
            设置
          </button>
        </div>
      </div>

      <div className="control-group">
        <label className="control-label">手动设置压力 (MPa)</label>
        <div className="control-row">
          <input
            type="number"
            step="0.1"
            className="control-input"
            value={pressValue}
            onChange={(e) => setPressValue(e.target.value)}
          />
          <button
            className="btn btn-primary"
            onClick={() => sendControl('setPressure', pressValue)}
          >
            设置
          </button>
        </div>
      </div>

      <div className="control-group">
        <label className="control-label">手动设置转速 (RPM)</label>
        <div className="control-row">
          <input
            type="number"
            className="control-input"
            value={speedValue}
            onChange={(e) => setSpeedValue(e.target.value)}
          />
          <button
            className="btn btn-primary"
            onClick={() => sendControl('setSpeed', speedValue)}
          >
            设置
          </button>
        </div>
      </div>
    </div>
  );
}

export function AnimationPanel() {
  const animationState = useAnimationState();
  const playDisassemble = useStore((state) => state.playDisassemble);
  const playAssemble = useStore((state) => state.playAssemble);

  const getStatusText = () => {
    switch (animationState) {
      case 'idle': return '设备已组装';
      case 'disassembling': return '正在拆解...';
      case 'disassembled': return '设备已拆解';
      case 'assembling': return '正在组装...';
      case 'replaying': return '历史回放中';
      default: return '未知';
    }
  };

  const getStatusColor = () => {
    switch (animationState) {
      case 'idle': return '#22c55e';
      case 'disassembling': return '#f59e0b';
      case 'disassembled': return '#60a5fa';
      case 'assembling': return '#f59e0b';
      case 'replaying': return '#a78bfa';
      default: return '#64748b';
    }
  };

  const canDisassemble = animationState === 'idle';
  const canAssemble = animationState === 'disassembled';
  const isAnimating = animationState === 'disassembling' || animationState === 'assembling';

  return (
    <div className="animation-panel">
      <h2><Box size={16} /> 设备拆解</h2>

      <div className="status-row">
        <span className="control-label">当前状态</span>
        <span 
          className="status-indicator"
          style={{ 
            background: `${getStatusColor()}20`,
            color: getStatusColor()
          }}
        >
          <Package size={12} />
          {getStatusText()}
        </span>
      </div>

      <div className="animation-buttons">
        <button
          className={`btn ${canDisassemble ? 'btn-primary' : 'btn-secondary'}`}
          onClick={playDisassemble}
          disabled={!canDisassemble || isAnimating}
          style={{ opacity: canDisassemble ? 1 : 0.5, cursor: canDisassemble ? 'pointer' : 'not-allowed' }}
        >
          <Box size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          拆解
        </button>
        <button
          className={`btn ${canAssemble ? 'btn-primary' : 'btn-secondary'}`}
          onClick={playAssemble}
          disabled={!canAssemble || isAnimating}
          style={{ opacity: canAssemble ? 1 : 0.5, cursor: canAssemble ? 'pointer' : 'not-allowed' }}
        >
          <RotateCcw size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          组装
        </button>
      </div>

      <div className="animation-tip">
        <span style={{ color: '#64748b', fontSize: 11 }}>
          💡 点击拆解按钮可将设备部件分散显示，便于观察各部件状态
        </span>
      </div>
    </div>
  );
}

export function HistoryReplayPanel() {
  const replayState = useReplayState();
  const history = useHistory();
  const loadHistory = useStore((state) => state.loadHistory);
  const startReplay = useStore((state) => state.startReplay);
  const stopReplay = useStore((state) => state.stopReplay);
  const setReplayIndex = useStore((state) => state.setReplayIndex);
  const setReplaySpeed = useStore((state) => state.setReplaySpeed);
  const { data } = useStore();

  const [loadedHistory, setLoadedHistory] = useState<DeviceData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedHours, setSelectedHours] = useState('1');

  const handleGenerateHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/history/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: parseInt(selectedHours), interval: 60 })
      });
      if (response.ok) {
        const result = await response.json();
        console.log(`Generated ${result.generated} records`);
      }
    } catch (error) {
      console.error('Failed to generate history:', error);
    }
  }, [selectedHours]);

  const handleLoadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const hours = parseInt(selectedHours);
      const endTime = new Date().toISOString();
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      
      const data = await loadHistory(startTime, endTime);
      setLoadedHistory(data);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedHours, loadHistory]);

  const handleStartReplay = useCallback(() => {
    if (loadedHistory.length > 0) {
      startReplay(loadedHistory);
    }
  }, [loadedHistory, startReplay]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const index = parseInt(e.target.value);
    setReplayIndex(index);
  }, [setReplayIndex]);

  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setReplaySpeed(parseFloat(e.target.value));
  }, [setReplaySpeed]);

  const currentReplayData = replayState.isReplaying && replayState.historyData[replayState.currentIndex];

  return (
    <div className="history-panel">
      <h2><History size={16} /> 历史数据回放</h2>

      {!replayState.isReplaying ? (
        <>
          <div className="control-group">
            <label className="control-label">
              <Download size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              生成/加载历史数据
            </label>
            <div className="control-row">
              <select 
                className="control-input"
                value={selectedHours}
                onChange={(e) => setSelectedHours(e.target.value)}
              >
                <option value="0.5">30 分钟</option>
                <option value="1">1 小时</option>
                <option value="2">2 小时</option>
                <option value="4">4 小时</option>
                <option value="8">8 小时</option>
                <option value="24">24 小时</option>
              </select>
            </div>
            <div className="control-row" style={{ marginTop: 8 }}>
              <button
                className="btn btn-secondary"
                onClick={handleGenerateHistory}
                disabled={isLoading}
                style={{ flex: 1 }}
              >
                生成模拟数据
              </button>
              <button
                className="btn btn-primary"
                onClick={handleLoadHistory}
                disabled={isLoading}
                style={{ flex: 1 }}
              >
                {isLoading ? '加载中...' : '加载数据'}
              </button>
            </div>
          </div>

          {loadedHistory.length > 0 && (
            <>
              <div className="control-group">
                <label className="control-label">
                  已加载 {loadedHistory.length} 条记录
                  <br />
                  <span style={{ color: '#64748b', fontSize: 10 }}>
                    {loadedHistory.length > 0 && formatDateTime(loadedHistory[0].timestamp)} ~ {loadedHistory.length > 0 && formatDateTime(loadedHistory[loadedHistory.length - 1].timestamp)}
                  </span>
                </label>
                <button
                  className="btn btn-success"
                  onClick={handleStartReplay}
                  style={{ width: '100%', marginTop: 8 }}
                >
                  <Play size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  开始回放
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="control-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="control-label">
                <Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                回放进度
              </span>
              <select 
                className="control-input"
                value={replayState.speed}
                onChange={handleSpeedChange}
                style={{ width: 80, padding: '4px 8px', fontSize: 12 }}
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={5}>5x</option>
                <option value={10}>10x</option>
              </select>
            </div>
            
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
              {currentReplayData ? formatDateTime(currentReplayData.timestamp) : '--'}
            </div>
            
            <input
              type="range"
              min={0}
              max={replayState.historyData.length - 1}
              value={replayState.currentIndex}
              onChange={handleSliderChange}
              style={{ width: '100%', height: 6, background: '#334155', borderRadius: 3, appearance: 'none' }}
            />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginTop: 4 }}>
              <span>{replayState.currentIndex + 1}</span>
              <span>/</span>
              <span>{replayState.historyData.length}</span>
            </div>
          </div>

          <div className="control-group">
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setReplayIndex(0)}
                style={{ flex: 1, padding: '8px' }}
              >
                <SkipBack size={16} />
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setReplayIndex(Math.max(0, replayState.currentIndex - 1))}
                style={{ flex: 1, padding: '8px' }}
              >
                <SkipBack size={16} />
              </button>
              <button
                className="btn btn-danger"
                onClick={stopReplay}
                style={{ flex: 2, padding: '8px' }}
              >
                <Pause size={16} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                停止
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setReplayIndex(Math.min(replayState.historyData.length - 1, replayState.currentIndex + 1))}
                style={{ flex: 1, padding: '8px' }}
              >
                <SkipForward size={16} />
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setReplayIndex(replayState.historyData.length - 1)}
                style={{ flex: 1, padding: '8px' }}
              >
                <SkipForward size={16} />
              </button>
            </div>
          </div>

          {currentReplayData && (
            <div style={{ 
              background: 'rgba(167, 139, 250, 0.1)', 
              border: '1px solid rgba(167, 139, 250, 0.3)',
              borderRadius: 8,
              padding: 12,
              fontSize: 12
            }}>
              <div style={{ color: '#a78bfa', fontWeight: 600, marginBottom: 8 }}>
                回放当前状态
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <span style={{ color: '#64748b' }}>温度: </span>
                  <span style={{ fontFamily: 'monospace' }}>{currentReplayData.temperature.toFixed(1)}°C</span>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>压力: </span>
                  <span style={{ fontFamily: 'monospace' }}>{currentReplayData.pressure.toFixed(2)} MPa</span>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>转速: </span>
                  <span style={{ fontFamily: 'monospace' }}>{currentReplayData.speed} RPM</span>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>告警: </span>
                  <span style={{ color: currentReplayData.alarms.length > 0 ? '#ef4444' : '#22c55e' }}>
                    {currentReplayData.alarms.length > 0 ? `${currentReplayData.alarms.length} 条` : '正常'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function AlarmPanel() {
  const { alarms } = useStore();

  return (
    <div className="alarm-panel">
      <h2>
        {alarms.some(a => a.level === 'critical') ? (
          <AlertCircle size={16} color="#ef4444" />
        ) : alarms.some(a => a.level === 'warning') ? (
          <AlertTriangle size={16} color="#f59e0b" />
        ) : (
          <Activity size={16} color="#22c55e" />
        )}
        告警信息 {alarms.length > 0 && `(${alarms.length})`}
      </h2>

      {alarms.length === 0 ? (
        <div className="no-alarms">
          <div style={{ marginBottom: 8 }}>✓ 设备运行正常</div>
          <div style={{ fontSize: 11 }}>暂无告警</div>
        </div>
      ) : (
        <div className="alarm-list">
          {alarms
            .sort((a, b) => (a.level === 'critical' ? -1 : 1))
            .map((alarm, index) => (
              <div key={index} className={`alarm-item ${alarm.level}`}>
                <div className="alarm-icon">
                  {alarm.level === 'critical' ? (
                    <AlertCircle size={18} color="#ef4444" />
                  ) : (
                    <AlertTriangle size={18} color="#f59e0b" />
                  )}
                </div>
                <div className="alarm-content">
                  <div className="alarm-title">
                    {alarm.level === 'critical' ? '严重告警' : '警告'} - {alarm.part.toUpperCase()}
                  </div>
                  <div className="alarm-message">{alarm.message}</div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
