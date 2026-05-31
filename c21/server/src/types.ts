import { WebSocket } from 'ws';

export interface UserSession {
  userId: string;
  username: string;
  token: string;
  createdAt: number;
}

export interface Device {
  deviceId: string;
  userId: string;
  deviceName: string;
  ws?: WebSocket;
  connectedAt: number;
  lastActiveAt: number;
  isOnline: boolean;
}

export interface ClipboardContent {
  type: 'text' | 'image';
  data: string;
  timestamp: number;
  fromDeviceId: string;
  userId: string;
  encrypted: boolean;
  contentId?: string;
}

export interface SyncLog {
  id: string;
  userId: string;
  fromDeviceId: string;
  toDeviceId: string;
  contentType: 'text' | 'image';
  timestamp: number;
  dataSize: number;
  success: boolean;
}

export interface WSMessage {
  type: 'auth' | 'sync' | 'device-list' | 'heartbeat' | 'history' | 'error' | 'chunk-start' | 'chunk-data' | 'chunk-end' | 'chunk-ack' | 'conflict' | 'conflict-resolve';
  payload: any;
}

export interface ConflictPayload {
  contentId: string;
  localContent: {
    type: 'text' | 'image';
    data: string;
    timestamp: number;
    fromDeviceId: string;
    fromDeviceName: string;
  };
  remoteContent: {
    type: 'text' | 'image';
    data: string;
    timestamp: number;
    fromDeviceId: string;
    fromDeviceName: string;
  };
  serverRecommendation: 'local' | 'remote';
  reason: string;
}

export interface ConflictResolvePayload {
  contentId: string;
  choice: 'local' | 'remote' | 'merge';
}

export interface HeartbeatPayload {
  timestamp: number;
  deviceId: string;
}

export interface ChunkStartPayload {
  uploadId: string;
  totalChunks: number;
  totalSize: number;
  contentType: 'text' | 'image';
  fromDeviceId: string;
  userId: string;
  encrypted: boolean;
  targetDeviceIds?: string[];
}

export interface ChunkDataPayload {
  uploadId: string;
  chunkIndex: number;
  data: string;
}

export interface ChunkEndPayload {
  uploadId: string;
}

export interface ChunkAckPayload {
  uploadId: string;
  status: 'started' | 'received' | 'completed' | 'error';
  chunkIndex?: number;
  error?: string;
}

export interface AuthPayload {
  userId: string;
  token: string;
  deviceId: string;
  deviceName: string;
}

export interface SyncPayload {
  content: ClipboardContent;
  targetDeviceIds?: string[];
}
