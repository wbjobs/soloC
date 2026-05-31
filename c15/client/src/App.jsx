import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { createWebRTCManager } from './utils/webrtc.js';
import { formatFileSize, formatSpeed } from './utils/fileUtils.js';

const SOCKET_URL = 'http://localhost:3001';

const BANDWIDTH_OPTIONS = [
  { label: '无限制（最快）', value: 0 },
  { label: '1 MB/s', value: 1 * 1024 * 1024 },
  { label: '2 MB/s', value: 2 * 1024 * 1024 },
  { label: '5 MB/s', value: 5 * 1024 * 1024 },
  { label: '10 MB/s', value: 10 * 1024 * 1024 },
  { label: '500 KB/s', value: 500 * 1024 },
  { label: '100 KB/s', value: 100 * 1024 },
];

function App() {
  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [isRoomCreated, setIsRoomCreated] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected');
  
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [completedFiles, setCompletedFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  
  const [incomingFile, setIncomingFile] = useState(null);
  const [transferProgress, setTransferProgress] = useState(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [allFilesCompleted, setAllFilesCompleted] = useState(false);
  
  const [bandwidthLimit, setBandwidthLimit] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const webrtcManagerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.cleanup();
      }
    };
  }, []);

  const setupWebRTCCallbacks = useCallback((manager) => {
    manager.setCallbacks({
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        
        if (state === 'disconnected' || state === 'failed') {
          if (isTransferring) {
            setIsPaused(true);
            setErrorMessage('连接断开，传输已暂停');
          }
        }
      },
      onFileInfo: (fileInfo, batchInfo) => {
        setIncomingFile(fileInfo);
        if (batchInfo) {
          setCurrentFileIndex(batchInfo.currentFileIndex);
          setTotalFiles(batchInfo.totalFiles);
        }
        setIsTransferring(true);
        setIsPaused(false);
        setAllFilesCompleted(false);
        setTransferProgress({
          received: 0,
          total: fileInfo.size,
          avgSpeed: 0,
          currentSpeed: 0
        });
      },
      onOverallProgress: (info) => {
        setCurrentFileIndex(info.currentFileIndex);
        setTotalFiles(info.totalFiles);
      },
      onProgress: (stats) => {
        setTransferProgress(stats);
        if (stats.currentFileIndex !== undefined) {
          setCurrentFileIndex(stats.currentFileIndex);
          setTotalFiles(stats.totalFiles);
        }
      },
      onFileComplete: (result) => {
        setCompletedFiles(prev => [...prev, result]);
        
        if (result.isSender) {
          setSelectedFiles(prev => {
            const newFiles = [...prev];
            if (newFiles[result.currentFileIndex]) {
              newFiles[result.currentFileIndex] = { ...newFiles[result.currentFileIndex], completed: true };
            }
            return newFiles;
          });
        }
      },
      onAllFilesComplete: () => {
        setAllFilesCompleted(true);
        setIsTransferring(false);
        setIsPaused(false);
        setTransferProgress(null);
        setIncomingFile(null);
        setErrorMessage('');
      },
      onTransferPaused: (info) => {
        setIsPaused(true);
        if (info.from === 'remote') {
          setErrorMessage('对方已暂停传输');
        }
      },
      onPartnerDisconnected: () => {
        setConnectionState('disconnected');
        if (isTransferring) {
          setIsPaused(true);
          setErrorMessage('对方已断开连接');
        }
        if (webrtcManagerRef.current) {
          webrtcManagerRef.current.cleanup();
        }
      },
      onError: (error) => {
        console.error('WebRTC Error:', error);
        setErrorMessage('传输错误: ' + (error.message || '未知错误'));
      }
    });
  }, [isTransferring]);

  const createRoom = useCallback(() => {
    if (!socket) return;

    socket.emit('createRoom', (response) => {
      if (response.success) {
        setRoomId(response.roomId);
        setIsRoomCreated(true);
      }
    });
  }, [socket]);

  const joinRoom = useCallback(() => {
    if (!socket || !joinRoomId.trim()) return;

    socket.emit('joinRoom', { roomId: joinRoomId.trim().toUpperCase() }, async (response) => {
      if (response.success) {
        setRoomId(response.roomId);
        setIsJoined(true);
        setErrorMessage('');
        
        const manager = createWebRTCManager(socket, response.roomId);
        webrtcManagerRef.current = manager;
        setupWebRTCCallbacks(manager);
      } else {
        setErrorMessage(response.message || '加入房间失败');
      }
    });
  }, [socket, joinRoomId, setupWebRTCCallbacks]);

  useEffect(() => {
    if (!socket) return;

    socket.on('userJoined', async ({ userId }) => {
      const manager = createWebRTCManager(socket, roomId);
      webrtcManagerRef.current = manager;
      setupWebRTCCallbacks(manager);
      
      await manager.createPeerConnection(true, userId);
    });

    socket.on('offer', async ({ offer, from }) => {
      if (webrtcManagerRef.current) {
        await webrtcManagerRef.current.handleOffer(offer, from);
      }
    });

    socket.on('answer', async ({ answer }) => {
      if (webrtcManagerRef.current) {
        await webrtcManagerRef.current.handleAnswer(answer);
      }
    });

    socket.on('iceCandidate', async ({ candidate }) => {
      if (webrtcManagerRef.current) {
        await webrtcManagerRef.current.handleIceCandidate(candidate);
      }
    });

    socket.on('partnerDisconnected', () => {
      setConnectionState('disconnected');
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.cleanup();
      }
    });

    return () => {
      socket.off('userJoined');
      socket.off('offer');
      socket.off('answer');
      socket.off('iceCandidate');
      socket.off('partnerDisconnected');
    };
  }, [socket, roomId, setupWebRTCCallbacks]);

  const handleBandwidthChange = (e) => {
    const value = parseInt(e.target.value, 10);
    setBandwidthLimit(value);
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.setBandwidthLimit(value);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const newFiles = files.map(file => ({
        file,
        name: file.name,
        size: file.size,
        completed: false
      }));
      setSelectedFiles(prev => [...prev, ...newFiles]);
      setErrorMessage('');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      const newFiles = files.map(file => ({
        file,
        name: file.name,
        size: file.size,
        completed: false
      }));
      setSelectedFiles(prev => [...prev, ...newFiles]);
      setErrorMessage('');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setCompletedFiles([]);
    setCurrentFileIndex(0);
    setTotalFiles(0);
    setAllFilesCompleted(false);
  };

  const startTransfer = async () => {
    if (selectedFiles.length === 0 || !webrtcManagerRef.current) return;
    
    setIsTransferring(true);
    setIsPaused(false);
    setAllFilesCompleted(false);
    setErrorMessage('');
    
    webrtcManagerRef.current.setBandwidthLimit(bandwidthLimit);
    
    const files = selectedFiles.map(f => f.file);
    
    try {
      if (files.length === 1) {
        await webrtcManagerRef.current.sendFile(files[0]);
      } else {
        await webrtcManagerRef.current.sendFiles(files);
      }
    } catch (error) {
      console.error('传输错误:', error);
      setErrorMessage('传输失败: ' + error.message);
      setIsTransferring(false);
    }
  };

  const pauseTransfer = () => {
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.pauseTransfer();
      setIsPaused(true);
    }
  };

  const resumeTransfer = () => {
    if (webrtcManagerRef.current) {
      setIsPaused(false);
      setErrorMessage('');
      webrtcManagerRef.current.resumeTransfer();
    }
  };

  const cancelTransfer = () => {
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.cancelTransfer();
    }
    setIsTransferring(false);
    setIsPaused(false);
    setTransferProgress(null);
    setIncomingFile(null);
    setAllFilesCompleted(false);
  };

  const getStatusClass = () => {
    switch (connectionState) {
      case 'connected':
        return 'status-connected';
      case 'connecting':
      case 'new':
      case 'checking':
        return 'status-connecting';
      default:
        return 'status-disconnected';
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return '已连接';
      case 'connecting':
      case 'checking':
        return '连接中...';
      case 'new':
        return '初始化连接...';
      case 'disconnected':
        return '未连接';
      case 'failed':
        return '连接失败';
      case 'closed':
        return '连接已关闭';
      default:
        return '未连接';
    }
  };

  const progressPercent = transferProgress
    ? (transferProgress.received / transferProgress.total) * 100
    : 0;

  const getFileStatus = (index) => {
    if (isTransferring && index === currentFileIndex) {
      return 'sending';
    }
    if (selectedFiles[index]?.completed) {
      return 'completed';
    }
    return 'pending';
  };

  const getFileStatusText = (status) => {
    switch (status) {
      case 'sending': return '传输中';
      case 'completed': return '已完成';
      default: return '等待中';
    }
  };

  return (
    <div className="container">
      <h1>🟣 P2P 文件传输</h1>
      
      <div className={`status ${getStatusClass()}`}>
        状态: {getStatusText()}
      </div>

      {errorMessage && (
        <div 
          className="status status-disconnected"
          style={{ fontSize: '14px' }}
        >
          ⚠️ {errorMessage}
        </div>
      )}

      {!isRoomCreated && !isJoined && (
        <div>
          <div className="section-title">创建房间</div>
          <button
            className="button button-primary"
            onClick={createRoom}
            disabled={!socket}
          >
            创建新房间
          </button>

          <div className="section-title" style={{ marginTop: '30px' }}>加入房间</div>
          <label className="label">房间代码</label>
          <input
            type="text"
            className="input"
            placeholder="输入6位房间代码"
            value={joinRoomId}
            onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button
            className="button button-secondary"
            onClick={joinRoom}
            disabled={!socket || joinRoomId.length !== 6}
          >
            加入房间
          </button>
        </div>
      )}

      {(isRoomCreated || isJoined) && (
        <div>
          <div className="room-info">
            <div className="label">你的房间代码</div>
            <div className="room-id">{roomId}</div>
          </div>

          {connectionState === 'connected' && (
            <div>
              <div className="section-title">传输设置</div>
              <div className="settings-section">
                <label className="label">带宽限制</label>
                <select
                  className="bandwidth-select"
                  value={bandwidthLimit}
                  onChange={handleBandwidthChange}
                  disabled={isTransferring}
                >
                  {BANDWIDTH_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="section-title">文件传输</div>
              
              {totalFiles > 1 && isTransferring && (
                <div className="overall-progress">
                  <div className="overall-progress-text">
                    整体进度: {currentFileIndex + 1} / {totalFiles} 个文件
                  </div>
                </div>
              )}
              
              {!isTransferring && (
                <div
                  className={`file-upload-area ${dragOver ? 'drag-over' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                  <div>📁 点击选择或拖拽文件到此处</div>
                  <p>支持多选，支持任意类型和大小的文件</p>
                </div>
              )}

              {selectedFiles.length > 0 && !isTransferring && (
                <div>
                  <div className="selected-files-header">
                    <div className="section-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
                      已选择 {selectedFiles.length} 个文件
                    </div>
                    <button
                      className="button button-secondary clear-files-btn"
                      onClick={clearAllFiles}
                    >
                      清空全部
                    </button>
                  </div>
                  <div className="file-list">
                    {selectedFiles.map((fileInfo, index) => {
                      const status = getFileStatus(index);
                      return (
                        <div 
                          key={index} 
                          className={`file-item ${status === 'sending' ? 'current' : ''} ${status === 'completed' ? 'completed' : ''}`}
                        >
                          <div className="file-item-info">
                            <span>{fileInfo.name}</span>
                            <span className={`file-item-status ${status}`}>
                              {getFileStatusText(status)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '12px', color: '#666' }}>
                              {formatFileSize(fileInfo.size)}
                            </span>
                            {status === 'pending' && (
                              <button
                                className="remove-file-btn"
                                onClick={() => removeFile(index)}
                                title="移除"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {incomingFile && (
                <div className="incoming-file">
                  <h3>📥 接收文件</h3>
                  <p>
                    <strong>{incomingFile.name}</strong>
                    <br />
                    大小: {formatFileSize(incomingFile.size)}
                    {totalFiles > 1 && (
                      <br />
                      <span style={{ fontSize: '12px' }}>
                        (第 {currentFileIndex + 1} 个，共 {totalFiles} 个)
                      </span>
                    )}
                  </p>
                </div>
              )}

              {transferProgress && (
                <div>
                  <div className="progress-container">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="progress-text">
                      {formatFileSize(transferProgress.received)} / {formatFileSize(transferProgress.total)}
                      {' '}({progressPercent.toFixed(1)}%)
                    </div>
                  </div>

                  <div className="stats">
                    <div className="stat-item">
                      <div className="stat-value">
                        {formatSpeed(transferProgress.currentSpeed || 0)}
                      </div>
                      <div className="stat-label">当前速度</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-value">
                        {formatSpeed(transferProgress.avgSpeed || 0)}
                      </div>
                      <div className="stat-label">平均速度</div>
                    </div>
                  </div>
                </div>
              )}

              {!isTransferring && selectedFiles.length > 0 && !allFilesCompleted && (
                <button
                  className="button button-primary"
                  onClick={startTransfer}
                >
                  {selectedFiles.length === 1 ? '开始传输' : `开始传输 ${selectedFiles.length} 个文件`}
                </button>
              )}

              {allFilesCompleted && (
                <div className="status status-connected" style={{ marginBottom: '20px' }}>
                  ✅ 所有文件传输完成！
                </div>
              )}

              {isTransferring && !isPaused && (
                <div className="button-group">
                  <button
                    className="button button-secondary"
                    onClick={pauseTransfer}
                  >
                    暂停
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={cancelTransfer}
                  >
                    取消
                  </button>
                </div>
              )}

              {isTransferring && isPaused && (
                <div className="button-group">
                  <button
                    className="button button-primary"
                    onClick={resumeTransfer}
                  >
                    继续传输
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={cancelTransfer}
                  >
                    取消
                  </button>
                </div>
              )}

              {completedFiles.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <div className="section-title">已完成</div>
                  {completedFiles.map((file, index) => (
                    <div key={index} className="selected-file">
                      <div className="file-name">
                        {file.isSender ? '📤 发送: ' : '📥 接收: '}
                        {file.name}
                      </div>
                      <div className="file-size">{formatFileSize(file.size)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {connectionState !== 'connected' && (
            <div className="status status-connecting">
              等待对方加入房间...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
