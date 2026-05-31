const Task = require('../models/task');

const createTask = async (taskData) => {
  const task = new Task(taskData);
  return task.save();
};

const getTask = async (taskId) => {
  return Task.findOne({ taskId });
};

const updateTaskStatus = async (taskId, status, additionalData = {}) => {
  const updateData = { status, ...additionalData };
  
  if (status === 'processing') {
    updateData.startedAt = new Date();
  } else if (status === 'completed' || status === 'failed') {
    updateData.completedAt = new Date();
  }
  
  return Task.findOneAndUpdate(
    { taskId },
    updateData,
    { new: true }
  );
};

const getTasksByTenant = async (tenantId, limit = 100) => {
  return Task.find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = {
  createTask,
  getTask,
  updateTaskStatus,
  getTasksByTenant
};
