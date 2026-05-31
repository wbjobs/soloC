export interface SignalMessage {
  type: string;
  sdp?: any;
  candidate?: any;
}

export interface UserInfo {
  id: string;
  name: string;
}

export interface RoomState {
  roomId: string | null;
  userId: string | null;
  peerCount: number;
  isConnected: boolean;
}

export interface CodeSyncMessage {
  from: string;
  code: string;
  cursor?: {
    lineNumber: number;
    column: number;
  };
}
