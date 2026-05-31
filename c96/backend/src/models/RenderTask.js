const mongoose = require('mongoose');

const renderTaskSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  floorPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FloorPlan',
    required: true
  },
  configId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LightingConfig',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  type: {
    type: String,
    enum: ['image', 'video'],
    required: true
  },
  resolution: {
    width: { type: Number, default: 1920 },
    height: { type: Number, default: 1080 }
  },
  duration: { type: Number, default: 10 },
  outputUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date
});

module.exports = mongoose.model('RenderTask', renderTaskSchema);
