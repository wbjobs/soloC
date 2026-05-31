<template>
  <div class="editor-room">
    <header class="header">
      <div class="header-left">
        <h1 class="title">P2P 代码协同编辑 (CRDT)</h1>
        <div class="room-info">
          <span class="room-label">房间 ID:</span>
          <span class="room-id">{{ roomId }}</span>
          <button class="copy-btn" @click="copyRoomId">复制</button>
        </div>
      </div>
      <div class="header-right">
        <div class="status-info">
          <div class="status-item">
            <span 
              class="status-dot" 
              :class="{ connected: isPeerConnected, reconnecting: isReconnecting, offline: isCRDTOffline }">
            </span>
            <span>{{ connectionStatusText }}</span>
          </div>
          <div v-if="pendingCount > 0" class="pending-item">
            <span class="pending-dot"></span>
            <span>{{ pendingCount }} 个操作待同步</span>
          </div>
          <div class="peer-count-item">
            <span>({{ peerCount }} 人在线)</span>
          </div>
        </div>
        <button class="leave-btn" @click="leaveRoom">离开房间</button>
      </div>
    </header>

    <main class="editor-container">
      <CodeEditor 
        ref="editorRef"
        :code="code" 
        language="javascript"
        @codeChange="handleCodeChange"
        @operation="handleOperation"
      />
    </main>

    <div v-if="copySuccess" class="copy-toast">
      房间 ID 已复制到剪贴板
    </div>

    <div v-if="syncSuccess" class="sync-toast">
      离线修改已同步完成
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import CodeEditor from './CodeEditor.vue';
import { signalingService } from '../services/SignalingService';
import { webRTCService } from '../services/WebRTCService';
import { crdtService } from '../services/CRDTService';
import type { Operation, VectorClock } from '../services/CRDTService';

const props = defineProps<{
  isInitiator: boolean;
}>();

const emit = defineEmits<{
  (e: 'leave'): void;
}>();

const code = ref(`// 欢迎使用 P2P 代码协同编辑！
// 基于 CRDT 算法，支持离线编辑和自动合并
// 开始输入代码，对方将实时看到你的编辑

function hello() {
  console.log("Hello, World!");
}

hello();
`);

const editorRef = ref<InstanceType<typeof CodeEditor> | null>(null);
const copySuccess = ref(false);
const syncSuccess = ref(false);
let syncTimeout: number | null = null;

const roomId = computed(() => signalingService.roomState.value.roomId);
const peerCount = computed(() => signalingService.roomState.value.peerCount);
const isPeerConnected = computed(() => webRTCService.isPeerConnected.value);
const isReconnecting = computed(() => webRTCService.isReconnecting.value);
const isCRDTOffline = computed(() => crdtService.isOffline.value);
const pendingCount = computed(() => crdtService.pendingCount.value);

const connectionStatusText = computed(() => {
  if (isCRDTOffline.value) {
    return '离线模式 (已缓存)';
  }
  if (isReconnecting.value) {
    return '正在重连...';
  }
  return isPeerConnected.value ? 'P2P 已连接' : '等待对方加入...';
});

onMounted(async () => {
  if (roomId.value) {
    crdtService.init(roomId.value);
  }

  try {
    await webRTCService.setupPeer(props.isInitiator);
    
    webRTCService.onCodeReceived = (receivedCode: string, version: number) => {
    };

    webRTCService.onOperationReceived = (operation: Operation, vectorClock: VectorClock) => {
      handleRemoteOperation(operation, vectorClock);
    };

    webRTCService.onSyncRequest = () => {
      sendFullSync();
    };

    webRTCService.onFullSyncReceived = (operations: Operation[], vectorClock: VectorClock) => {
      handleFullSync(operations, vectorClock);
    };

    webRTCService.onReconnected = () => {
      if (props.isInitiator) {
        setTimeout(() => {
          sendFullSync();
        }, 500);
      }
    };

    signalingService.on('PEER_JOINED', async () => {
      if (props.isInitiator) {
        setTimeout(() => {
          sendFullSync();
        }, 500);
      }
    });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
      handleOffline();
    }
  } catch (error) {
    console.error('初始化 WebRTC 失败:', error);
  }
});

function handleOnline() {
  console.log('网络已恢复');
  crdtService.setOffline(false);
  
  if (pendingCount.value > 0) {
    setTimeout(() => {
      sendPendingOperations();
      syncSuccess.value = true;
      setTimeout(() => {
        syncSuccess.value = false;
      }, 3000);
    }, 1000);
  }
}

function handleOffline() {
  console.log('网络已断开，进入离线模式');
  crdtService.setOffline(true);
}

function handleOperation(operation: { type: 'insert' | 'delete'; position: number; content?: string; length?: number }) {
  let op: Operation | null = null;
  
  if (operation.type === 'insert' && operation.content) {
    op = crdtService.insert(operation.position, operation.content);
  } else if (operation.type === 'delete') {
    op = crdtService.delete(operation.position, operation.length || 1);
  }

  if (op && isPeerConnected.value && !isCRDTOffline.value) {
    sendOperation(op);
  }
}

function handleRemoteOperation(operation: Operation, vectorClock: VectorClock) {
  const changed = crdtService.receiveOperation(operation, vectorClock);
  if (changed) {
    const newCode = crdtService.getContent();
    code.value = newCode;
    editorRef.value?.applyRemoteChange(newCode);
  }
}

function handleFullSync(operations: Operation[], vectorClock: VectorClock) {
  const pendingOps = crdtService.getPendingOperations();
  
  crdtService.syncOperations(operations, vectorClock);
  
  const newCode = crdtService.getContent();
  code.value = newCode;
  editorRef.value?.applyRemoteChange(newCode);
  
  if (pendingOps.length > 0) {
    pendingOps.forEach(op => sendOperation(op));
  }
  
  crdtService.clearPendingOperations();
}

function sendOperation(operation: Operation) {
  if (webRTCService.isPeerConnected.value) {
    webRTCService.sendOperation(operation, crdtService.getVectorClock());
  }
}

function sendPendingOperations() {
  const pendingOps = crdtService.getPendingOperations();
  pendingOps.forEach(op => sendOperation(op));
  crdtService.clearPendingOperations();
}

function sendFullSync() {
  const operations = crdtService.getAllOperations();
  const vectorClock = crdtService.getVectorClock();
  webRTCService.sendFullSync(operations, vectorClock);
}

function handleCodeChange(newCode: string) {
}

function copyRoomId() {
  if (roomId.value) {
    navigator.clipboard.writeText(roomId.value).then(() => {
      copySuccess.value = true;
      setTimeout(() => {
        copySuccess.value = false;
      }, 2000);
    });
  }
}

function leaveRoom() {
  webRTCService.destroy();
  crdtService.destroy();
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  emit('leave');
}

onUnmounted(() => {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
});
</script>

<style scoped>
.editor-room {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
}

.header-left .title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.room-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.room-label {
  color: #888;
  font-size: 14px;
}

.room-id {
  font-family: monospace;
  font-size: 16px;
  font-weight: 600;
  color: #4caf50;
  letter-spacing: 2px;
}

.copy-btn {
  padding: 4px 12px;
  background: #3c3c3c;
  border: 1px solid #4c4c4c;
  border-radius: 4px;
  color: white;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-btn:hover {
  background: #4c4c4c;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-item, .pending-item, .peer-count-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff9800;
}

.status-dot.connected {
  background: #4caf50;
}

.status-dot.reconnecting {
  background: #ff9800;
  animation: pulse 1s infinite;
}

.status-dot.offline {
  background: #f44336;
}

.pending-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2196f3;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.leave-btn {
  padding: 8px 20px;
  background: #f44336;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.leave-btn:hover {
  background: #d32f2f;
}

.editor-container {
  flex: 1;
  overflow: hidden;
}

.copy-toast, .sync-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  background: #4caf50;
  color: white;
  border-radius: 8px;
  font-size: 14px;
  animation: fadeIn 0.3s ease;
}

.sync-toast {
  background: #2196f3;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>
