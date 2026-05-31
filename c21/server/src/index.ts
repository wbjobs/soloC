import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { sessionManager } from './sessionManager';
import { chunkManager } from './chunkManager';
import { conflictManager, PendingContent } from './conflictManager';
import { WSMessage, AuthPayload, SyncPayload, ChunkStartPayload, ChunkDataPayload, ChunkEndPayload, ConflictResolvePayload } from './types';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 8080;

const demoCredentials = sessionManager.registerUser('demo', 'demo123');
console.log(`[Demo] Test credentials - userId: ${demoCredentials.userId}, token: ${demoCredentials.token}`);

const deviceWSMap: Map<string, WebSocket> = new Map();
const wsDeviceMap: Map<WebSocket, string> = new Map();

wss.on('connection', (ws: WebSocket) => {
  console.log('[WebSocket] New connection established');

  ws.on('message', (data: string) => {
    try {
      const message: WSMessage = JSON.parse(data.toString());
      handleMessage(ws, message);
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
      sendError(ws, 'Invalid message format');
    }
  });

  ws.on('close', () => {
    const deviceId = wsDeviceMap.get(ws);
    if (deviceId) {
      handleDisconnect(deviceId, ws);
    }
    console.log('[WebSocket] Connection closed');
  });

  ws.on('error', (error) => {
    console.error('[WebSocket] Error:', error);
    const deviceId = wsDeviceMap.get(ws);
    if (deviceId) {
      handleDisconnect(deviceId, ws);
    }
  });
});

function handleMessage(ws: WebSocket, message: WSMessage) {
  switch (message.type) {
    case 'auth':
      handleAuth(ws, message.payload as AuthPayload);
      break;
    case 'sync':
      handleSync(ws, message.payload as SyncPayload);
      break;
    case 'heartbeat':
      handleHeartbeat(ws);
      break;
    case 'chunk-start':
      handleChunkStart(ws, message.payload as ChunkStartPayload);
      break;
    case 'chunk-data':
      handleChunkData(ws, message.payload as ChunkDataPayload);
      break;
    case 'chunk-end':
      handleChunkEnd(ws, message.payload as ChunkEndPayload);
      break;
    case 'conflict-resolve':
      handleConflictResolve(ws, message.payload as ConflictResolvePayload);
      break;
    default:
      sendError(ws, `Unknown message type: ${message.type}`);
  }
}

function handleAuth(ws: WebSocket, payload: AuthPayload) {
  const { userId, token, deviceId, deviceName } = payload;

  if (!sessionManager.authenticate(userId, token)) {
    sendError(ws, 'Authentication failed: Invalid userId or token');
    ws.close();
    return;
  }

  const existingWS = deviceWSMap.get(deviceId);
  if (existingWS && existingWS.readyState === WebSocket.OPEN) {
    existingWS.close();
  }

  const device = sessionManager.registerDevice(payload, ws);
  deviceWSMap.set(deviceId, ws);
  wsDeviceMap.set(ws, deviceId);

  const response: WSMessage = {
    type: 'auth',
    payload: {
      success: true,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      userId: device.userId
    }
  };
  ws.send(JSON.stringify(response));

  sessionManager.sendDeviceList(userId);
  console.log(`[WebSocket] Device authenticated: ${deviceName} (${deviceId})`);
}

function handleSync(ws: WebSocket, payload: SyncPayload) {
  const deviceId = wsDeviceMap.get(ws);
  if (!deviceId) {
    sendError(ws, 'Not authenticated');
    return;
  }

  const device = sessionManager.getDevice(deviceId);
  if (!device) {
    sendError(ws, 'Device not found');
    return;
  }

  if (payload.content.userId !== device.userId) {
    sendError(ws, 'Unauthorized: userId mismatch');
    return;
  }

  sessionManager.updateDeviceActivity(deviceId);

  const contentId = conflictManager.generateContentId(
    payload.content.userId,
    payload.content.type,
    payload.content.data
  );

  const pendingContent: PendingContent = {
    contentId,
    userId: payload.content.userId,
    fromDeviceId: deviceId,
    fromDeviceName: device.deviceName,
    type: payload.content.type,
    data: payload.content.data,
    timestamp: payload.content.timestamp,
    targetDeviceIds: payload.targetDeviceIds,
    encrypted: payload.content.encrypted
  };

  const check = conflictManager.addPendingContent(pendingContent);

  if (check.conflict && check.conflictId && check.existing && check.recommendation) {
    const conflict = conflictManager.getConflict(check.conflictId);
    if (conflict) {
      console.log(`[Server] Conflict detected: ${check.conflictId} between ${conflict.deviceA.fromDeviceName} and ${conflict.deviceB.fromDeviceName}`);
      
      const conflictPayloadA = {
        contentId: check.conflictId,
        localContent: {
          type: conflict.deviceA.type,
          data: conflict.deviceA.data,
          timestamp: conflict.deviceA.timestamp,
          fromDeviceId: conflict.deviceA.fromDeviceId,
          fromDeviceName: conflict.deviceA.fromDeviceName
        },
        remoteContent: {
          type: conflict.deviceB.type,
          data: conflict.deviceB.data,
          timestamp: conflict.deviceB.timestamp,
          fromDeviceId: conflict.deviceB.fromDeviceId,
          fromDeviceName: conflict.deviceB.fromDeviceName
        },
        serverRecommendation: check.recommendation,
        reason: check.reason
      };
      
      const conflictPayloadB = {
        contentId: check.conflictId,
        localContent: {
          type: conflict.deviceB.type,
          data: conflict.deviceB.data,
          timestamp: conflict.deviceB.timestamp,
          fromDeviceId: conflict.deviceB.fromDeviceId,
          fromDeviceName: conflict.deviceB.fromDeviceName
        },
        remoteContent: {
          type: conflict.deviceA.type,
          data: conflict.deviceA.data,
          timestamp: conflict.deviceA.timestamp,
          fromDeviceId: conflict.deviceA.fromDeviceId,
          fromDeviceName: conflict.deviceA.fromDeviceName
        },
        serverRecommendation: check.recommendation === 'local' ? 'remote' : 'local',
        reason: check.reason
      };

      const deviceA = sessionManager.getDevice(conflict.deviceA.fromDeviceId);
      const deviceB = sessionManager.getDevice(conflict.deviceB.fromDeviceId);

      if (deviceA && deviceA.ws && deviceA.ws.readyState === WebSocket.OPEN) {
        const message: WSMessage = {
          type: 'conflict',
          payload: conflictPayloadA
        };
        deviceA.ws.send(JSON.stringify(message));
      }

      if (deviceB && deviceB.ws && deviceB.ws.readyState === WebSocket.OPEN) {
        const message: WSMessage = {
          type: 'conflict',
          payload: conflictPayloadB
        };
        deviceB.ws.send(JSON.stringify(message));
      }

      return;
    }
  }

  const sentTo = sessionManager.syncContent(deviceId, {
    content: { ...payload.content, contentId },
    targetDeviceIds: payload.targetDeviceIds
  });

  const response: WSMessage = {
    type: 'sync',
    payload: {
      success: true,
      sentTo: sentTo,
      contentId
    }
  };
  ws.send(JSON.stringify(response));
}

function handleConflictResolve(ws: WebSocket, payload: ConflictResolvePayload) {
  const deviceId = wsDeviceMap.get(ws);
  if (!deviceId) {
    sendError(ws, 'Not authenticated');
    return;
  }

  const device = sessionManager.getDevice(deviceId);
  if (!device) return;

  const resolution = conflictManager.resolveConflict(
    payload.contentId,
    device.userId,
    payload.choice
  );

  if (!resolution) {
    sendError(ws, 'Conflict not found');
    return;
  }

  const winner = resolution.winnerContent;
  console.log(`[Server] Conflict resolved: ${payload.contentId}, winner: ${payload.choice} (${winner.fromDeviceName})`);

  const content = {
    type: winner.type,
    data: winner.data,
    timestamp: Date.now(),
    fromDeviceId: winner.fromDeviceId,
    userId: winner.userId,
    encrypted: winner.encrypted,
    contentId: payload.contentId
  };

  const userDevices = sessionManager.getDevicesByUser(device.userId);
  
  for (const targetDevice of userDevices) {
    if (targetDevice.isOnline && targetDevice.ws && targetDevice.ws.readyState === WebSocket.OPEN) {
      const message: WSMessage = {
        type: 'sync',
        payload: {
          content,
          fromDeviceId: winner.fromDeviceId,
          fromDeviceName: winner.fromDeviceName,
          conflictResolved: true,
          winner: payload.choice
        }
      };
      
      try {
        targetDevice.ws.send(JSON.stringify(message));
        sessionManager.addSyncLog({
          id: uuidv4(),
          userId: winner.userId,
          fromDeviceId: winner.fromDeviceId,
          toDeviceId: targetDevice.deviceId,
          contentType: winner.type,
          timestamp: Date.now(),
          dataSize: winner.data.length,
          success: true
        });
      } catch (error) {
        console.error(`[Server] Failed to send resolved content to ${targetDevice.deviceId}:`, error);
      }
    }
  }
}

function handleHeartbeat(ws: WebSocket) {
  const deviceId = wsDeviceMap.get(ws);
  if (deviceId) {
    sessionManager.updateDeviceActivity(deviceId);
  }
  const response: WSMessage = {
    type: 'heartbeat',
    payload: { timestamp: Date.now() }
  };
  ws.send(JSON.stringify(response));
}

function handleDisconnect(deviceId: string, ws: WebSocket) {
  sessionManager.disconnectDevice(deviceId);
  const device = sessionManager.getDevice(deviceId);
  if (device) {
    sessionManager.sendDeviceList(device.userId);
  }
  deviceWSMap.delete(deviceId);
  wsDeviceMap.delete(ws);
}

function sendError(ws: WebSocket, error: string) {
  const message: WSMessage = {
    type: 'error',
    payload: { error }
  };
  ws.send(JSON.stringify(message));
}

function sendChunkAck(ws: WebSocket, uploadId: string, status: 'started' | 'received' | 'completed' | 'error', chunkIndex?: number, error?: string) {
  const message: WSMessage = {
    type: 'chunk-ack',
    payload: {
      uploadId,
      status,
      chunkIndex,
      error
    }
  };
  ws.send(JSON.stringify(message));
}

function handleChunkStart(ws: WebSocket, payload: ChunkStartPayload) {
  const deviceId = wsDeviceMap.get(ws);
  if (!deviceId) {
    sendChunkAck(ws, payload.uploadId, 'error', undefined, 'Not authenticated');
    return;
  }

  const device = sessionManager.getDevice(deviceId);
  if (!device || device.userId !== payload.userId) {
    sendChunkAck(ws, payload.uploadId, 'error', undefined, 'Unauthorized');
    return;
  }

  const success = chunkManager.startUpload(payload);
  if (!success) {
    sendChunkAck(ws, payload.uploadId, 'error', undefined, 'Upload already exists');
    return;
  }

  sendChunkAck(ws, payload.uploadId, 'started');
}

function handleChunkData(ws: WebSocket, payload: ChunkDataPayload) {
  const session = chunkManager.getSession(payload.uploadId);
  if (!session) {
    sendChunkAck(ws, payload.uploadId, 'error', payload.chunkIndex, 'Upload session not found');
    return;
  }

  const result = chunkManager.receiveChunk(payload.uploadId, payload.chunkIndex, payload.data);
  sendChunkAck(ws, payload.uploadId, 'received', payload.chunkIndex);

  if (result.complete && result.assembled) {
    forwardChunkedContent(ws, session.startPayload, result.assembled);
    chunkManager.removeSession(payload.uploadId);
  }
}

function handleChunkEnd(ws: WebSocket, payload: ChunkEndPayload) {
  chunkManager.removeSession(payload.uploadId);
  sendChunkAck(ws, payload.uploadId, 'completed');
}

function forwardChunkedContent(ws: WebSocket, startPayload: ChunkStartPayload, data: string) {
  const deviceId = wsDeviceMap.get(ws);
  if (!deviceId) return;

  const device = sessionManager.getDevice(deviceId);
  if (!device) return;

  const sourceDeviceName = device.deviceName;
  const userDevices = sessionManager.getDevicesByUser(startPayload.userId);
  const targetDevices = startPayload.targetDeviceIds
    ? userDevices.filter(d => startPayload.targetDeviceIds!.includes(d.deviceId))
    : userDevices.filter(d => d.deviceId !== deviceId);

  const sentTo: string[] = [];

  for (const targetDevice of targetDevices) {
    if (targetDevice.isOnline && targetDevice.ws && targetDevice.ws.readyState === WebSocket.OPEN) {
      forwardToDevice(targetDevice.ws, targetDevice.deviceId, startPayload, data, sourceDeviceName);
      sentTo.push(targetDevice.deviceId);

      sessionManager.addSyncLog({
        id: uuidv4(),
        userId: startPayload.userId,
        fromDeviceId: deviceId,
        toDeviceId: targetDevice.deviceId,
        contentType: startPayload.contentType,
        timestamp: Date.now(),
        dataSize: startPayload.totalSize,
        success: true
      });
    }
  }

  sessionManager.updateDeviceActivity(deviceId);

  const response: WSMessage = {
    type: 'sync',
    payload: {
      success: true,
      sentTo: sentTo,
      contentId: Date.now()
    }
  };
  ws.send(JSON.stringify(response));
}

function forwardToDevice(targetWs: WebSocket, targetDeviceId: string, startPayload: ChunkStartPayload, data: string, sourceDeviceName: string) {
  const content = {
    type: startPayload.contentType,
    data: data,
    timestamp: Date.now(),
    fromDeviceId: startPayload.fromDeviceId,
    userId: startPayload.userId,
    encrypted: startPayload.encrypted
  };

  if (data.length <= chunkManager.getChunkSize()) {
    const message: WSMessage = {
      type: 'sync',
      payload: {
        content,
        fromDeviceId: startPayload.fromDeviceId,
        fromDeviceName: sourceDeviceName
      }
    };
    try {
      targetWs.send(JSON.stringify(message));
    } catch (e) {
      console.error(`[Server] Failed to send to ${targetDeviceId}:`, e);
    }
    return;
  }

  const chunks = chunkManager.splitIntoChunks(data);
  const uploadId = `forward-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const startMsg: WSMessage = {
    type: 'chunk-start',
    payload: {
      uploadId,
      totalChunks: chunks.length,
      totalSize: data.length,
      contentType: startPayload.contentType,
      fromDeviceId: startPayload.fromDeviceId,
      userId: startPayload.userId,
      encrypted: startPayload.encrypted,
      fromDeviceName: sourceDeviceName
    }
  };

  try {
    targetWs.send(JSON.stringify(startMsg));

    chunks.forEach((chunk, index) => {
      const chunkMsg: WSMessage = {
        type: 'chunk-data',
        payload: {
          uploadId,
          chunkIndex: index,
          data: chunk
        }
      };
      setTimeout(() => {
        if (targetWs.readyState === WebSocket.OPEN) {
          targetWs.send(JSON.stringify(chunkMsg));
        }
      }, index * 10);
    });

    setTimeout(() => {
      if (targetWs.readyState === WebSocket.OPEN) {
        const endMsg: WSMessage = {
          type: 'chunk-end',
          payload: { uploadId, fromDeviceName: sourceDeviceName }
        };
        targetWs.send(JSON.stringify(endMsg));
      }
    }, chunks.length * 10 + 50);
  } catch (e) {
    console.error(`[Server] Failed to forward chunked content to ${targetDeviceId}:`, e);
  }
}

app.get('/api/devices', (req, res) => {
  const devices = sessionManager.getOnlineDevices().map(d => ({
    deviceId: d.deviceId,
    deviceName: d.deviceName,
    userId: d.userId,
    connectedAt: d.connectedAt,
    lastActiveAt: d.lastActiveAt
  }));
  res.json({ devices });
});

app.get('/api/logs', (req, res) => {
  const page = parseInt(req.query.page ? String(req.query.page) as string) || 1;
  const pageSize = parseInt(req.query.pageSize ? String(req.query.pageSize) as string) || 50;
  
  const allLogs = sessionManager.getSyncLogs();
  const total = allLogs.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const logs = allLogs.slice(start, end);
  
  res.json({
    logs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasMore: end < total
    }
  });
});

app.get('/api/users', (req, res) => {
  const users = Array.from(sessionManager['sessions'].values()).map(s => ({
    userId: s.userId,
    username: s.username,
    createdAt: s.createdAt,
    deviceCount: sessionManager.getDevicesByUser(s.userId).length
  }));
  res.json({ users });
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const credentials = sessionManager.registerUser(username, password);
  res.json(credentials);
});

app.use(express.static(path.join(__dirname, '../../web-admin')));

server.listen(PORT, () => {
  console.log(`[Server] HTTP server running on port ${PORT}`);
  console.log(`[Server] WebSocket server ready on ws://localhost:${PORT}`);
  console.log(`[Server] Admin panel available at http://localhost:${PORT}`);
});
