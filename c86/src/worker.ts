import { config } from './config';
import { kafkaService } from './kafka';
import { metricsService } from './influxdb';
import { storageService } from './storage';
import { protobufLoader } from './protobuf';
import { SignalProcessor } from './signal-processor';

async function main() {
  console.log('Starting Signal Processing Worker...');

  await protobufLoader.load();
  console.log('Protobuf definitions loaded');

  try {
    await kafkaService.connect();
    console.log('Kafka connected successfully');
  } catch (error) {
    console.error('Could not connect to Kafka:', (error as Error).message);
    process.exit(1);
  }

  try {
    metricsService.connect();
    console.log('InfluxDB connected successfully');
  } catch (error) {
    console.warn('Could not connect to InfluxDB:', (error as Error).message);
  }

  const signalProcessor = new SignalProcessor();

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
      console.log(`Task ${task.taskId} completed in ${processingTimeMs.toFixed(2)}ms');
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

  console.log('Worker started successfully, waiting for tasks...');

  process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await kafkaService.disconnect();
    await metricsService.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await kafkaService.disconnect();
    await metricsService.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
