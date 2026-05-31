const mongoose = require('mongoose');
const config = require('../config');

const connectMongoDB = async () => {
  try {
    await mongoose.connect(config.mongodb.uri);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
};

const disconnectMongoDB = async () => {
  await mongoose.disconnect();
};

module.exports = {
  connectMongoDB,
  disconnectMongoDB
};
