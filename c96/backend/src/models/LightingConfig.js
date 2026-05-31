const mongoose = require('mongoose');

const lightingConfigSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  floorPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FloorPlan',
    required: true
  },
  sunLight: {
    enabled: { type: Boolean, default: true },
    intensity: { type: Number, default: 1.0 },
    color: { type: String, default: '#ffffff' },
    elevation: { type: Number, default: 45 },
    azimuth: { type: Number, default: 180 },
    timeOfDay: { type: String, default: '12:00' }
  },
  ambientLight: {
    enabled: { type: Boolean, default: true },
    intensity: { type: Number, default: 0.3 },
    color: { type: String, default: '#ffffff' }
  },
  indoorLights: [{
    id: String,
    name: String,
    type: { type: String, enum: ['point', 'spot', 'directional'] },
    position: { x: Number, y: Number, z: Number },
    target: { x: Number, y: Number, z: Number },
    intensity: Number,
    color: String,
    enabled: Boolean
  }],
  shadow: {
    enabled: { type: Boolean, default: true },
    quality: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }
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

module.exports = mongoose.model('LightingConfig', lightingConfigSchema);
