const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const floorPlanRoutes = require('./routes/floorPlanRoutes');
const lightingConfigRoutes = require('./routes/lightingConfigRoutes');
const renderTaskRoutes = require('./routes/renderTaskRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB 连接成功'))
.catch(err => console.error('MongoDB 连接失败:', err));

app.use('/api/floorplans', floorPlanRoutes);
app.use('/api/lighting-configs', lightingConfigRoutes);
app.use('/api/render-tasks', renderTaskRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '3D光照模拟工具API运行正常' });
});

app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});
