import { createFileChunker, encryptChunk, decryptChunk, createProgressTracker } from './fileUtils.js';
import { generateKey, exportKey, importKey } from './crypto.js';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

const MAX_BUFFERED_AMOUNT = 1024 * 1024;
const DEFAULT_BANDWIDTH_LIMIT = 0;
const CHUNK_SIZE = 16384;

function createWritableBlobStream(mimeType) {
  const parts = [];
  let totalSize = 0;
  
  return {
    write: (chunk) => {
      parts.push(chunk);
      totalSize += chunk.length;
    },
    getBlob: () => new Blob(parts, { type: mimeType }),
    getSize: () => totalSize,
    clear: () => {
      parts.length = 0;
      totalSize = 0;
    }
  };
}

export function createWebRTCManager(socket, roomId) {
  let peerConnection = null;
  let dataChannel = null;
  let partnerId = null;
  let encryptionKey = null;
  
  let currentFile = null;
  let currentFileIndex = 0;
  let totalFiles = 0;
  let fileQueue = [];
  let fileChunker = null;
  let fileWriter = null;
  
  let fileInfo = null;
  let progressTracker = null;
  let overallProgressTracker = null;
  
  let isPaused = false;
  let isSending = false;
  let sendCancelled = false;
  
  let bandwidthLimit = DEFAULT_BANDWIDTH_LIMIT;
  let bytesSentInInterval = 0;
  let intervalStartTime = 0;
  const BANDWIDTH_CHECK_INTERVAL = 100;
  
  let pendingResendInfo = null;
  let transferredMetadata = null;
  
  const callbacks = {
    onConnectionStateChange: null,
    onFileInfo: null,
    onProgress: null,
    onOverallProgress: null,
    onFileComplete: null,
    onAllFilesComplete: null,
    onTransferPaused: null,
    onPartnerDisconnected: null,
    onError: null
  };

  function updateConnectionState(state) {
    if (callbacks.onConnectionStateChange) {
      callbacks.onConnectionStateChange(state);
    }
  }

  async function createPeerConnection(isInitiator, remoteUserId) {
    partnerId = remoteUserId;
    
    peerConnection = new RTCPeerConnection(ICE_CONFIG);
    encryptionKey = await generateKey();
    
    dataChannel = peerConnection.createDataChannel('fileTransfer', {
      ordered: true,
      reliable: true
    });
    
    setupDataChannel(dataChannel);
    setupPeerConnectionListeners(isInitiator);
    
    if (isInitiator) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', { 
        roomId, 
        offer: peerConnection.localDescription,
        userId: partnerId
      });
    }
    
    return peerConnection;
  }

  function setupPeerConnectionListeners(isInitiator) {
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('iceCandidate', {
          roomId,
          candidate: event.candidate,
          userId: partnerId
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      updateConnectionState(peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'connected' && pendingResendInfo) {
        setTimeout(() => {
          resendFileInfoAfterReconnect();
        }, 1000);
      }
    };

    peerConnection.ondatachannel = (event) => {
      if (!isInitiator) {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
      }
    };
  }

  function setupDataChannel(channel) {
    channel.onopen = () => {
      updateConnectionState('connected');
    };

    channel.binaryType = 'arraybuffer';
    
    channel.onmessage = async (event) => {
      await handleMessage(event.data);
    };

    channel.onbufferedamountlow = () => {
      if (isSending && !isPaused) {
        sendNextChunks();
      }
    };

    channel.onclose = () => {
      updateConnectionState('disconnected');
    };

    channel.onerror = (error) => {
      if (callbacks.onError) {
        callbacks.onError(error);
      }
    };
  }

  async function handleMessage(data) {
    if (data instanceof ArrayBuffer) {
      if (!fileInfo || !fileWriter) return;
      
      try {
        const encryptedChunk = new Uint8Array(data);
        const decryptedChunk = await decryptChunk(encryptedChunk, encryptionKey);
        
        fileWriter.write(decryptedChunk);
        const receivedSize = fileWriter.getSize();
        
        if (progressTracker) {
          progressTracker.update(decryptedChunk.length);
          const stats = progressTracker.getStats();
          
          if (callbacks.onProgress) {
            callbacks.onProgress({
              received: receivedSize,
              total: fileInfo.size,
              ...stats,
              currentFileIndex: currentFileIndex,
              totalFiles: totalFiles
            });
          }
        }
        
        if (receivedSize >= fileInfo.size) {
          await saveFile();
        }
      } catch (error) {
        console.error('处理数据块时出错:', error);
        if (callbacks.onError) {
          callbacks.onError(error);
        }
      }
    } else if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        await handleControlMessage(message);
      } catch (error) {
        console.error('解析控制消息失败:', error);
      }
    }
  }

  async function handleControlMessage(message) {
    switch (message.type) {
      case 'fileInfo':
        await handleFileInfo(message);
        break;
        
      case 'batchInfo':
        handleBatchInfo(message);
        break;
        
      case 'requestResume':
        await handleResumeRequest(message);
        break;
        
      case 'pause':
        handlePause();
        break;
        
      case 'resume':
        await handleResume(message);
        break;
        
      case 'transferComplete':
        handleTransferCompleteAck();
        break;
        
      case 'batchComplete':
        handleBatchComplete();
        break;
    }
  }

  function handleBatchInfo(message) {
    totalFiles = message.totalFiles;
    currentFileIndex = message.currentFileIndex;
    
    if (callbacks.onOverallProgress) {
      callbacks.onOverallProgress({
        currentFileIndex,
        totalFiles
      });
    }
  }

  async function handleFileInfo(message) {
    if (message.encryptionKey) {
      encryptionKey = await importKey(message.encryptionKey);
    }
    
    fileInfo = message.payload;
    totalFiles = message.totalFiles || 1;
    currentFileIndex = message.currentFileIndex || 0;
    
    fileWriter = createWritableBlobStream(fileInfo.type);
    transferredMetadata = {
      name: fileInfo.name,
      size: fileInfo.size,
      type: fileInfo.type
    };
    
    progressTracker = createProgressTracker();
    progressTracker.start();
    
    if (callbacks.onFileInfo) {
      callbacks.onFileInfo(fileInfo, {
        currentFileIndex,
        totalFiles
      });
    }
  }

  async function handleResumeRequest(message) {
    if (currentFile && isSending) {
      const receivedSize = message.receivedSize || 0;
      
      progressTracker = createProgressTracker();
      progressTracker.start();
      progressTracker.update(receivedSize);
      
      fileChunker = createFileChunker(currentFile, receivedSize);
      isPaused = false;
      
      await sendNextChunks();
    }
  }

  function handlePause() {
    isPaused = true;
    isSending = false;
    
    if (callbacks.onTransferPaused) {
      callbacks.onTransferPaused({
        from: 'remote'
      });
    }
  }

  async function handleResume(message) {
    isPaused = false;
    
    if (fileWriter) {
      const receivedSize = fileWriter.getSize();
      
      if (receivedSize > 0 && receivedSize < fileInfo.size) {
        sendControlMessage({
          type: 'requestResume',
          receivedSize: receivedSize
        });
      }
    }
  }

  function handleTransferCompleteAck() {
    console.log('对方确认接收完成');
  }

  function handleBatchComplete() {
    if (callbacks.onAllFilesComplete) {
      callbacks.onAllFilesComplete();
    }
  }

  async function saveFile() {
    try {
      const blob = fileWriter.getBlob();
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileInfo.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10000);
      
      sendControlMessage({
        type: 'transferComplete'
      });
      
      if (callbacks.onFileComplete) {
        callbacks.onFileComplete({
          name: fileInfo.name,
          size: fileInfo.size,
          isSender: false,
          currentFileIndex,
          totalFiles
        });
      }
      
      if (currentFileIndex + 1 >= totalFiles) {
        sendControlMessage({
          type: 'batchComplete'
        });
        
        if (callbacks.onAllFilesComplete) {
          callbacks.onAllFilesComplete();
        }
      }
      
      resetTransfer();
    } catch (error) {
      console.error('保存文件失败:', error);
      if (callbacks.onError) {
        callbacks.onError(error);
      }
    }
  }

  function resetTransfer() {
    currentFile = null;
    fileChunker = null;
    
    if (fileWriter) {
      fileWriter.clear();
      fileWriter = null;
    }
    
    fileInfo = null;
    progressTracker = null;
    isPaused = false;
    isSending = false;
    sendCancelled = false;
    pendingResendInfo = null;
  }

  function resetBatch() {
    fileQueue = [];
    currentFileIndex = 0;
    totalFiles = 0;
    overallProgressTracker = null;
    resetTransfer();
  }

  function sendControlMessage(message) {
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify(message));
    }
  }

  function setBandwidthLimit(bytesPerSecond) {
    bandwidthLimit = Math.max(0, bytesPerSecond);
  }

  function getBandwidthLimit() {
    return bandwidthLimit;
  }

  function calculateRequiredDelay(chunkSize) {
    if (bandwidthLimit <= 0) {
      return 5;
    }
    
    const now = Date.now();
    const elapsed = now - intervalStartTime;
    
    if (elapsed >= BANDWIDTH_CHECK_INTERVAL) {
      bytesSentInInterval = 0;
      intervalStartTime = now;
    }
    
    bytesSentInInterval += chunkSize;
    
    const maxBytesInInterval = (bandwidthLimit * BANDWIDTH_CHECK_INTERVAL) / 1000;
    
    if (bytesSentInInterval > maxBytesInInterval) {
      const excessBytes = bytesSentInInterval - maxBytesInInterval;
      const delay = (excessBytes / bandwidthLimit) * 1000;
      return Math.max(delay, 5);
    }
    
    return 5;
  }

  async function sendFiles(files) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      throw new Error('连接未就绪');
    }
    
    if (!files || files.length === 0) {
      throw new Error('没有选择文件');
    }
    
    fileQueue = Array.from(files);
    totalFiles = fileQueue.length;
    currentFileIndex = 0;
    
    let totalSize = 0;
    for (const file of fileQueue) {
      totalSize += file.size;
    }
    
    overallProgressTracker = createProgressTracker();
    overallProgressTracker.start();
    
    if (callbacks.onOverallProgress) {
      callbacks.onOverallProgress({
        currentFileIndex: 0,
        totalFiles,
        totalSize
      });
    }
    
    await sendNextFileInQueue();
  }

  async function sendNextFileInQueue() {
    if (currentFileIndex >= fileQueue.length || sendCancelled) {
      isSending = false;
      
      if (callbacks.onAllFilesComplete) {
        callbacks.onAllFilesComplete();
      }
      return;
    }
    
    const file = fileQueue[currentFileIndex];
    await sendFile(file, currentFileIndex, totalFiles);
  }

  async function sendFile(file, fileIndex = 0, fileCount = 1) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      throw new Error('连接未就绪');
    }
    
    currentFile = file;
    currentFileIndex = fileIndex;
    totalFiles = fileCount;
    sendCancelled = false;
    isPaused = false;
    
    pendingResendInfo = {
      file: file,
      encryptionKey: encryptionKey
    };
    
    const keyExported = await exportKey(encryptionKey);
    
    const infoMessage = {
      type: 'fileInfo',
      encryptionKey: keyExported,
      payload: {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      },
      currentFileIndex: fileIndex,
      totalFiles: fileCount
    };
    
    sendControlMessage(infoMessage);
    
    progressTracker = createProgressTracker();
    progressTracker.start();
    
    fileChunker = createFileChunker(file);
    
    isSending = true;
    intervalStartTime = Date.now();
    bytesSentInInterval = 0;
    
    await sendNextChunks();
  }

  async function sendNextChunks() {
    if (!fileChunker || !dataChannel || isPaused || sendCancelled) {
      isSending = false;
      return;
    }
    
    while (fileChunker.hasNext() && !isPaused && !sendCancelled) {
      if (dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        isSending = false;
        
        const waitForDrain = new Promise((resolve) => {
          const handler = () => {
            dataChannel.removeEventListener('bufferedamountlow', handler);
            isSending = true;
            resolve();
          };
          dataChannel.addEventListener('bufferedamountlow', handler);
        });
        
        await waitForDrain;
        
        if (isPaused || sendCancelled) {
          return;
        }
      }
      
      try {
        const chunk = await fileChunker.getNextChunk();
        const encrypted = await encryptChunk(chunk.data, encryptionKey);
        
        dataChannel.send(encrypted);
        
        progressTracker.update(chunk.data.length);
        const stats = progressTracker.getStats();
        
        if (overallProgressTracker) {
          overallProgressTracker.update(chunk.data.length);
        }
        
        if (callbacks.onProgress) {
          callbacks.onProgress({
            received: stats.bytesTransferred,
            total: currentFile.size,
            ...stats,
            currentFileIndex,
            totalFiles
          });
        }
        
        const delay = calculateRequiredDelay(chunk.data.length);
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error) {
        console.error('发送数据块失败:', error);
        isSending = false;
        
        if (callbacks.onError) {
          callbacks.onError(error);
        }
        return;
      }
    }
    
    if (!fileChunker.hasNext()) {
      isSending = false;
      
      if (callbacks.onFileComplete) {
        callbacks.onFileComplete({
          name: currentFile.name,
          size: currentFile.size,
          isSender: true,
          currentFileIndex,
          totalFiles
        });
      }
      
      if (fileQueue.length > 0) {
        currentFileIndex++;
        
        if (callbacks.onOverallProgress) {
          callbacks.onOverallProgress({
            currentFileIndex,
            totalFiles
          });
        }
        
        setTimeout(() => {
          if (!isPaused && !sendCancelled) {
            sendNextFileInQueue();
          }
        }, 500);
      }
    }
  }

  function pauseTransfer() {
    isPaused = true;
    isSending = false;
    sendControlMessage({ type: 'pause' });
    
    if (callbacks.onTransferPaused) {
      callbacks.onTransferPaused({
        from: 'local'
      });
    }
  }

  function resumeTransfer() {
    if (!dataChannel) return;
    
    isPaused = false;
    
    if (fileWriter && fileInfo) {
      const receivedSize = fileWriter.getSize();
      
      sendControlMessage({
        type: 'resume',
        receivedSize: receivedSize
      });
    } else if (currentFile && fileChunker) {
      sendControlMessage({ type: 'resume' });
      
      setTimeout(() => {
        if (!isPaused) {
          isSending = true;
          sendNextChunks();
        }
      }, 200);
    } else if (fileQueue.length > 0 && currentFileIndex < fileQueue.length) {
      setTimeout(() => {
        if (!isPaused) {
          isSending = true;
          sendNextFileInQueue();
        }
      }, 200);
    }
  }

  function cancelTransfer() {
    sendCancelled = true;
    isSending = false;
    isPaused = false;
    resetBatch();
  }

  async function resendFileInfoAfterReconnect() {
    if (pendingResendInfo && dataChannel) {
      console.log('重新发送文件信息...');
      
      const keyExported = await exportKey(pendingResendInfo.encryptionKey);
      
      const infoMessage = {
        type: 'fileInfo',
        encryptionKey: keyExported,
        payload: {
          name: pendingResendInfo.file.name,
          size: pendingResendInfo.file.size,
          type: pendingResendInfo.file.type,
          lastModified: pendingResendInfo.file.lastModified
        },
        currentFileIndex,
        totalFiles
      };
      
      sendControlMessage(infoMessage);
    }
  }

  async function handleOffer(offer, from) {
    await createPeerConnection(false, from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    socket.emit('answer', {
      roomId,
      answer: peerConnection.localDescription,
      userId: from
    });
  }

  async function handleAnswer(answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async function handleIceCandidate(candidate) {
    if (peerConnection && candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  function setCallbacks(newCallbacks) {
    Object.assign(callbacks, newCallbacks);
  }

  function getConnectionState() {
    return peerConnection ? peerConnection.connectionState : 'disconnected';
  }

  function cleanup() {
    sendCancelled = true;
    isSending = false;
    
    if (dataChannel) {
      try {
        dataChannel.close();
      } catch (e) {}
    }
    
    if (peerConnection) {
      try {
        peerConnection.close();
      } catch (e) {}
    }
    
    resetBatch();
  }

  return {
    createPeerConnection,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    sendFile,
    sendFiles,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    setBandwidthLimit,
    getBandwidthLimit,
    setCallbacks,
    getConnectionState,
    cleanup
  };
}
