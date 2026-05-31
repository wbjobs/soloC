const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  socket.on('createRoom', (callback) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.join(roomId);
    rooms.set(roomId, {
      creator: socket.id,
      users: [socket.id]
    });
    console.log('房间创建:', roomId);
    callback({ roomId, success: true });
  });

  socket.on('joinRoom', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (room && room.users.length < 2) {
      socket.join(roomId);
      room.users.push(socket.id);
      console.log('用户', socket.id, '加入房间', roomId);
      
      io.to(room.creator).emit('userJoined', { userId: socket.id });
      
      callback({ 
        success: true, 
        roomId,
        partnerId: room.creator 
      });
    } else if (!room) {
      callback({ success: false, message: '房间不存在' });
    } else {
      callback({ success: false, message: '房间已满' });
    }
  });

  socket.on('offer', ({ roomId, offer, userId }) => {
    console.log('转发Offer到', userId);
    io.to(userId).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ roomId, answer, userId }) => {
    console.log('转发Answer到', userId);
    io.to(userId).emit('answer', { answer, from: socket.id });
  });

  socket.on('iceCandidate', ({ roomId, candidate, userId }) => {
    io.to(userId).emit('iceCandidate', { candidate, from: socket.id });
  });

  socket.on('fileInfo', ({ roomId, fileInfo, userId }) => {
    io.to(userId).emit('fileInfo', { fileInfo, from: socket.id });
  });

  socket.on('requestResume', ({ roomId, receivedSize, userId }) => {
    io.to(userId).emit('requestResume', { receivedSize, from: socket.id });
  });

  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
    
    rooms.forEach((room, roomId) => {
      const userIndex = room.users.indexOf(socket.id);
      if (userIndex !== -1) {
        room.users.splice(userIndex, 1);
        
        if (room.users.length === 0) {
          rooms.delete(roomId);
          console.log('房间删除:', roomId);
        } else {
          room.users.forEach(userId => {
            io.to(userId).emit('partnerDisconnected');
          });
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`信令服务器运行在端口 ${PORT}`);
});
