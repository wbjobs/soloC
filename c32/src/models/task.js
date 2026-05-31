const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  taskId: {
    type: String,
    required: true,
    unique: true
  },
  sql: {
    type: String,
    required: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  targetTenants: {
    type: [String],
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  result: {
    type: Object,
    default: null
  },
  error: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  }
});

taskSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('Task', taskSchema);
