export interface ClipboardContent {
  type: 'text' | 'image';
  data: string;
  timestamp: number;
  fromDeviceId: string;
  userId: string;
  encrypted: boolean;
  contentId?: string;
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
  fromDeviceName?: string;
  targetDeviceIds?: string[];
}

export interface ChunkDataPayload {
  uploadId: string;
  chunkIndex: number;
  data: string;
}

export interface ChunkEndPayload {
  uploadId: string;
  fromDeviceName?: string;
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

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  isOnline: boolean;
  connectedAt: number;
  lastActiveAt: number;
}

export interface SyncPayload {
  content: ClipboardContent;
  targetDeviceIds?: string[];
}

export interface HistoryRecord {
  id: number;
  type: 'text' | 'image';
  data: string;
  timestamp: number;
  fromDeviceId: string;
  fromDeviceName?: string;
}

export interface AppConfig {
  serverUrl: string;
  userId: string | null;
  token: string | null;
  deviceId: string;
  deviceName: string;
  autoSync: boolean;
  encryptionKey: string;
}
