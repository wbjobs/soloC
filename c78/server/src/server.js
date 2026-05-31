const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, '../uploads');
const screenshotsDir = path.join(uploadsDir, 'screenshots');
const recordingsDir = path.join(uploadsDir, 'recordings');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, screenshotsDir);
  },
  filename: (req, file, cb) => {
    const filename = `${Date.now()}-${uuidv4()}.png`;
    cb(null, filename);
  }
});

const upload = multer({ storage: storage });

const sessions = new Map();
const users = new Map();

const INSTRUCTOR_COLORS = [
  { id: 1, name: '红色', color: '#ff4444' },
  { id: 2, name: '蓝色', color: '#4488ff' },
  { id: 3, name: '绿色', color: '#44ff44' }
];

function getAvailableColor(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return INSTRUCTOR_COLORS[0];
  
  const usedColors = session.instructors.map(i => i.colorId);
  return INSTRUCTOR_COLORS.find(c => !usedColors.includes(c.id)) || INSTRUCTOR_COLORS[0];
}

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', ({ userId, role }) => {
    users.set(socket.id, { userId, role, socket });
    socket.emit('joined', { socketId: socket.id });
    broadcastUserList();
  });

  socket.on('create-session', ({ isInstructor = false, instructorName = '' }) => {
    const sessionId = uuidv4().slice(0, 8);
    const color = INSTRUCTOR_COLORS[0];
    sessions.set(sessionId, {
      id: sessionId,
      startTime: Date.now(),
      instructors: isInstructor ? [{
        socketId: socket.id,
        name: instructorName || '指导者1',
        colorId: color.id,
        color: color.color
      }] : [],
      viewers: [],
      annotations: []
    });
    socket.join(sessionId);
    socket.emit('session-created', { 
      sessionId,
      color: isInstructor ? color : null,
      instructorId: isInstructor ? socket.id : null
    });
  });

  socket.on('join-session', ({ sessionId, isInstructor = false, isViewer = false, instructorName = '' }) => {
    const session = sessions.get(sessionId);
    if (session) {
      if (isViewer) {
        session.viewers.push(socket.id);
        socket.join(sessionId);
        socket.emit('session-joined', { 
          sessionId,
          instructors: session.instructors,
          annotations: session.annotations
        });
      } else if (isInstructor) {
        if (session.instructors.length >= 3) {
          socket.emit('error', { message: '最多支持3个指导者同时在线' });
          return;
        }
        const color = getAvailableColor(sessionId);
        const instructor = {
          socketId: socket.id,
          name: instructorName || `指导者${session.instructors.length + 1}`,
          colorId: color.id,
          color: color.color
        };
        session.instructors.push(instructor);
        socket.join(sessionId);
        socket.emit('session-joined', { 
          sessionId, 
          color,
          instructorId: socket.id,
          instructors: session.instructors
        });
        io.to(sessionId).emit('instructor-joined', instructor);
      } else {
        session.viewers.push(socket.id);
        socket.join(sessionId);
        socket.emit('session-joined', { 
          sessionId,
          instructors: session.instructors,
          annotations: session.annotations
        });
      }
    } else {
      socket.emit('error', { message: '会话不存在' });
    }
  });

  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  socket.on('annotation-update', ({ sessionId, annotation, instructorId }) => {
    const session = sessions.get(sessionId);
    if (session) {
      const instructor = session.instructors.find(i => i.socketId === instructorId);
      const annotationWithMeta = {
        ...annotation,
        id: uuidv4(),
        instructorId,
        instructorName: instructor?.name || '未知',
        instructorColor: instructor?.color || annotation.color,
        timestamp: Date.now()
      };
      session.annotations.push(annotationWithMeta);
      socket.to(sessionId).emit('annotation-update', annotationWithMeta);
    }
  });

  socket.on('clear-annotations', ({ sessionId, instructorId }) => {
    const session = sessions.get(sessionId);
    if (session) {
      session.annotations = session.annotations.filter(a => a.instructorId !== instructorId);
      socket.to(sessionId).emit('instructor-cleared', { instructorId });
    }
  });

  socket.on('hang-up', ({ sessionId }) => {
    io.to(sessionId).emit('hang-up');
    sessions.delete(sessionId);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    users.delete(socket.id);
    
    sessions.forEach((session, sessionId) => {
      const instructorIndex = session.instructors.findIndex(i => i.socketId === socket.id);
      if (instructorIndex >= 0) {
        const instructor = session.instructors[instructorIndex];
        session.instructors.splice(instructorIndex, 1);
        io.to(sessionId).emit('instructor-left', { 
          instructorId: socket.id,
          instructors: session.instructors
        });
      }
      
      const viewerIndex = session.viewers.indexOf(socket.id);
      if (viewerIndex >= 0) {
        session.viewers.splice(viewerIndex, 1);
      }
      
      if (session.instructors.length === 0 && session.viewers.length === 0) {
        sessions.delete(sessionId);
      }
    });
    
    broadcastUserList();
  });
});

function broadcastUserList() {
  const userList = Array.from(users.values()).map(u => ({
    userId: u.userId,
    role: u.role
  }));
  io.emit('user-list', userList);
}

app.post('/api/screenshot', upload.single('screenshot'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const screenshotData = {
    id: uuidv4(),
    filename: req.file.filename,
    timestamp: Date.now(),
    sessionId: req.body.sessionId,
    annotations: JSON.parse(req.body.annotations || '[]')
  };
  
  const historyPath = path.join(screenshotsDir, 'history.json');
  let history = [];
  if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  }
  history.push(screenshotData);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  
  res.json({ 
    success: true, 
    filename: req.file.filename,
    id: screenshotData.id
  });
});

app.get('/api/screenshots', (req, res) => {
  const historyPath = path.join(screenshotsDir, 'history.json');
  if (fs.existsSync(historyPath)) {
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    res.json(history);
  } else {
    res.json([]);
  }
});

app.get('/api/screenshots/:filename', (req, res) => {
  const filePath = path.join(screenshotsDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.post('/api/recording/start', (req, res) => {
  const { sessionId } = req.body;
  const recordingId = uuidv4();
  res.json({ success: true, recordingId });
});

app.post('/api/recording/stop', (req, res) => {
  res.json({ success: true });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
