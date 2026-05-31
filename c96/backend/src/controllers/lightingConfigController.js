const mongoose = require('mongoose');
const LightingConfig = require('../models/LightingConfig');
const FloorPlan = require('../models/FloorPlan');

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

exports.getAllConfigs = async (req, res) => {
  try {
    const { floorPlanId } = req.query;
    const query = {};
    
    if (floorPlanId && isValidObjectId(floorPlanId)) {
      query.floorPlanId = new mongoose.Types.ObjectId(floorPlanId);
    }
    
    const configs = await LightingConfig.find(query)
      .populate('floorPlanId', 'name fileUrl fileType')
      .sort({ createdAt: -1 });
      
    res.json(configs);
  } catch (error) {
    console.error('获取配置列表错误:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getConfigById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: '无效的配置ID格式' });
    }
    
    const config = await LightingConfig.findById(id)
      .populate('floorPlanId', 'name fileUrl fileType');
      
    if (!config) {
      return res.status(404).json({ error: '配置未找到' });
    }
    res.json(config);
  } catch (error) {
    console.error('获取配置错误:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.createConfig = async (req, res) => {
  try {
    const { floorPlanId, name, sunLight, ambientLight, indoorLights, shadow } = req.body;
    
    if (!floorPlanId) {
      return res.status(400).json({ error: '缺少必填字段: floorPlanId' });
    }
    
    if (!isValidObjectId(floorPlanId)) {
      return res.status(400).json({ error: '无效的户型图ID格式' });
    }
    
    const floorPlan = await FloorPlan.findById(floorPlanId);
    if (!floorPlan) {
      return res.status(404).json({ error: '关联的户型图不存在' });
    }
    
    const config = new LightingConfig({
      name: name || '未命名配置',
      floorPlanId: new mongoose.Types.ObjectId(floorPlanId),
      sunLight: sunLight || {
        enabled: true,
        intensity: 1.0,
        color: '#ffffff',
        elevation: 45,
        azimuth: 180,
        timeOfDay: '12:00'
      },
      ambientLight: ambientLight || {
        enabled: true,
        intensity: 0.3,
        color: '#ffffff'
      },
      indoorLights: Array.isArray(indoorLights) ? indoorLights.map(light => ({
        ...light,
        position: light.position || { x: 0, y: 2, z: 0 },
        target: light.target || { x: 0, y: 0, z: 0 }
      })) : [],
      shadow: shadow || {
        enabled: true,
        quality: 'medium'
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    await config.save();
    
    await config.populate('floorPlanId', 'name fileUrl fileType');
    
    res.status(201).json(config);
  } catch (error) {
    console.error('创建配置错误:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: '无效的配置ID格式' });
    }
    
    if (updateData.floorPlanId) {
      if (!isValidObjectId(updateData.floorPlanId)) {
        return res.status(400).json({ error: '无效的户型图ID格式' });
      }
      
      const floorPlan = await FloorPlan.findById(updateData.floorPlanId);
      if (!floorPlan) {
        return res.status(404).json({ error: '关联的户型图不存在' });
      }
      
      updateData.floorPlanId = new mongoose.Types.ObjectId(updateData.floorPlanId);
    }
    
    updateData.updatedAt = Date.now();
    
    const config = await LightingConfig.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('floorPlanId', 'name fileUrl fileType');
    
    if (!config) {
      return res.status(404).json({ error: '配置未找到' });
    }
    res.json(config);
  } catch (error) {
    console.error('更新配置错误:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.deleteConfig = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: '无效的配置ID格式' });
    }
    
    const config = await LightingConfig.findByIdAndDelete(id);
    if (!config) {
      return res.status(404).json({ error: '配置未找到' });
    }
    res.json({ message: '配置已删除', deletedId: id });
  } catch (error) {
    console.error('删除配置错误:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getConfigsByFloorPlan = async (req, res) => {
  try {
    const { floorPlanId } = req.params;
    
    if (!isValidObjectId(floorPlanId)) {
      return res.status(400).json({ error: '无效的户型图ID格式' });
    }
    
    const floorPlan = await FloorPlan.findById(floorPlanId);
    if (!floorPlan) {
      return res.status(404).json({ error: '户型图不存在' });
    }
    
    const configs = await LightingConfig.find({ 
      floorPlanId: new mongoose.Types.ObjectId(floorPlanId) 
    }).sort({ createdAt: -1 });
    
    res.json({
      floorPlan: {
        id: floorPlan._id,
        name: floorPlan.name
      },
      configs
    });
  } catch (error) {
    console.error('获取户型图配置错误:', error);
    res.status(500).json({ error: error.message });
  }
};
