const amqp = require('amqplib');
const config = require('../config');

let connection;
let channel;

const DLX_EXCHANGE = 'impact-analysis-dlx';
const DLQ_QUEUE = 'impact-analysis-dlq';
const MAIN_QUEUE = config.rabbitmq.queue;
const MAX_RETRIES = 3;

const connectRabbitMQ = async () => {
  try {
    connection = await amqp.connect(config.rabbitmq.url);
    channel = await connection.createChannel();
    
    await channel.assertExchange(DLX_EXCHANGE, 'direct', { durable: true });
    
    await channel.assertQueue(DLQ_QUEUE, { durable: true });
    await channel.bindQueue(DLQ_QUEUE, DLX_EXCHANGE, DLQ_QUEUE);
    
    await channel.assertQueue(MAIN_QUEUE, {
      durable: true,
      deadLetterExchange: DLX_EXCHANGE,
      deadLetterRoutingKey: DLQ_QUEUE
    });
    
    console.log('RabbitMQ connected with DLX/DLQ configured');
  } catch (error) {
    console.error('Failed to connect to RabbitMQ:', error);
    throw error;
  }
};

const sendToQueue = async (message) => {
  if (!channel) {
    await connectRabbitMQ();
  }
  
  const messageWithMeta = {
    ...message,
    metadata: {
      retryCount: 0,
      createdAt: new Date().toISOString()
    }
  };
  
  const messageBuffer = Buffer.from(JSON.stringify(messageWithMeta));
  return channel.sendToQueue(MAIN_QUEUE, messageBuffer, {
    persistent: true
  });
};

const sendToDLQ = async (msg, error) => {
  try {
    const originalMessage = JSON.parse(msg.content.toString());
    const dlqMessage = {
      ...originalMessage,
      metadata: {
        ...originalMessage.metadata,
        failedAt: new Date().toISOString(),
        error: error.message,
        errorStack: error.stack
      }
    };
    
    const messageBuffer = Buffer.from(JSON.stringify(dlqMessage));
    await channel.sendToQueue(DLQ_QUEUE, messageBuffer, {
      persistent: true
    });
    
    console.log(`Message moved to DLQ: ${originalMessage.taskId}`);
  } catch (dlqError) {
    console.error('Failed to send message to DLQ:', dlqError);
  }
};

const consumeMessages = async (handler) => {
  if (!channel) {
    await connectRabbitMQ();
  }
  
  channel.prefetch(1);
  console.log('Waiting for messages...');
  
  channel.consume(MAIN_QUEUE, async (msg) => {
    if (!msg) return;
    
    let message;
    try {
      message = JSON.parse(msg.content.toString());
    } catch (parseError) {
      console.error('Failed to parse message:', parseError);
      await sendToDLQ(msg, parseError);
      channel.nack(msg, false, false);
      return;
    }
    
    const retryCount = message.metadata?.retryCount || 0;
    
    try {
      await handler(message);
      channel.ack(msg);
    } catch (error) {
      console.error(`Error processing message (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < MAX_RETRIES) {
        const updatedMessage = {
          ...message,
          metadata: {
            ...message.metadata,
            retryCount: retryCount + 1,
            lastRetryAt: new Date().toISOString()
          }
        };
        
        const messageBuffer = Buffer.from(JSON.stringify(updatedMessage));
        const delay = Math.pow(2, retryCount) * 1000;
        
        setTimeout(async () => {
          try {
            await channel.sendToQueue(MAIN_QUEUE, messageBuffer, {
              persistent: true
            });
            channel.nack(msg, false, false);
          } catch (retryError) {
            console.error('Failed to retry message:', retryError);
            await sendToDLQ(msg, error);
            channel.nack(msg, false, false);
          }
        }, delay);
      } else {
        console.error(`Max retries (${MAX_RETRIES}) exceeded, moving to DLQ:`, message.taskId);
        await sendToDLQ(msg, error);
        channel.nack(msg, false, false);
      }
    }
  });
};

const getDLQMessageCount = async () => {
  if (!channel) {
    await connectRabbitMQ();
  }
  const queueInfo = await channel.checkQueue(DLQ_QUEUE);
  return queueInfo.messageCount;
};

const closeRabbitMQ = async () => {
  if (channel) {
    await channel.close();
  }
  if (connection) {
    await connection.close();
  }
};

module.exports = {
  connectRabbitMQ,
  sendToQueue,
  consumeMessages,
  closeRabbitMQ,
  getDLQMessageCount,
  DLX_EXCHANGE,
  DLQ_QUEUE
};
