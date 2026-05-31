import { ChunkStartPayload } from '../shared/types';
import { v4 as uuidv4 } from 'uuid';

interface UploadSession {
  startPayload: ChunkStartPayload;
  chunks: Map<number, string>;
  receivedChunks: number;
}

interface OutgoingUpload {
  uploadId: string;
  chunks: string[];
  sentIndex: number;
  totalChunks: number;
  payload: ChunkStartPayload;
}

class ClientChunkManager {
  private incomingSessions: Map<string, UploadSession> = new Map();
  private outgoingUploads: Map<string, OutgoingUpload> = new Map();
  private readonly CHUNK_SIZE = 64 * 1024;
  private readonly MAX_UPLOAD_AGE = 5 * 60 * 1000;

  constructor() {
    setInterval(() => this.cleanupOld(), 60000);
  }

  getChunkSize(): number {
    return this.CHUNK_SIZE;
  }

  shouldUseChunking(dataSize: number): boolean {
    return dataSize > this.CHUNK_SIZE;
  }

  createOutgoingUpload(
    data: string,
    contentType: 'text' | 'image',
    fromDeviceId: string,
    userId: string,
    encrypted: boolean,
    targetDeviceIds?: string[]
  ): { uploadId: string; chunks: string[]; startPayload: ChunkStartPayload } {
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += this.CHUNK_SIZE) {
      chunks.push(data.substring(i, i + this.CHUNK_SIZE));
    }

    const uploadId = uuidv4();
    const startPayload: ChunkStartPayload = {
      uploadId,
      totalChunks: chunks.length,
      totalSize: data.length,
      contentType,
      fromDeviceId,
      userId,
      encrypted,
      targetDeviceIds
    };

    this.outgoingUploads.set(uploadId, {
      uploadId,
      chunks,
      sentIndex: 0,
      totalChunks: chunks.length,
      payload: startPayload
    });

    console.log(`[ClientChunkManager] Created outgoing upload: ${uploadId}, chunks: ${chunks.length}`);

    return { uploadId, chunks, startPayload };
  }

  getNextChunk(uploadId: string): { index: number; data: string } | null {
    const upload = this.outgoingUploads.get(uploadId);
    if (!upload) return null;

    if (upload.sentIndex >= upload.totalChunks) {
      return null;
    }

    const index = upload.sentIndex;
    const data = upload.chunks[index];
    upload.sentIndex++;

    return { index, data };
  }

  removeOutgoingUpload(uploadId: string): void {
    this.outgoingUploads.delete(uploadId);
    console.log(`[ClientChunkManager] Removed outgoing upload: ${uploadId}`);
  }

  startIncomingUpload(payload: ChunkStartPayload): boolean {
    if (this.incomingSessions.has(payload.uploadId)) {
      return false;
    }

    this.incomingSessions.set(payload.uploadId, {
      startPayload: payload,
      chunks: new Map(),
      receivedChunks: 0
    });

    console.log(`[ClientChunkManager] Started incoming upload: ${payload.uploadId}, chunks: ${payload.totalChunks}`);
    return true;
  }

  receiveChunk(uploadId: string, chunkIndex: number, data: string): { complete: boolean; assembled?: string; payload?: ChunkStartPayload } {
    const session = this.incomingSessions.get(uploadId);
    if (!session) {
      return { complete: false };
    }

    if (!session.chunks.has(chunkIndex)) {
      session.chunks.set(chunkIndex, data);
      session.receivedChunks++;
    }

    console.log(`[ClientChunkManager] Received chunk ${chunkIndex}/${session.startPayload.totalChunks} for ${uploadId}`);

    if (session.receivedChunks === session.startPayload.totalChunks) {
      const assembled = this.assembleChunks(session);
      const payload = session.startPayload;
      this.incomingSessions.delete(uploadId);
      console.log(`[ClientChunkManager] Completed upload: ${uploadId}, size: ${assembled.length}`);
      return { complete: true, assembled, payload };
    }

    return { complete: false };
  }

  private assembleChunks(session: UploadSession): string {
    const sortedChunks: string[] = [];
    for (let i = 0; i < session.startPayload.totalChunks; i++) {
      const chunk = session.chunks.get(i);
      if (chunk === undefined) {
        throw new Error(`Missing chunk ${i} for upload ${session.startPayload.uploadId}`);
      }
      sortedChunks.push(chunk);
    }
    return sortedChunks.join('');
  }

  private cleanupOld(): void {
    const now = Date.now();
  }
}

export const clientChunkManager = new ClientChunkManager();
