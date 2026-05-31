import { WebSocket } from 'ws';
import { WSMessage, AuthPayload, ClipboardContent, SyncPayload, DeviceInfo, ChunkStartPayload, ChunkDataPayload, ChunkAckPayload, ConflictPayload, ConflictResolvePayload } from '../shared/types';
import { clientChunkManager } from './chunkManager';

type MessageHandler = (message: WSMessage) => void;
type ChunkCompleteCallback = (data: string, payload: ChunkStartPayload) => void;
type ConflictCallback = (conflict: ConflictPayload) => void;
type ConnectionStatusCallback = (status: 'connected' | 'disconnected' | 'reconnecting', attempt?: number) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private serverUrl: string = '';
  private authPayload: AuthPayload | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private isAuthenticated: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = Infinity;
  private readonly HEARTBEAT_INTERVAL = 15000;
  private readonly HEARTBEAT_TIMEOUT = 10000;
  private readonly INITIAL_RECONNECT_DELAY = 1000;
  private readonly MAX_RECONNECT_DELAY = 30000;
  private shouldReconnect: boolean = true;
  private pendingUploads: Map<string, {
    data: string;
    payload: ChunkStartPayload;
    chunks: string[];
    nextChunk: number;
    onComplete?: () => void;
  }> = new Map();
  private chunkCompleteCallback: ChunkCompleteCallback | null = null;
  private conflictCallback: ConflictCallback | null = null;
  private connectionStatusCallback: ConnectionStatusCallback | null = null;

  connect(serverUrl: string, authPayload: AuthPayload): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serverUrl = serverUrl;
      this.authPayload = authPayload;
      this.shouldReconnect = true;

      try {
        console.log(`[WSClient] Connecting to ${serverUrl}...`);
        this.ws = new WebSocket(serverUrl, {
          maxPayload: 100 * 1024 * 1024,
          handshakeTimeout: 5000
        });

        this.ws.on('open', () => {
          console.log('[WSClient] WebSocket connection opened, authenticating...');
          this.isConnected = true;
          this.authenticate();
        });

        this.ws.on('message', (data: string) => {
          try {
            const message: WSMessage = JSON.parse(data.toString());
            
            if (message.type === 'heartbeat') {
              this.handleHeartbeatResponse();
            }

            if (message.type === 'auth') {
              if (message.payload.success) {
                console.log('[WSClient] Authentication successful');
                this.isAuthenticated = true;
                this.reconnectAttempts = 0;
                this.startHeartbeat();
                this.connectionStatusCallback?.('connected');
                resolve();
              } else {
                console.error('[WSClient] Authentication failed');
                this.shouldReconnect = false;
                this.disconnect();
                reject(new Error('Authentication failed'));
              }
            }

            if (message.type === 'chunk-ack') {
              this.handleChunkAck(message.payload as ChunkAckPayload);
            }

            this.handleMessage(message);
          } catch (error) {
            console.error('[WSClient] Failed to parse message:', error);
          }
        });

        this.ws.on('close', (code, reason) => {
          console.log(`[WSClient] Connection closed: code=${code}, reason=${reason}`);
          this.handleDisconnect();
          if (!this.isAuthenticated) {
            reject(new Error('Connection closed before authentication'));
          }
        });

        this.ws.on('error', (error) => {
          console.error('[WSClient] WebSocket error:', error);
          if (!this.isAuthenticated) {
            this.shouldReconnect = false;
            reject(error);
          }
        });
      } catch (error) {
        console.error('[WSClient] Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  setChunkCompleteCallback(callback: ChunkCompleteCallback): void {
    this.chunkCompleteCallback = callback;
  }

  setConflictCallback(callback: ConflictCallback): void {
    this.conflictCallback = callback;
  }

  resolveConflict(contentId: string, choice: 'local' | 'remote'): void {
    if (!this.ws || !this.isConnected) {
      console.warn('[WSClient] Not connected, cannot resolve conflict');
      return;
    }

    const payload: ConflictResolvePayload = {
      contentId,
      choice
    };

    const message: WSMessage = {
      type: 'conflict-resolve',
      payload
    };

    this.ws.send(JSON.stringify(message));
    console.log('[WSClient] Sent conflict resolution:', contentId, choice);
  }

  setConnectionStatusCallback(callback: ConnectionStatusCallback): void {
    this.connectionStatusCallback = callback;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    
    this.stopHeartbeat();
    this.pendingUploads.clear();

    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnect');
      } catch (e) {
        console.error('[WSClient] Error closing WebSocket:', e);
      }
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isAuthenticated = false;
    this.connectionStatusCallback?.('disconnected');
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.isAuthenticated = false;
    this.stopHeartbeat();
    this.pendingUploads.clear();
    
    if (this.shouldReconnect) {
      this.connectionStatusCallback?.('reconnecting', this.reconnectAttempts + 1);
      this.scheduleReconnect();
    } else {
      this.connectionStatusCallback?.('disconnected');
    }
  }

  private authenticate(): void {
    if (!this.ws || !this.authPayload) return;

    const message: WSMessage = {
      type: 'auth',
      payload: this.authPayload
    };
    this.ws.send(JSON.stringify(message));
    console.log('[WSClient] Sent authentication request');
  }

  private handleMessage(message: WSMessage): void {
    if (message.type === 'chunk-start') {
      const payload = message.payload as ChunkStartPayload;
      console.log('[WSClient] Received chunk-start:', payload.uploadId);
      clientChunkManager.startIncomingUpload(payload);
      return;
    }

    if (message.type === 'chunk-data') {
      const payload = message.payload as ChunkDataPayload;
      const result = clientChunkManager.receiveChunk(payload.uploadId, payload.chunkIndex, payload.data);
      
      if (result.complete && result.assembled && result.payload) {
        console.log('[WSClient] Chunked content complete, size:', result.assembled.length);
        if (this.chunkCompleteCallback) {
          this.chunkCompleteCallback(result.assembled, result.payload);
        }
      }
      return;
    }

    if (message.type === 'chunk-end') {
      return;
    }

    if (message.type === 'conflict') {
      const payload = message.payload as ConflictPayload;
      console.log('[WSClient] Received conflict:', payload.contentId);
      if (this.conflictCallback) {
        this.conflictCallback(payload);
      }
      return;
    }

    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('[WSClient] Handler error:', error);
        }
      });
    }
  }

  private handleChunkAck(payload: ChunkAckPayload): void {
    console.log('[WSClient] Received chunk-ack:', payload.uploadId, payload.status, payload.chunkIndex);

    if (payload.status === 'started') {
      this.sendNextChunk(payload.uploadId);
      return;
    }

    if (payload.status === 'received') {
      this.sendNextChunk(payload.uploadId);
      return;
    }

    if (payload.status === 'completed' || payload.status === 'error') {
      const upload = this.pendingUploads.get(payload.uploadId);
      if (upload) {
        if (payload.status === 'completed') {
          console.log('[WSClient] Upload completed:', payload.uploadId);
          upload.onComplete?.();
        } else {
          console.error('[WSClient] Upload failed:', payload.uploadId, payload.error);
        }
        this.pendingUploads.delete(payload.uploadId);
      }
    }
  }

  private sendNextChunk(uploadId: string): void {
    const upload = this.pendingUploads.get(uploadId);
    if (!upload || !this.ws || !this.isConnected) return;

    if (upload.nextChunk >= upload.chunks.length) {
      const endMessage: WSMessage = {
        type: 'chunk-end',
        payload: { uploadId }
      };
      this.ws.send(JSON.stringify(endMessage));
      console.log('[WSClient] Sent chunk-end for:', uploadId);
      return;
    }

    const chunkIndex = upload.nextChunk;
    const chunkData = upload.chunks[chunkIndex];
    
    const chunkMessage: WSMessage = {
      type: 'chunk-data',
      payload: {
        uploadId,
        chunkIndex,
        data: chunkData
      }
    };

    try {
      this.ws.send(JSON.stringify(chunkMessage));
      upload.nextChunk++;
    } catch (error) {
      console.error('[WSClient] Failed to send chunk:', error);
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  off(type: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  sendSync(content: ClipboardContent, targetDeviceIds?: string[]): void {
    if (!this.ws || !this.isConnected) {
      console.warn('[WSClient] Not connected, cannot send sync');
      return;
    }

    const dataSize = content.data.length;
    
    if (clientChunkManager.shouldUseChunking(dataSize)) {
      console.log(`[WSClient] Large content (${dataSize} bytes), using chunked transfer`);
      
      const { uploadId, chunks, startPayload } = clientChunkManager.createOutgoingUpload(
        content.data,
        content.type,
        content.fromDeviceId,
        content.userId,
        content.encrypted,
        targetDeviceIds
      );

      this.pendingUploads.set(uploadId, {
        data: content.data,
        payload: startPayload,
        chunks,
        nextChunk: 0
      });

      const startMessage: WSMessage = {
        type: 'chunk-start',
        payload: startPayload
      };

      try {
        this.ws.send(JSON.stringify(startMessage));
        console.log('[WSClient] Sent chunk-start for:', uploadId, 'total chunks:', chunks.length);
      } catch (error) {
        console.error('[WSClient] Failed to send chunk-start:', error);
        this.pendingUploads.delete(uploadId);
      }
      return;
    }

    const payload: SyncPayload = {
      content,
      targetDeviceIds
    };

    const message: WSMessage = {
      type: 'sync',
      payload
    };

    this.ws.send(JSON.stringify(message));
    console.log('[WSClient] Sent sync message (small content,', dataSize, 'bytes)');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.isConnected && this.isAuthenticated) {
        this.sendHeartbeat();
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private sendHeartbeat(): void {
    if (!this.ws || !this.isConnected) return;

    const message: WSMessage = {
      type: 'heartbeat',
      payload: {
        timestamp: Date.now(),
        deviceId: this.authPayload?.deviceId
      }
    };

    try {
      this.ws.send(JSON.stringify(message));
      
      this.heartbeatTimeout = setTimeout(() => {
        console.warn('[WSClient] Heartbeat timeout, connection may be stale');
        if (this.ws) {
          this.ws.terminate();
        }
      }, this.HEARTBEAT_TIMEOUT);
    } catch (error) {
      console.error('[WSClient] Failed to send heartbeat:', error);
    }
  }

  private handleHeartbeatResponse(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) {
      console.log('[WSClient] Reconnect disabled, not scheduling reconnect');
      return;
    }

    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.INITIAL_RECONNECT_DELAY * Math.pow(1.5, this.reconnectAttempts - 1),
      this.MAX_RECONNECT_DELAY
    );

    console.log(`[WSClient] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.connectionStatusCallback?.('reconnecting', this.reconnectAttempts);

    this.reconnectInterval = setTimeout(() => {
      if (this.shouldReconnect && this.authPayload && this.serverUrl) {
        console.log(`[WSClient] Attempting reconnect (${this.reconnectAttempts})...`);
        this.connect(this.serverUrl, this.authPayload).catch((error) => {
          console.error('[WSClient] Reconnect attempt failed:', error.message);
        });
      }
    }, delay);
  }

  connected(): boolean {
    return this.isConnected && this.isAuthenticated;
  }
}

export const wsClient = new WSClient();
