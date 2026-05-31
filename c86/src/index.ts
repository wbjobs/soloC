import { config } from './config';
import { createApiServer } from './api';
import { kafkaService } from './kafka';
import { metricsService } from './influxdb';
import { storageService } from './storage';
import { protobufLoader } from './protobuf';
import { SignalProcessor } from './signal-processor';

async function main() {
  console.log('Starting Signal Processing API Server...');

  await protobufLoader.load();
  console.log('Protobuf definitions loaded');

  try {
    await kafkaService.connect();
  } catch (error) {
    console.warn('Could not connect to Kafka, running in local mode only:', (error as Error).message);
  }

  try {
    metricsService.connect();
  } catch (error) {
    console.warn('Could not connect to InfluxDB:', (error as Error).message);
  }

  const app = createApiServer();

  const server = app.listen(config.server.port, () => {
    console.log(`API Server running on http://localhost:${config.server.port}`);
    console.log(`Environment: ${config.server.nodeEnv}`);
    console.log('');
    console.log('Available endpoints:');
    console.log('  GET  /health                  - Health check');
    console.log('  GET  /api/stats               - Processing statistics');
    console.log('  POST /api/tasks               - Submit new processing task');
    console.log('  GET  /api/tasks               - List all tasks');
    console.log('  GET  /api/tasks/:taskId       - Get task status');
    console.log('  GET  /api/tasks/:taskId/result - Get task result');
    console.log('  GET  /api/tasks/:taskId/candidates - Get pulsar candidates');
    console.log('  GET  /api/tasks/:taskId/download/csv - Download CSV result');
    console.log('  GET  /api/tasks/:taskId/download/json - Download JSON result');
    console.log('  POST /api/tasks/:taskId/reprocess - Reprocess task');
    console.log('  GET  /api/metrics             - Get processing metrics');
    console.log('');
  });

  const signalProcessor = new SignalProcessor();

  try {
    await kafkaService.consumeTasks(async (task) => {
      console.log(`Processing task: ${task.taskId}`);
      storageService.updateTaskStatus(task.taskId, 'processing', 10);

      try {
        const startTime = Date.now();

        storageService.updateTaskStatus(task.taskId, 'processing', 30);
        const result = signalProcessor.process(task.signalData);

        storageService.updateTaskStatus(task.taskId, 'processing', 80);
        const processingTimeMs = Date.now() - startTime;

        const processingResult = {
          taskId: task.taskId,
          candidates: result.candidates,
          startedAt: startTime,
          completedAt: Date.now(),
          processingTimeMs,
          initialSnr: result.initialSnr,
          finalSnr: result.finalSnr,
          status: 'completed' as const,
          rfiRemoved: result.rfiRemoved,
          rfiCount: result.rfiCount,
          rfiInfo: result.rfiInfo,
        };

        storageService.saveResult(processingResult);

        try {
          await metricsService.recordProcessingMetrics({
            taskId: task.taskId,
            processingTimeMs,
            initialSnr: result.initialSnr,
            finalSnr: result.finalSnr,
            candidateCount: result.candidates.length,
            sourceName: task.signalData.sourceName,
          });
        } catch (metricsError) {
          console.warn('Could not record metrics:', (metricsError as Error).message);
        }

        try {
          await kafkaService.sendResult(processingResult);
        } catch (kafkaError) {
          console.warn('Could not send result to Kafka:', (kafkaError as Error).message);
        }

        storageService.updateTaskStatus(task.taskId, 'completed', 100);
        console.log(`Task ${task.taskId} completed in ${processingTimeMs.toFixed(2)}ms`);
        console.log(`  Found ${result.candidates.length} candidates`);
        console.log(`  RFI removed: ${result.rfiRemoved ? 'Yes' : 'No'}, count: ${result.rfiCount}`);
        if (result.rfiCount > 0) {
          console.log('  Flagged RFI frequencies:');
          result.rfiInfo.slice(0, 5).forEach(r => {
            console.log(`    ${r.frequencyHz.toFixed(2)} Hz`);
          });
          if (result.rfiCount > 5) console.log(`    ... and ${result.rfiCount - 5} more`);
        }
      } catch (error) {
        console.error(`Error processing task ${task.taskId}:`, error);
        storageService.setTaskError(task.taskId, (error as Error).message);
      }
    });
  } catch (error) {
    console.warn('Could not start Kafka consumer:', (error as Error).message);
  }

  const cleanupInterval = setInterval(() => {
    storageService.cleanupOldTasks();
  }, 60 * 60 * 1000);

  process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    clearInterval(cleanupInterval);
    server.close();
    await kafkaService.disconnect();
    await metricsService.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    clearInterval(cleanupInterval);
    server.close();
    await kafkaService.disconnect();
    await metricsService.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
