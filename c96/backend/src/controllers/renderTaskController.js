const RenderTask = require('../models/RenderTask');

exports.getAllTasks = async (req, res) => {
  try {
    const tasks = await RenderTask.find()
      .populate('floorPlanId')
      .populate('configId')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTaskById = async (req, res) => {
  try {
    const task = await RenderTask.findById(req.params.id)
      .populate('floorPlanId')
      .populate('configId');
    if (!task) {
      return res.status(404).json({ error: '任务未找到' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createTask = async (req, res) => {
  try {
    const task = new RenderTask(req.body);
    await task.save();
    await task.populate('floorPlanId configId');
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const task = await RenderTask.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('floorPlanId configId');
    if (!task) {
      return res.status(404).json({ error: '任务未找到' });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const task = await RenderTask.findByIdAndDelete(req.params.id);
    if (!task) {
      return res.status(404).json({ error: '任务未找到' });
    }
    res.json({ message: '任务已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
