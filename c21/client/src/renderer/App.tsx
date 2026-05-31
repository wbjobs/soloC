import React, { useState, useEffect, useCallback } from 'react';
import { AppConfig, HistoryRecord, DeviceInfo } from '../shared/types';

const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isClipboardActive, setIsClipboardActive] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard');
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
    loadStatus();
    loadHistory();
    setupListeners();
  }, []);

  const loadConfig = async () => {
    const cfg = await window.electronAPI.getConfig();
    setConfig(cfg);
  };

  const loadStatus = async () => {
    const status = await window.electronAPI.getServerStatus();
    setIsConnected(status.connected);
    setDevices(status.devices);

    const clipboardStatus = await window.electronAPI.getClipboardStatus();
    setIsClipboardActive(clipboardStatus.active);
  };

  const loadHistory = async () => {
    const hist = await window.electronAPI.getHistory(100);
    setHistory(hist);
  };

  const setupListeners = () => {
    window.electronAPI.onClipboardReceived((data) => {
      showNotification(`从 ${data.fromDeviceName || '其他设备'} 收到剪贴板内容`);
      loadHistory();
    });

    window.electronAPI.onDevicesUpdate((devices) => {
      setDevices(devices);
    });

    window.electronAPI.onClipboardChange((content) => {
      loadHistory();
    });
  };

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleConnect = async () => {
    const result = await window.electronAPI.connectServer();
    if (result.success) {
      setIsConnected(true);
      showNotification('已连接到服务器');
      loadStatus();
    } else {
      showNotification(`连接失败: ${result.error}`);
    }
  };

  const handleDisconnect = async () => {
    await window.electronAPI.disconnectServer();
    setIsConnected(false);
    showNotification('已断开连接');
    loadStatus();
  };

  const handleToggleClipboard = async () => {
    const result = await window.electronAPI.toggleClipboard();
    setIsClipboardActive(result.active);
    showNotification(result.active ? '剪贴板监听已启用' : '剪贴板监听已禁用');
  };

  const handleSaveConfig = async (newConfig: Partial<AppConfig>) => {
    const updated = await window.electronAPI.setConfig(newConfig);
    setConfig(updated);
    showNotification('配置已保存');
  };

  const handleDeleteHistory = async (id: number) => {
    await window.electronAPI.deleteHistory(id);
    loadHistory();
    showNotification('记录已删除');
  };

  const handleClearOldHistory = async () => {
    const result = await window.electronAPI.clearOldHistory(30);
    loadHistory();
    showNotification(`已清除 ${result.count} 条旧记录`);
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      {notification && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          background: '#4CAF50',
          color: 'white',
          padding: '12px 24px',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000
        }}>
          {notification}
        </div>
      )}

      <header style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>📋 Clipboard Sync</h1>
          <p style={{ margin: 0, opacity: 0.8, fontSize: 14 }}>跨端剪贴板同步工具</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{
            padding: '6px 12px',
            background: isConnected ? '#4CAF50' : '#f44336',
            borderRadius: 20,
            fontSize: 12
          }}>
            {isConnected ? '✓ 已连接' : '✗ 未连接'}
          </span>
          <span style={{
            padding: '6px 12px',
            background: isClipboardActive ? '#4CAF50' : '#ff9800',
            borderRadius: 20,
            fontSize: 12
          }}>
            {isClipboardActive ? '✓ 监听中' : '○ 未监听'}
          </span>
        </div>
      </header>

      <nav style={{
        background: 'white',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex'
      }}>
        {(['dashboard', 'history', 'settings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '15px 25px',
              border: 'none',
              background: activeTab === tab ? '#667eea' : 'transparent',
              color: activeTab === tab ? 'white' : '#666',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: activeTab === tab ? 600 : 400
            }}
          >
            {tab === 'dashboard' ? '📊 仪表板' : tab === 'history' ? '📜 历史记录' : '⚙️ 设置'}
          </button>
        ))}
      </nav>

      <main style={{ padding: 20 }}>
        {activeTab === 'dashboard' && config && (
          <Dashboard
            config={config}
            devices={devices}
            isConnected={isConnected}
            isClipboardActive={isClipboardActive}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onToggleClipboard={handleToggleClipboard}
          />
        )}

        {activeTab === 'history' && (
          <History
            history={history}
            onDelete={handleDeleteHistory}
            onClearOld={handleClearOldHistory}
            formatTime={formatTime}
          />
        )}

        {activeTab === 'settings' && config && (
          <Settings
            config={config}
            onSave={handleSaveConfig}
          />
        )}
      </main>
    </div>
  );
};

const Dashboard: React.FC<{
  config: AppConfig;
  devices: DeviceInfo[];
  isConnected: boolean;
  isClipboardActive: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleClipboard: () => void;
}> = ({ config, devices, isConnected, isClipboardActive, onConnect, onDisconnect, onToggleClipboard }) => {
  return (
    <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(2, 1fr)' }}>
      <Card title="🔌 连接状态">
        <div style={{ marginBottom: 15 }}>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 5 }}>服务器</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{config.serverUrl}</div>
        </div>
        <div style={{ marginBottom: 15 }}>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 5 }}>设备名称</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{config.deviceName}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          {isConnected ? (
            <button onClick={onDisconnect} style={styles.dangerButton}>
              断开连接
            </button>
          ) : (
            <button onClick={onConnect} style={styles.primaryButton}>
              连接服务器
            </button>
          )}
          <button onClick={onToggleClipboard} style={styles.secondaryButton}>
            {isClipboardActive ? '停止监听' : '开始监听'}
          </button>
        </div>
      </Card>

      <Card title="🖥️ 在线设备">
        {devices.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: 30 }}>暂无设备</p>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {devices.map(device => (
              <div key={device.deviceId} style={{
                padding: 12,
                borderBottom: '1px solid #eee',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{device.deviceName}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {device.deviceId.substring(0, 12)}...
                  </div>
                </div>
                <span style={{
                  padding: '4px 10px',
                  background: device.isOnline ? '#E8F5E9' : '#FFECB3',
                  color: device.isOnline ? '#4CAF50' : '#FF9800',
                  borderRadius: 12,
                  fontSize: 12
                }}>
                  {device.isOnline ? '在线' : '离线'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="💡 使用说明" style={{ gridColumn: 'span 2' }}>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>客户端会自动监听剪贴板变化，将文本和图片内容同步到其他设备</li>
          <li>接收到的内容会自动写入本地剪贴板，并保存到历史记录</li>
          <li>所有数据在传输前进行 AES 加密，确保安全性</li>
          <li>只有绑定到同一用户的设备才能互相同步</li>
        </ul>
      </Card>
    </div>
  );
};

const History: React.FC<{
  history: HistoryRecord[];
  onDelete: (id: number) => void;
  onClearOld: () => void;
  formatTime: (ts: number) => string;
}> = ({ history, onDelete, onClearOld, formatTime }) => {
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>剪贴板历史</h2>
        <button onClick={onClearOld} style={styles.dangerButton}>
          清除30天前的记录
        </button>
      </div>

      {history.length === 0 ? (
        <p style={{ color: '#999', textAlign: 'center', padding: 50 }}>暂无历史记录</p>
      ) : (
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          {history.map(item => (
            <div key={item.id} style={{
              padding: 15,
              borderBottom: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 15
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 5 }}>
                  <span style={{
                    padding: '2px 8px',
                    background: item.type === 'text' ? '#E3F2FD' : '#FFF3E0',
                    color: item.type === 'text' ? '#1976D2' : '#F57C00',
                    borderRadius: 8,
                    fontSize: 12
                  }}>
                    {item.type === 'text' ? '文本' : '图片'}
                  </span>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    来自 {item.fromDeviceName || '未知'}
                  </span>
                  <span style={{ fontSize: 12, color: '#999' }}>
                    {formatTime(item.timestamp)}
                  </span>
                </div>
                <div style={{
                  fontSize: 14,
                  color: '#333',
                  wordBreak: 'break-all',
                  maxHeight: item.type === 'image' ? 80 : 60,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {item.type === 'image' ? (
                    <img src={item.data} style={{ maxHeight: 80, maxWidth: 200 }} alt="clipboard" />
                  ) : (
                    item.data.substring(0, 200)
                  )}
                </div>
              </div>
              <button
                onClick={() => onDelete(item.id)}
                style={{
                  padding: '6px 12px',
                  background: '#ffebee',
                  border: 'none',
                  borderRadius: 6,
                  color: '#c62828',
                  cursor: 'pointer',
                  height: 'fit-content'
                }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Settings: React.FC<{
  config: AppConfig;
  onSave: (config: Partial<AppConfig>) => void;
}> = ({ config, onSave }) => {
  const [formData, setFormData] = useState(config);

  const handleChange = (field: keyof AppConfig, value: string | boolean) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSubmit = () => {
    onSave(formData);
  };

  return (
    <div style={{ background: 'white', borderRadius: 12, padding: 20 }}>
      <h2 style={{ margin: 0, marginBottom: 20, fontSize: 18 }}>应用设置</h2>

      <div style={{ display: 'grid', gap: 20, maxWidth: 600 }}>
        <div>
          <label style={styles.label}>服务器地址</label>
          <input
            type="text"
            value={formData.serverUrl}
            onChange={(e) => handleChange('serverUrl', e.target.value)}
            style={styles.input}
            placeholder="ws://localhost:3001"
          />
        </div>

        <div>
          <label style={styles.label}>设备名称</label>
          <input
            type="text"
            value={formData.deviceName}
            onChange={(e) => handleChange('deviceName', e.target.value)}
            style={styles.input}
          />
        </div>

        <div>
          <label style={styles.label}>用户 ID</label>
          <input
            type="text"
            value={formData.userId || ''}
            onChange={(e) => handleChange('userId', e.target.value)}
            style={styles.input}
            placeholder="从服务端获取"
          />
        </div>

        <div>
          <label style={styles.label}>访问令牌 (Token)</label>
          <input
            type="password"
            value={formData.token || ''}
            onChange={(e) => handleChange('token', e.target.value)}
            style={styles.input}
            placeholder="从服务端获取"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            id="autoSync"
            checked={formData.autoSync}
            onChange={(e) => handleChange('autoSync', e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor="autoSync" style={{ fontSize: 14 }}>自动同步剪贴板</label>
        </div>

        <div>
          <label style={styles.label}>加密密钥</label>
          <input
            type="text"
            value={formData.encryptionKey || ''}
            disabled
            style={{ ...styles.input, background: '#f5f5f5', cursor: 'not-allowed' }}
          />
          <p style={{ fontSize: 12, color: '#999', marginTop: 5 }}>
            自动生成，用于加密传输的数据
          </p>
        </div>

        <button onClick={handleSubmit} style={{ ...styles.primaryButton, marginTop: 10 }}>
          保存设置
        </button>
      </div>
    </div>
  );
};

const Card: React.FC<{
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ title, children, style }) => (
  <div style={{
    background: 'white',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    ...style
  }}>
    <h3 style={{ margin: 0, marginBottom: 15, fontSize: 16, color: '#333' }}>{title}</h3>
    {children}
  </div>
);

const styles = {
  label: {
    display: 'block' as const,
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: 500
  },
  input: {
    width: '100%',
    padding: 12,
    fontSize: 14,
    border: '1px solid #ddd',
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box' as const
  },
  primaryButton: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: 8,
    color: 'white',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer'
  },
  secondaryButton: {
    padding: '12px 24px',
    background: '#f0f0f0',
    border: 'none',
    borderRadius: 8,
    color: '#333',
    fontSize: 14,
    cursor: 'pointer'
  },
  dangerButton: {
    padding: '12px 24px',
    background: '#f44336',
    border: 'none',
    borderRadius: 8,
    color: 'white',
    fontSize: 14,
    cursor: 'pointer'
  }
};

export default App;
