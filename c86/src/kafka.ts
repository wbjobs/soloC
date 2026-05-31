import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from './config';
import { protobufLoader, ProcessingTask, ProcessingResult } from './protobuf';

export class KafkaService {
  private kafka: Kafka;
  private producer: Producer;
  private taskConsumer: Consumer;
  private resultConsumer: Consumer;
  private isConnected: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
    });

    this.producer = this.kafka.producer();
    this.taskConsumer = this.kafka.consumer({
      groupId: config.kafka.groupId + '-tasks',
    });
    this.resultConsumer = this.kafka.consumer({
      groupId: config.kafka.groupId + '-results',
    });
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    await Promise.all([
      this.producer.connect(),
      this.taskConsumer.connect(),
      this.resultConsumer.connect(),
    ]);

    await this.taskConsumer.subscribe({
      topic: config.kafka.topicTasks,
      fromBeginning: false,
    });

    this.isConnected = true;
    console.log('Kafka connected successfully');
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    await Promise.all([
      this.producer.disconnect(),
      this.taskConsumer.disconnect(),
      this.resultConsumer.disconnect(),
    ]);

    this.isConnected = false;
    console.log('Kafka disconnected');
  }

  async sendTask(task: ProcessingTask): Promise<void> {
    await protobufLoader.load();
    const buffer = protobufLoader.encodeProcessingTask(task);

    await this.producer.send({
      topic: config.kafka.topicTasks,
      messages: [
        {
          key: task.taskId,
          value: buffer,
        },
      ],
    });

    console.log(`Task ${task.taskId} sent to Kafka`);
  }

  async sendResult(result: ProcessingResult): Promise<void> {
    await protobufLoader.load();
    const buffer = protobufLoader.encodeProcessingResult(result);

    await this.producer.send({
      topic: config.kafka.topicResults,
      messages: [
        {
          key: result.taskId,
          value: buffer,
        },
      ],
    });

    console.log(`Result for task ${result.taskId} sent to Kafka`);
  }

  async consumeTasks(
    callback: (task: ProcessingTask) => Promise<void>
  ): Promise<void> {
    await protobufLoader.load();

    await this.taskConsumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          if (!payload.message.value) {
            console.warn('Received empty message');
            return;
          }

          const task = protobufLoader.decodeProcessingTask(
            Buffer.from(payload.message.value)
          );

          console.log(`Received task: ${task.taskId}`);
          await callback(task);
        } catch (error) {
          console.error('Error processing Kafka message:', error);
        }
      },
    });
  }

  async consumeResults(
    callback: (result: ProcessingResult) => Promise<void>
  ): Promise<void> {
    await protobufLoader.load();

    await this.resultConsumer.subscribe({
      topic: config.kafka.topicResults,
      fromBeginning: false,
    });

    await this.resultConsumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          if (!payload.message.value) {
            console.warn('Received empty message');
            return;
          }

          const result = protobufLoader.decodeProcessingResult(
            Buffer.from(payload.message.value)
          );

          console.log(`Received result for task: ${result.taskId}`);
          await callback(result);
        } catch (error) {
          console.error('Error processing Kafka message:', error);
        }
      },
    });
  }
}

export const kafkaService = new KafkaService();
