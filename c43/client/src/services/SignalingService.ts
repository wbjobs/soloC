import { ref, onUnmounted } from 'vue';
import type { RoomState } from '../types';

class SignalingService {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
  
  public roomState = ref<RoomState>({
    roomId: null,
    userId: null,
    peerCount: 0,
    isConnected: false
  });

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//localhost:3001`;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        this.roomState.value.isConnected = true;
        resolve();
      };
      
      this.ws.onerror = (error) => {
        reject(error);
      };
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      };
      
      this.ws.onclose = () => {
        this.roomState.value.isConnected = false;
      };
    });
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'ROOM_CREATED':
        this.roomState.value.roomId = message.roomId;
        this.roomState.value.userId = message.userId;
        this.roomState.value.peerCount = 1;
        break;
      case 'ROOM_JOINED':
        this.roomState.value.roomId = message.roomId;
        this.roomState.value.userId = message.userId;
        this.roomState.value.peerCount = message.peerCount;
        break;
      case 'PEER_JOINED':
        this.roomState.value.peerCount = message.peerCount;
        break;
      case 'PEER_LEFT':
        this.roomState.value.peerCount = message.peerCount;
        break;
    }
    
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }
  }

  send(type: string, data: any = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  on(type: string, handler: (data: any) => void) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  off(type: string, handler: (data: any) => void) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  createRoom() {
    this.send('CREATE_ROOM');
  }

  joinRoom(roomId: string) {
    this.send('JOIN_ROOM', { roomId: roomId.toUpperCase() });
  }

  sendSignal(signal: any) {
    this.send('SIGNAL', { signal });
  }

  syncCode(code: string, version?: number, cursor?: { lineNumber: number; column: number }) {
    this.send('SYNC_CODE', { code, version, cursor });
  }

  disconnect() {
    if (this.ws) {
      this.send('LEAVE_ROOM');
      this.ws.close();
      this.ws = null;
    }
  }
}

export const signalingService = new SignalingService();
