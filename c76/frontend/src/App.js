import React, { useState, useEffect, useCallback } from 'react';
import WebSocketService from './services/WebSocketService';
import BluetoothService from './services/BluetoothService';
import EEGMonitor from './components/EEGMonitor';
import MazeGame from './components/MazeGame';
import SessionCompare from './components/SessionCompare';

const App = () => {
  const [wsConnected, setWsConnected] = useState(false);
  const [btConnected, setBtConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [bandPowers, setBandPowers] = useState({});
  const [attentionScore, setAttentionScore] = useState(50);
  const [rawData, setRawData] = useState([]);
  const [syncMetrics, setSyncMetrics] = useState(null);
  const [sessionName, setSessionName] = useState('');
  const [groupSessionId, setGroupSessionId] = useState('');
  const [participantName, setParticipantName] = useState('参与者1');
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [notification, setNotification] = useState(null);
  const [bufferSize, setBufferSize] = useState(0);
  const [activeTab, setActiveTab] = useState('monitor');
  const [useSimulator, setUseSimulator] = useState(false);

  useEffect(() => {
    WebSocketService.connect();

    WebSocketService.on('connected', () => {
      setWsConnected(true);
      showNotification('WebSocket已连接', 'success');
    });

    WebSocketService.on('disconnected', () => {
      setWsConnected(false);
      showNotification('WebSocket已断开，正在尝试重连...', 'warning');
    });

    WebSocketService.on('reconnecting', (data) => {
      showNotification(`正在重连... (${data.attempt}/${data.maxAttempts})`, 'info');
    });

    WebSocketService.on('reconnect_failed', () => {
      showNotification('重连失败，请刷新页面重试', 'error');
    });

    WebSocketService.on('offline', () => {
      showNotification('处于离线模式，数据已缓存', 'warning');
    });

    WebSocketService.on('buffer_update', (data) => {
      setBufferSize(data.size);
    });

    WebSocketService.on('buffer_flushed', () => {
      showNotification('缓存数据已同步', 'success');
    });

    WebSocketService.on('eeg_processed', (data) => {
      setBandPowers(data.band_powers);
      setAttentionScore(data.attention_score);
      
      if (data.raw_data) {
        setRawData(prev => {
          const newData = [...prev, {
            time: prev.length,
            ch1: data.raw_data[0],
            ch2: data.raw_data[1],
            ch3: data.raw_data[2],
            ch4: data.raw_data[3]
          }];
          return newData.slice(-100);
        });
      }
    });

    WebSocketService.on('session_started', (data) => {
      setIsRecording(true);
      showNotification('会话已开始', 'success');
    });

    WebSocketService.on('session_ended', () => {
      setIsRecording(false);
      showNotification('会话已结束', 'success');
    });

    WebSocketService.on('group_session_created', (data) => {
      setGroupSessionId(data.group_session_id);
      setIsGroupMode(true);
      showNotification(`群组会话已创建: ${data.group_session_id}`, 'success');
    });

    WebSocketService.on('group_session_joined', (data) => {
      setGroupSessionId(data.group_session_id);
      setIsGroupMode(true);
      showNotification('已加入群组会话', 'success');
    });

    WebSocketService.on('participant_joined', (data) => {
      showNotification(`${data.participant_name} 加入了会话`, 'info');
    });

    WebSocketService.on('participant_left', (data) => {
      showNotification('有参与者离开了会话', 'info');
    });

    WebSocketService.on('group_sync_update', (data) => {
      setSyncMetrics(data.metrics);
    });

    WebSocketService.on('error', (data) => {
      showNotification(data.message || '发生错误', 'error');
    });

    return () => {
      WebSocketService.disconnect();
    };
  }, []);

  useEffect(() => {
    BluetoothService.on('connected', () => {
      setBtConnected(true);
      showNotification('蓝牙设备已连接', 'success');
    });

    BluetoothService.on('disconnected', () => {
      setBtConnected(false);
      showNotification('蓝牙设备已断开', 'warning');
    });

    BluetoothService.on('reconnecting', (data) => {
      showNotification(`正在重连蓝牙... (${data.attempt}/${data.maxAttempts})`, 'info');
    });

    BluetoothService.on('eeg_data', (data) => {
      if (isRecording) {
        if (isGroupMode) {
          WebSocketService.sendGroupEEGData(data.channels, attentionScore);
        } else {
          WebSocketService.sendEEGData(data.channels);
        }
      }
    });

    BluetoothService.on('error', (data) => {
      showNotification(data.error, 'error');
    });
  }, [isRecording, isGroupMode, attentionScore]);

  useEffect(() => {
    if (!useSimulator || !isRecording) return;

    const interval = setInterval(() => {
      const data = BluetoothService.simulateData();
      if (isGroupMode) {
        WebSocketService.sendGroupEEGData(data.channels, attentionScore);
      } else {
        WebSocketService.sendEEGData(data.channels);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [useSimulator, isRecording, isGroupMode, attentionScore]);

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleConnectBluetooth = async () => {
    try {
      await BluetoothService.scan();
      await BluetoothService.connect();
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
    }
  };

  const handleStartSession = () => {
    if (!sessionName) {
      showNotification('请输入会话名称', 'warning');
      return;
    }
    WebSocketService.startSession(sessionName);
  };

  const handleEndSession = () => {
    WebSocketService.endSession();
  };

  const handleCreateGroupSession = () => {
    if (!sessionName || !participantName) {
      showNotification('请填写会话名称和参与者名称', 'warning');
      return;
    }
    WebSocketService.createGroupSession(sessionName, participantName);
  };

  const handleJoinGroupSession = () => {
    if (!groupSessionId || !participantName) {
      showNotification('请填写群组ID和参与者名称', 'warning');
      return;
    }
    WebSocketService.joinGroupSession(groupSessionId, participantName);
  };

  const handleLeaveGroupSession = () => {
    WebSocketService.leaveGroupSession();
    setIsGroupMode(false);
    setGroupSessionId('');
    setSyncMetrics(null);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🧠</span>
              <div>
                <h1 className="text-2xl font-bold">EEG 注意力训练系统</h1>
                <p className="text-sm opacity-80">实时脑电监测与注意力训练</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-sm">WebSocket</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${btConnected || useSimulator ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-sm">{useSimulator ? '模拟器' : '蓝牙'}</span>
              </div>
              {bufferSize > 0 && (
                <div className="bg-yellow-500 px-2 py-1 rounded text-xs">
                  缓存: {bufferSize}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white ${
          notification.type === 'success' ? 'bg-green-500' :
          notification.type === 'warning' ? 'bg-yellow-500' :
          notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`}>
          {notification.message}
        </div>
      )}

      <main className="container mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                会话名称
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="输入会话名称..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                参与者名称 (群组模式)
              </label>
              <input
                type="text"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                placeholder="你的名称..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                群组会话ID
              </label>
              <input
                type="text"
                value={groupSessionId}
                onChange={(e) => setGroupSessionId(e.target.value)}
                placeholder="输入群组ID加入..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isGroupMode}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <label className="flex items-center space-x-2 px-3 py-2 bg-gray-100 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={useSimulator}
                onChange={(e) => setUseSimulator(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">使用模拟器</span>
            </label>

            {!useSimulator && (
              <button
                onClick={handleConnectBluetooth}
                disabled={btConnected}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {btConnected ? '已连接' : '连接蓝牙设备'}
              </button>
            )}

            {!isGroupMode ? (
              <>
                <button
                  onClick={handleStartSession}
                  disabled={isRecording || !wsConnected}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isRecording ? '记录中...' : '开始记录'}
                </button>

                <button
                  onClick={handleCreateGroupSession}
                  disabled={isRecording || !wsConnected}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  创建群组会话
                </button>

                <button
                  onClick={handleJoinGroupSession}
                  disabled={isRecording || !wsConnected || !groupSessionId}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  加入群组
                </button>
              </>
            ) : (
              <button
                onClick={handleLeaveGroupSession}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                离开群组
              </button>
            )}

            {isRecording && (
              <button
                onClick={handleEndSession}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                结束记录
              </button>
            )}
          </div>

          {isGroupMode && (
            <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <span className="text-purple-700 text-sm">
                🎯 群组模式已激活 - 会话ID: {groupSessionId}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          {[
            { id: 'monitor', label: '📊 实时监测' },
            { id: 'game', label: '🎮 训练游戏' },
            { id: 'history', label: '📈 历史对比' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {activeTab === 'monitor' && (
              <EEGMonitor
                bandPowers={bandPowers}
                attentionScore={attentionScore}
                rawData={rawData}
                syncMetrics={syncMetrics}
              />
            )}
            
            {activeTab === 'game' && (
              <MazeGame
                attentionScore={attentionScore}
                isActive={isRecording}
              />
            )}
            
            {activeTab === 'history' && (
              <SessionCompare />
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 shadow-md">
              <h3 className="text-lg font-semibold mb-3">💡 使用说明</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• 启用模拟器或连接蓝牙EEG设备</li>
                <li>• 输入会话名称并点击"开始记录"</li>
                <li>• 在"训练游戏"中进行注意力训练</li>
                <li>• 在"历史对比"中查看历史数据</li>
                <li>• 创建群组会话可进行多人同步分析</li>
              </ul>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-md">
              <h3 className="text-lg font-semibold mb-3">📚 频带说明</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-purple-600">Delta (0.5-4Hz)</span>
                  <span>深度睡眠</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-indigo-600">Theta (4-8Hz)</span>
                  <span>困倦、冥想</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cyan-600">Alpha (8-13Hz)</span>
                  <span>放松、闭眼</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">Beta (13-30Hz)</span>
                  <span>清醒、专注</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-600">Gamma (30-50Hz)</span>
                  <span>高度集中</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-md">
              <h3 className="text-lg font-semibold mb-3">🔄 同步指标</h3>
              <div className="text-sm text-gray-600">
                <p className="mb-2"><strong>PLV (Phase Locking Value)</strong>: 衡量多人大脑活动的同步程度</p>
                <p className="text-xs text-gray-500">
                  数值越高表示群体注意力同步性越强，适用于团队协作训练
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-gray-800 text-white py-4 mt-8">
        <div className="container mx-auto px-4 text-center text-sm text-gray-400">
          EEG 注意力训练系统 - 基于Web Bluetooth和WebSocket的实时脑电分析平台
        </div>
      </footer>
    </div>
  );
};

export default App;
