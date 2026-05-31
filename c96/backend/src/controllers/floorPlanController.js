const mongoose = require('mongoose');
const FloorPlan = require('../models/FloorPlan');
const LightingConfig = require('../models/LightingConfig');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

exports.getAllFloorPlans = async (req, res) => {
  try {
    const floorPlans = await FloorPlan.find().sort({ createdAt: -1 });
    res.json(floorPlans);
  } catch (error) {
    console.error('获取户型图列表错误:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getFloorPlanById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: '无效的户型图ID格式' });
    }
    
    const floorPlan = await FloorPlan.findById(id);
    if (!floorPlan) {
      return res.status(404).json({ error: '户型图未找到' });
    }
    res.json(floorPlan);
  } catch (error) {
    console.error('获取户型图错误:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.uploadFloorPlan = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    const { name, description } = req.body;
    const fileExt = path.extname(req.file.originalname).toLowerCase().slice(1);
    
    const validTypes = ['glb', 'gltf', 'obj'];
    const fileType = validTypes.includes(fileExt) ? fileExt : 'glb';
    
    const floorPlan = new FloorPlan({
      name: name || req.file.originalname,
      description: description || '',
      fileUrl: `/uploads/${req.file.filename}`,
      fileType
    });

    await floorPlan.save();
    res.status(201).json(floorPlan);
  } catch (error) {
    console.error('上传户型图错误:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.deleteFloorPlan = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ error: '无效的户型图ID格式' });
    }
    
    const floorPlan = await FloorPlan.findById(id).session(session);
    if (!floorPlan) {
      await session.abortTransaction();
      return res.status(404).json({ error: '户型图未找到' });
    }

    const deleteResult = await LightingConfig.deleteMany(
      { floorPlanId: new mongoose.Types.ObjectId(id) },
      { session }
    );
    
    console.log(`级联删除了 ${deleteResult.deletedCount} 个关联的光照配置`);

    await FloorPlan.findByIdAndDelete(id).session(session);

    const filePath = path.join(__dirname, '../../', floorPlan.fileUrl);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log('模型文件已删除:', filePath);
      } catch (fileErr) {
        console.warn('删除文件失败，但事务继续:', fileErr.message);
      }
    }

    await session.commitTransaction();
    
    res.json({ 
      message: '户型图及关联配置已删除',
      deletedConfigs: deleteResult.deletedCount
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('删除户型图错误:', error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

exports.getFloorPlanStats = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: '无效的户型图ID格式' });
    }
    
    const configCount = await LightingConfig.countDocuments({ 
      floorPlanId: new mongoose.Types.ObjectId(id) 
    });
    
    res.json({
      floorPlanId: id,
      configCount
    });
  } catch (error) {
    console.error('获取户型图统计错误:', error);
    res.status(500).json({ error: error.message });
  }
};
