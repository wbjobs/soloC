<template>
  <div class="lobby-container">
    <div class="lobby-card">
      <h1 class="title">P2P 代码协同编辑</h1>
      
      <div class="connection-status" :class="{ connected: isConnected }">
        <span class="status-dot"></span>
        <span>{{ isConnected ? '服务器已连接' : '服务器未连接' }}</span>
      </div>

      <div class="action-buttons">
        <button class="btn primary" @click="createRoom" :disabled="!isConnected">
          创建新房间
        </button>
      </div>

      <div class="divider">
        <span>或加入房间</span>
      </div>

      <div class="join-section">
        <input
          v-model="joinRoomId"
          type="text"
          placeholder="输入房间 ID"
          class="room-input"
          maxlength="6"
        />
        <button 
          class="btn secondary" 
          @click="joinRoom" 
          :disabled="!isConnected || !joinRoomId.trim()"
        >
          加入房间
        </button>
      </div>

      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { signalingService } from '../services/SignalingService';

const emit = defineEmits<{
  (e: 'roomJoined', isInitiator: boolean): void;
}>();

const joinRoomId = ref('');
const errorMessage = ref('');

const isConnected = computed(() => signalingService.roomState.value.isConnected);

function createRoom() {
  signalingService.createRoom();
  emit('roomJoined', true);
}

function joinRoom() {
  if (joinRoomId.value.trim()) {
    errorMessage.value = '';
    signalingService.joinRoom(joinRoomId.value.trim());
    
    const handleError = (msg: any) => {
      errorMessage.value = msg.message;
      signalingService.off('ERROR', handleError);
    };
    
    signalingService.on('ERROR', handleError);
    signalingService.on('ROOM_JOINED', () => {
      emit('roomJoined', false);
      signalingService.off('ERROR', handleError);
    });
  }
}
</script>

<style scoped>
.lobby-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
}

.lobby-card {
  background: #252526;
  border-radius: 12px;
  padding: 40px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  border: 1px solid #3c3c3c;
}

.title {
  text-align: center;
  color: #ffffff;
  font-size: 24px;
  margin-bottom: 30px;
  font-weight: 600;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: #3c3c3c;
  border-radius: 8px;
  margin-bottom: 24px;
  color: #ccc;
}

.connection-status.connected {
  background: rgba(76, 175, 80, 0.2);
  color: #4caf50;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f44336;
}

.connection-status.connected .status-dot {
  background: #4caf50;
}

.action-buttons {
  margin-bottom: 24px;
}

.btn {
  width: 100%;
  padding: 14px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: #0078d4;
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: #106ebe;
}

.btn.secondary {
  background: #3c3c3c;
  color: white;
}

.btn.secondary:hover:not(:disabled) {
  background: #4c4c4c;
}

.divider {
  text-align: center;
  margin: 24px 0;
  position: relative;
}

.divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: #3c3c3c;
}

.divider span {
  background: #252526;
  padding: 0 16px;
  color: #888;
  position: relative;
}

.join-section {
  display: flex;
  gap: 12px;
}

.room-input {
  flex: 1;
  padding: 14px 16px;
  background: #3c3c3c;
  border: 1px solid #4c4c4c;
  border-radius: 8px;
  color: white;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.room-input::placeholder {
  color: #888;
  text-transform: none;
  letter-spacing: normal;
}

.room-input:focus {
  outline: none;
  border-color: #0078d4;
}

.error-message {
  margin-top: 16px;
  padding: 12px;
  background: rgba(244, 67, 54, 0.2);
  border: 1px solid rgba(244, 67, 54, 0.3);
  border-radius: 8px;
  color: #f44336;
  text-align: center;
}
</style>
