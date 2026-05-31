import { UserSession, Device, WSMessage, AuthPayload, ClipboardContent, SyncPayload, SyncLog } from './types';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';

class SessionManager {
  private sessions: Map<string, UserSession> = new Map();
  private devices: Map<string, Device> = new Map();
  private syncLogs: SyncLog[] = [];
  private readonly MAX_LOGS = 1000;

  registerUser(username: string, password: string): { userId: string; token: string } {
    const userId = uuidv4();
    const token = this.generateToken(userId);
    const session: UserSession = {
      userId,
      username,
      token,
      createdAt: Date.now()
    };
    this.sessions.set(userId, session);
    console.log(`[SessionManager] Registered user: ${username} (${userId})`);
    return { userId, token };
  }

  authenticate(userId: string, token: string): boolean {
    const session = this.sessions.get(userId);
    return session !== undefined && session.token === token;
  }

  getSession(userId: string): UserSession | undefined {
    return this.sessions.get(userId);
  }

  registerDevice(payload: AuthPayload, ws: WebSocket): Device {
    const now = Date.now();
    const device: Device = {
      deviceId: payload.deviceId,
      userId: payload.userId,
      deviceName: payload.deviceName,
      ws,
      connectedAt: now,
      lastActiveAt: now,
      isOnline: true
    };
    this.devices.set(payload.deviceId, device);
    console.log(`[SessionManager] Device registered: ${payload.deviceName} (${payload.deviceId}) for user ${payload.userId}`);
    return device;
  }

  getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  getDevicesByUser(userId: string): Device[] {
    return Array.from(this.devices.values())
      .filter(d => d.userId === userId);
  }

  getOnlineDevices(): Device[] {
    return Array.from(this.devices.values())
      .filter(d => d.isOnline);
  }

  updateDeviceActivity(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastActiveAt = Date.now();
    }
  }

  disconnectDevice(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.isOnline = false;
      device.ws = undefined;
      console.log(`[SessionManager] Device disconnected: ${device.deviceName} (${deviceId})`);
    }
  }

  syncContent(sourceDeviceId: string, payload: SyncPayload): string[] {
    const sourceDevice = this.getDevice(sourceDeviceId);
    if (!sourceDevice) return [];

    const userDevices = this.getDevicesByUser(sourceDevice.userId);
    const targetDevices = payload.targetDeviceIds
      ? userDevices.filter(d => payload.targetDeviceIds!.includes(d.deviceId))
      : userDevices.filter(d => d.deviceId !== sourceDeviceId);

    const sentTo: string[] = [];

    for (const targetDevice of targetDevices) {
      if (targetDevice.isOnline && targetDevice.ws && targetDevice.ws.readyState === WebSocket.OPEN) {
        const message: WSMessage = {
          type: 'sync',
          payload: {
            content: payload.content,
            fromDeviceId: sourceDeviceId,
            fromDeviceName: sourceDevice.deviceName
          }
        };

        try {
          targetDevice.ws.send(JSON.stringify(message));
          sentTo.push(targetDevice.deviceId);

          this.addSyncLog({
            id: uuidv4(),
            userId: sourceDevice.userId,
            fromDeviceId: sourceDeviceId,
            toDeviceId: targetDevice.deviceId,
            contentType: payload.content.type,
            timestamp: Date.now(),
            dataSize: payload.content.data.length,
            success: true
          });
        } catch (error) {
          console.error(`[SessionManager] Failed to send to device ${targetDevice.deviceId}:`, error);
          this.addSyncLog({
            id: uuidv4(),
            userId: sourceDevice.userId,
            fromDeviceId: sourceDeviceId,
            toDeviceId: targetDevice.deviceId,
            contentType: payload.content.type,
            timestamp: Date.now(),
            dataSize: payload.content.data.length,
            success: false
          });
        }
      }
    }

    return sentTo;
  }

  addSyncLog(log: SyncLog): void {
    this.syncLogs.unshift(log);
    if (this.syncLogs.length > this.MAX_LOGS) {
      this.syncLogs = this.syncLogs.slice(0, this.MAX_LOGS);
    }
  }

  getSyncLogs(userId?: string): SyncLog[] {
    if (userId) {
      return this.syncLogs.filter(log => log.userId === userId);
    }
    return [...this.syncLogs];
  }

  sendDeviceList(userId: string): void {
    const devices = this.getDevicesByUser(userId);
    const deviceList = devices.map(d => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      isOnline: d.isOnline,
      connectedAt: d.connectedAt,
      lastActiveAt: d.lastActiveAt
    }));

    for (const device of devices) {
      if (device.isOnline && device.ws && device.ws.readyState === WebSocket.OPEN) {
        const message: WSMessage = {
          type: 'device-list',
          payload: { devices: deviceList }
        };
        try {
          device.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error(`[SessionManager] Failed to send device list to ${device.deviceId}:`, error);
        }
      }
    }
  }

  private generateToken(userId: string): string {
    return Buffer.from(`${userId}-${Date.now()}-${Math.random()}`).toString('base64');
  }
}

export const sessionManager = new SessionManager();
