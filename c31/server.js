const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const HISTORY_TTL = 5 * 60 * 1000;
const CURSOR_THROTTLE_MS = 33;
const rooms = new Map();
const roomHistory = new Map();
const roomDrawings = new Map();
const roomComments = new Map();
const cursorThrottle = new Map();

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function generateRoomId() {
  let roomId;
  do {
    roomId = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(roomId));
  return roomId;
}

async function getRoomHistory(roomId) {
  const history = roomHistory.get(roomId) || [];
  const now = Date.now();
  return history.filter(item => now - item.timestamp < HISTORY_TTL);
}

async function addToHistory(roomId, operation) {
  const history = roomHistory.get(roomId) || [];
  history.push({ ...operation, timestamp: Date.now() });
  const now = Date.now();
  const filtered = history.filter(item => now - item.timestamp < HISTORY_TTL);
  roomHistory.set(roomId, filtered);
}

async function clearRoomHistory(roomId) {
  roomHistory.delete(roomId);
}

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  socket.on('createRoom', async ({ nickname }, callback) => {
    if (!nickname || nickname.trim().length === 0) {
      callback({ success: false, error: '请输入昵称' });
      return;
    }

    const roomId = generateRoomId();
    rooms.set(roomId, new Set([socket.id]));
    socket.join(roomId);
    
    socket.roomId = roomId;
    socket.nickname = nickname.trim();

    await clearRoomHistory(roomId);

    callback({ success: true, roomId });
    io.to(roomId).emit('roomUsers', {
      users: Array.from(rooms.get(roomId)).map(id => ({
        id,
        nickname: io.sockets.sockets.get(id)?.nickname
      }))
    });
  });

  socket.on('joinRoom', async ({ roomId, nickname }, callback) => {
    if (!nickname || nickname.trim().length === 0) {
      callback({ success: false, error: '请输入昵称' });
      return;
    }

    if (!/^\d{6}$/.test(roomId)) {
      callback({ success: false, error: '房间号必须是6位数字' });
      return;
    }

    if (!rooms.has(roomId)) {
      callback({ success: false, error: '房间不存在' });
      return;
    }

    rooms.get(roomId).add(socket.id);
    socket.join(roomId);

    socket.roomId = roomId;
    socket.nickname = nickname.trim();

    const operations = await getRoomHistory(roomId);
    const comments = roomComments.get(roomId) ? [...roomComments.get(roomId).values()] : [];

    callback({ success: true, operations, comments });
    
    io.to(roomId).emit('userJoined', {
      id: socket.id,
      nickname: socket.nickname
    });
    io.to(roomId).emit('roomUsers', {
      users: Array.from(rooms.get(roomId)).map(id => ({
        id,
        nickname: io.sockets.sockets.get(id)?.nickname
      }))
    });
  });

  socket.on('draw', async (data) => {
    if (!socket.roomId) return;

    const roomId = socket.roomId;
    const drawingId = generateId();
    const drawingData = {
      ...data,
      id: drawingId,
      userId: socket.id,
      userName: socket.nickname,
      timestamp: Date.now()
    };
    
    if (!roomDrawings.has(roomId)) {
      roomDrawings.set(roomId, new Map());
    }
    roomDrawings.get(roomId).set(drawingId, drawingData);
    
    await addToHistory(roomId, drawingData);
    socket.to(roomId).emit('draw', drawingData);
  });

  socket.on('erase', ({ drawingIds }) => {
    if (!socket.roomId || !drawingIds || drawingIds.length === 0) return;
    
    const roomId = socket.roomId;
    const drawings = roomDrawings.get(roomId);
    if (!drawings) return;
    
    const erasedIds = [];
    drawingIds.forEach(id => {
      const drawing = drawings.get(id);
      if (drawing && drawing.userId === socket.id) {
        erasedIds.push(id);
        drawings.delete(id);
      }
    });
    
    if (erasedIds.length > 0) {
      io.to(roomId).emit('erased', { drawingIds: erasedIds });
    }
  });

  socket.on('cursorMove', (data) => {
    if (!socket.roomId) return;
    
    const now = Date.now();
    const lastEmit = cursorThrottle.get(socket.id) || 0;
    
    if (now - lastEmit >= CURSOR_THROTTLE_MS) {
      cursorThrottle.set(socket.id, now);
      socket.to(socket.roomId).emit('cursorMove', {
        ...data,
        userId: socket.id,
        nickname: socket.nickname
      });
    }
  });

  socket.on('addComment', (data, callback) => {
    if (!socket.roomId) return;
    
    const roomId = socket.roomId;
    const commentId = generateId();
    const commentData = {
      id: commentId,
      userId: socket.id,
      userName: socket.nickname,
      ...data,
      timestamp: Date.now()
    };
    
    if (!roomComments.has(roomId)) {
      roomComments.set(roomId, new Map());
    }
    roomComments.get(roomId).set(commentId, commentData);
    
    io.to(roomId).emit('commentAdded', commentData);
    callback({ success: true, comment: commentData });
  });

  socket.on('deleteComment', ({ commentId }) => {
    if (!socket.roomId || !commentId) return;
    
    const roomId = socket.roomId;
    const comments = roomComments.get(roomId);
    if (!comments) return;
    
    const comment = comments.get(commentId);
    if (comment && comment.userId === socket.id) {
      comments.delete(commentId);
      io.to(roomId).emit('commentDeleted', { commentId });
    }
  });

  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
    cursorThrottle.delete(socket.id);
    
    if (socket.roomId && rooms.has(socket.roomId)) {
      const roomId = socket.roomId;
      const users = rooms.get(roomId);
      users.delete(socket.id);

      io.to(roomId).emit('userLeft', {
        id: socket.id,
        nickname: socket.nickname
      });

      if (users.size === 0) {
        rooms.delete(roomId);
        clearRoomHistory(roomId);
        roomDrawings.delete(roomId);
        roomComments.delete(roomId);
      } else {
        io.to(roomId).emit('roomUsers', {
          users: Array.from(users).map(id => ({
            id,
            nickname: io.sockets.sockets.get(id)?.nickname
          }))
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
