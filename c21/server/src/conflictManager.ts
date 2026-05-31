import { v4 as uuidv4 } from 'uuid';

export interface PendingContent {
  contentId: string;
  userId: string;
  fromDeviceId: string;
  fromDeviceName: string;
  type: 'text' | 'image';
  data: string;
  timestamp: number;
  targetDeviceIds?: string[];
  encrypted: boolean;
}

export interface ActiveConflict {
  contentId: string;
  userId: string;
  deviceA: PendingContent;
  deviceB: PendingContent;
  createdAt: number;
}

export interface ConflictResolution {
  contentId: string;
  winner: 'local' | 'remote';
  winnerContent: PendingContent;
  resolvedAt: number;
}

const CONFLICT_WINDOW_MS = 5000;

class ConflictManager {
  private pendingContents: Map<string, PendingContent[]> = new Map();
  private activeConflicts: Map<string, ActiveConflict> = new Map();
  private deviceIdToConflictId: Map<string, string> = new Map();
  private resolutions: Map<string, ConflictResolution> = new Map();
  private timeoutHandles: Map<string, NodeJS.Timeout> = new Map();

  generateContentId(userId: string, type: string, data: string): string {
    return `${userId}-${type}-${uuidv4().slice(0, 8)}`;
  }

  addPendingContent(content: PendingContent): { 
    conflict: boolean; 
    conflictId?: string;
    existing?: PendingContent;
    recommendation?: 'local' | 'remote';
    reason?: string;
  } {
    const userId = content.userId;
    
    if (!this.pendingContents.has(userId)) {
      this.pendingContents.set(userId, []);
    }
    
    const userContents = this.pendingContents.get(userId)!;
    
    const existing = userContents.find(
      c => c.fromDeviceId !== content.fromDeviceId && 
           c.type === content.type &&
           this.isWithinConflictWindow(c.timestamp, content.timestamp)
    );
    
    if (existing) {
      const conflictId = `conflict-${uuidv4().slice(0, 8)}`;
      const conflict: ActiveConflict = {
        contentId: conflictId,
        userId,
        deviceA: existing,
        deviceB: content,
        createdAt: Date.now()
      };
      
      this.activeConflicts.set(conflictId, conflict);
      this.deviceIdToConflictId.set(existing.fromDeviceId, conflictId);
      this.deviceIdToConflictId.set(content.fromDeviceId, conflictId);
      
      this.pendingContents.set(userId, userContents.filter(c => c.contentId !== existing.contentId));
      
      const deviceANewer = conflict.deviceA.timestamp >= conflict.deviceB.timestamp;
      const recommendation = deviceANewer ? 'local' : 'remote';
      const reason = deviceANewer
        ? `来自 ${conflict.deviceA.fromDeviceName} 的内容更新 (${this.formatTime(conflict.deviceA.timestamp)})`
        : `来自 ${conflict.deviceB.fromDeviceName} 的内容更新 (${this.formatTime(conflict.deviceB.timestamp)})`;
      
      return { 
        conflict: true, 
        conflictId,
        existing,
        recommendation,
        reason
      };
    }
    
    userContents.push(content);
    
    if (!this.timeoutHandles.has(userId)) {
      const handle = setTimeout(() => {
        this.cleanupOldContents(userId);
      }, CONFLICT_WINDOW_MS + 1000);
      this.timeoutHandles.set(userId, handle);
    }
    
    return { conflict: false };
  }

  getConflict(conflictId: string): ActiveConflict | undefined {
    return this.activeConflicts.get(conflictId);
  }

  getConflictForDevice(deviceId: string): ActiveConflict | undefined {
    const conflictId = this.deviceIdToConflictId.get(deviceId);
    if (!conflictId) return undefined;
    return this.activeConflicts.get(conflictId);
  }

  resolveConflict(conflictId: string, userId: string, choice: 'local' | 'remote'): ConflictResolution | null {
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) return null;
    
    const winnerContent = choice === 'local' ? conflict.deviceA : conflict.deviceB;
    
    const resolution: ConflictResolution = {
      contentId: conflictId,
      winner: choice,
      winnerContent,
      resolvedAt: Date.now()
    };
    
    this.resolutions.set(conflictId, resolution);
    this.activeConflicts.delete(conflictId);
    this.deviceIdToConflictId.delete(conflict.deviceA.fromDeviceId);
    this.deviceIdToConflictId.delete(conflict.deviceB.fromDeviceId);
    
    return resolution;
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  private isWithinConflictWindow(t1: number, t2: number): boolean {
    return Math.abs(t1 - t2) <= CONFLICT_WINDOW_MS;
  }

  private cleanupOldContents(userId: string): void {
    const userContents = this.pendingContents.get(userId);
    if (!userContents) return;
    
    const now = Date.now();
    const filtered = userContents.filter(
      c => now - c.timestamp <= CONFLICT_WINDOW_MS
    );
    
    if (filtered.length === 0) {
      this.pendingContents.delete(userId);
      if (this.timeoutHandles.has(userId)) {
        clearTimeout(this.timeoutHandles.get(userId)!);
        this.timeoutHandles.delete(userId);
      }
    } else {
      this.pendingContents.set(userId, filtered);
      const handle = setTimeout(() => {
        this.cleanupOldContents(userId);
      }, CONFLICT_WINDOW_MS + 1000);
      this.timeoutHandles.set(userId, handle);
    }
  }

  removePendingContent(userId: string, contentId: string): void {
    const userContents = this.pendingContents.get(userId);
    if (!userContents) return;
    
    const index = userContents.findIndex(c => c.contentId === contentId);
    if (index !== -1) {
      userContents.splice(index, 1);
    }
  }
}

export const conflictManager = new ConflictManager();
