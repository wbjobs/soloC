const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://localhost:27017/meeting_room';

const UserSchema = new mongoose.Schema({
  email: String,
  name: String,
  voiceEmbedding: [Number],
  voiceRegistered: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const RoomSchema = new mongoose.Schema({
  name: String,
  capacity: Number,
  location: String,
  isActive: { type: Boolean, default: true }
});

const User = mongoose.model('User', UserSchema);
const Room = mongoose.model('Room', RoomSchema);

async function initDatabase() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB 连接成功');

    await Room.deleteMany({});

    const rooms = await Room.insertMany([
      { name: '会议室1号', capacity: 10, location: '3楼东侧' },
      { name: '会议室2号', capacity: 20, location: '3楼西侧' },
      { name: '会议室3号', capacity: 50, location: '2楼大厅旁' }
    ]);

    console.log('会议室数据初始化完成:', rooms.length, '个会议室');

    console.log('\n初始化完成！');
    process.exit(0);
  } catch (error) {
    console.error('初始化失败:', error);
    process.exit(1);
  }
}

initDatabase();