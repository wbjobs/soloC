const { connectMongoDB } = require('./services/mongodb');
const { connectPostgreSQL } = require('./services/postgresql');
const { consumeMessages } = require('./services/rabbitmq');
const { updateTaskStatus } = require('./repositories/taskRepository');
const ImpactAnalyzer = require('./services/impactAnalyzer');

const analyzer = new ImpactAnalyzer();

const processTask = async (message) => {
  const { taskId, sql, tenantId, targetTenants } = message;
  
  console.log(`Processing task: ${taskId}`);
  
  await updateTaskStatus(taskId, 'processing');
  
  try {
    const result = await analyzer.analyze(sql, tenantId, targetTenants);
    
    await updateTaskStatus(taskId, 'completed', {
      result: {
        affectedObjects: result.affectedObjects,
        overallRisk: result.overallRisk,
        totalAffected: result.totalAffected,
        changes: result.changes
      }
    });
    
    console.log(`Task completed: ${taskId}`);
  } catch (error) {
    console.error(`Task failed: ${taskId}`, error);
    await updateTaskStatus(taskId, 'failed', {
      error: error.message
    });
    throw error;
  }
};

const startWorker = async () => {
  try {
    await connectMongoDB();
    await connectPostgreSQL();
    
    await consumeMessages(processTask);
    console.log('Worker started successfully');
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
};

startWorker();
