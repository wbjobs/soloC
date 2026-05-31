const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { sendToQueue } = require('../services/rabbitmq');
const { createTask, getTask } = require('../repositories/taskRepository');

const createTaskSchema = Joi.object({
  sql: Joi.string().required().min(1),
  tenantId: Joi.string().required().min(1),
  targetTenants: Joi.array().items(Joi.string()).optional()
});

exports.createAnalysisTask = async (req, res) => {
  try {
    const { error, value } = createTaskSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const taskId = uuidv4();
    const task = await createTask({
      taskId,
      sql: value.sql,
      tenantId: value.tenantId,
      targetTenants: value.targetTenants,
      status: 'pending',
      createdAt: new Date()
    });

    await sendToQueue({
      taskId,
      sql: value.sql,
      tenantId: value.tenantId,
      targetTenants: value.targetTenants
    });

    return res.status(202).json({
      taskId,
      status: 'pending',
      message: 'Analysis task created successfully'
    });
  } catch (error) {
    console.error('Error creating analysis task:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAnalysisResult = async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await getTask(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const response = {
      taskId: task.taskId,
      status: task.status,
      tenantId: task.tenantId,
      createdAt: task.createdAt,
      completedAt: task.completedAt
    };

    if (task.status === 'completed') {
      response.result = task.result;
    } else if (task.status === 'failed') {
      response.error = task.error;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error getting analysis result:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
