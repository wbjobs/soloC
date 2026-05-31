const mongoose = require('mongoose');

const floorPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  fileUrl: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['glb', 'gltf', 'obj'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('FloorPlan', floorPlanSchema);
