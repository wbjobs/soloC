import { ref } from 'vue';
import { signalingService } from './SignalingService';
import type { Operation, VectorClock } from './CRDTService';

interface OperationMessage {
  type: 'OPERATION';
  operation: Operation;
  vectorClock: VectorClock;
}

interface FullSyncMessage {
  type: 'FULL_SYNC';
  operations: Operation[];
  vectorClock: VectorClock;
}

interface SyncRequestMessage {
  type: 'SYNC_REQUEST';
}

type DataMessage = OperationMessage | FullSyncMessage | SyncRequestMessage;

class WebRTCService {
  private peer: any = null;
  private isInitiator = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private reconnectTimeoutId: number | null = null;
  private isManualDestroy = false;
  
  public isPeerConnected = ref(false);
  public isReconnecting = ref(false);
  public onCodeReceived: ((code: string, version: number) => void) | null = null;
  public onOperationReceived: ((operation: Operation, vectorClock: VectorClock) => void) | null = null;
  public onFullSyncReceived: ((operations: Operation[], vectorClock: VectorClock) => void) | null = null;
  public onSyncRequest: (() => void) | null = null;
  public onReconnected: (() => void) | null = null;

  async setupPeer(initiator: boolean) {
    this.isInitiator = initiator;
    this.isManualDestroy = false;
    this.reconnectAttempts = 0;
    
    await this.createPeer();
  }

  private async createPeer() {
    if (this.peer) {
      this.cleanupPeer();
    }

    const Peer = (await import('simple-peer')).default;
    
    this.peer = new Peer({
      initiator: this.isInitiator,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    this.peer.on('signal', (signal: any) => {
      signalingService.sendSignal(signal);
    });

    this.peer.on('connect', () => {
      this.isPeerConnected.value = true;
      this.isReconnecting.value = false;
      this.reconnectAttempts = 0;
      console.log('P2P 连接已建立');
      
      if (this.onReconnected) {
        this.onReconnected();
      }
    });

    this.peer.on('data', (data: any) => {
      try {
        const message: DataMessage = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'OPERATION':
            if (this.onOperationReceived) {
              this.onOperationReceived(message.operation, message.vectorClock);
            }
            break;
          case 'FULL_SYNC':
            if (this.onFullSyncReceived) {
              this.onFullSyncReceived(message.operations, message.vectorClock);
            }
            break;
          case 'SYNC_REQUEST':
            if (this.onSyncRequest) {
              this.onSyncRequest();
            }
            break;
        }
      } catch (e) {
        console.error('解析数据失败:', e);
      }
    });

    this.peer.on('close', () => {
      this.isPeerConnected.value = false;
      console.log('P2P 连接已关闭');
      
      if (!this.isManualDestroy && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    });

    this.peer.on('error', (err: any) => {
      console.error('WebRTC 错误:', err);
      this.isPeerConnected.value = false;
      
      if (!this.isManualDestroy && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    });

    signalingService.off('SIGNAL', this.handleSignal.bind(this));
    signalingService.on('SIGNAL', this.handleSignal.bind(this));
  }

  private scheduleReconnect() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }

    this.isReconnecting.value = true;
    this.reconnectAttempts++;
    
    console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    this.reconnectTimeoutId = window.setTimeout(async () => {
      if (!this.isManualDestroy) {
        await this.createPeer();
      }
    }, this.reconnectDelay);
  }

  private handleSignal(message: any) {
    if (this.peer && message.signal) {
      try {
        this.peer.signal(message.signal);
      } catch (e) {
        console.error('处理信令失败:', e);
      }
    }
  }

  sendOperation(operation: Operation, vectorClock: VectorClock) {
    if (this.peer && this.isPeerConnected.value) {
      const message: OperationMessage = {
        type: 'OPERATION',
        operation,
        vectorClock
      };
      
      try {
        this.peer.send(JSON.stringify(message));
      } catch (e) {
        console.error('发送操作失败:', e);
      }
    }
  }

  sendFullSync(operations: Operation[], vectorClock: VectorClock) {
    if (this.peer && this.isPeerConnected.value) {
      const message: FullSyncMessage = {
        type: 'FULL_SYNC',
        operations,
        vectorClock
      };
      
      try {
        this.peer.send(JSON.stringify(message));
      } catch (e) {
        console.error('发送全量同步失败:', e);
      }
    }
  }

  sendSyncRequest() {
    if (this.peer && this.isPeerConnected.value) {
      const message: SyncRequestMessage = {
        type: 'SYNC_REQUEST'
      };
      
      try {
        this.peer.send(JSON.stringify(message));
      } catch (e) {
        console.error('发送同步请求失败:', e);
      }
    }
  }

  sendCode(code: string, version: number) {
  }

  private cleanupPeer() {
    if (this.peer) {
      try {
        this.peer.removeAllListeners();
        this.peer.destroy();
      } catch (e) {
        console.error('清理 Peer 失败:', e);
      }
      this.peer = null;
    }
    this.isPeerConnected.value = false;
  }

  destroy() {
    this.isManualDestroy = true;
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    this.cleanupPeer();
    this.isReconnecting.value = false;
  }
}

export const webRTCService = new WebRTCService();
