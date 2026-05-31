const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function broadcastToRoom(roomId, message, excludeWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let userId = Math.random().toString(36).substring(2, 9);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'CREATE_ROOM':
          const roomId = generateRoomId();
          rooms.set(roomId, new Set([ws]));
          currentRoom = roomId;
          ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            roomId,
            userId
          }));
          break;

        case 'JOIN_ROOM':
          const joinRoomId = message.roomId;
          if (rooms.has(joinRoomId)) {
            const room = rooms.get(joinRoomId);
            room.add(ws);
            currentRoom = joinRoomId;
            
            ws.send(JSON.stringify({
              type: 'ROOM_JOINED',
              roomId: joinRoomId,
              userId,
              peerCount: room.size
            }));
            
            broadcastToRoom(joinRoomId, {
              type: 'PEER_JOINED',
              userId,
              peerCount: room.size
            }, ws);
          } else {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: 'Room not found'
            }));
          }
          break;

        case 'SIGNAL':
          if (currentRoom) {
            broadcastToRoom(currentRoom, {
              type: 'SIGNAL',
              from: userId,
              signal: message.signal
            }, ws);
          }
          break;

        case 'SYNC_CODE':
          if (currentRoom) {
            broadcastToRoom(currentRoom, {
              type: 'CODE_SYNC',
              from: userId,
              code: message.code,
              version: message.version,
              cursor: message.cursor
            }, ws);
          }
          break;

        case 'LEAVE_ROOM':
          if (currentRoom && rooms.has(currentRoom)) {
            const room = rooms.get(currentRoom);
            room.delete(ws);
            
            if (room.size === 0) {
              rooms.delete(currentRoom);
            } else {
              broadcastToRoom(currentRoom, {
                type: 'PEER_LEFT',
                userId,
                peerCount: room.size
              });
            }
            currentRoom = null;
          }
          break;
      }
    } catch (error) {
      console.error('Message error:', error);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.delete(ws);
      
      if (room.size === 0) {
        rooms.delete(currentRoom);
      } else {
        broadcastToRoom(currentRoom, {
          type: 'PEER_LEFT',
          userId,
          peerCount: room.size
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});
