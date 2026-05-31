const express = require('express');
const config = require('./config');
const routes = require('./routes');
const { connectMongoDB } = require('./services/mongodb');
const { connectPostgreSQL } = require('./services/postgresql');

const app = express();

app.use(express.json());
app.use('/api', routes);

const startServer = async () => {
  try {
    await connectMongoDB();
    await connectPostgreSQL();
    
    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
