import express, { Request, Response, Express } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { kafkaService } from './kafka';
import { storageService } from './storage';
import { metricsService } from './influxdb';
import { pulsarDatabase } from './pulsar-db';
import { TimeSeries, ProcessingTask } from './protobuf';

interface SubmitTaskRequest {
  data: number[];
  samplingRate: number;
  startFrequency: number;
  endFrequency: number;
  dmMin: number;
  dmMax: number;
  sourceName?: string;
}

export function createApiServer(): Express {
  const app = express();

  app.use(express.json({ limit: '50mb' }));

  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.get('/api/stats', async (req: Request, res: Response) => {
    try {
      const taskStats = storageService.getTaskStats();
      let avgProcessingTime = 0;

      try {
        avgProcessingTime = await metricsService.getAverageProcessingTime(24);
      } catch (error) {
        console.warn('Could not get metrics from InfluxDB:', error);
      }

      res.json({
        tasks: taskStats,
        processing: {
          avgProcessingTimeMs: avgProcessingTime,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  app.post('/api/tasks', async (req: Request, res: Response) => {
    try {
      const body = req.body as SubmitTaskRequest;

      if (!body.data || !Array.isArray(body.data)) {
        return res.status(400).json({ error: 'Invalid or missing data array' });
      }

      if (body.data.length === 0) {
        return res.status(400).json({ error: 'Data array cannot be empty' });
      }

      if (!body.samplingRate || body.samplingRate <= 0) {
        return res.status(400).json({ error: 'Invalid sampling rate' });
      }

      const taskId = uuidv4();

      const timeSeries: TimeSeries = {
        taskId,
        data: body.data,
        samplingRate: body.samplingRate,
        startFrequency: body.startFrequency || 1000,
        endFrequency: body.endFrequency || 1500,
        dmMin: body.dmMin || 0,
        dmMax: body.dmMax || 1000,
        timestamp: Date.now(),
        sourceName: body.sourceName || 'unknown',
      };

      const processingTask: ProcessingTask = {
        taskId,
        signalData: timeSeries,
        submittedAt: Date.now(),
      };

      storageService.createTask(taskId, body.sourceName);
      await storageService.saveRawData(taskId, body.data);

      try {
        await kafkaService.sendTask(processingTask);
      } catch (kafkaError) {
        console.warn('Kafka not available, task will be processed locally');
      }

      storageService.updateTaskStatus(taskId, 'pending', 0);

      res.status(202).json({
        taskId,
        status: 'pending',
        message: 'Task submitted successfully',
      });
    } catch (error) {
      console.error('Error submitting task:', error);
      res.status(500).json({ error: 'Failed to submit task' });
    }
  });

  app.get('/api/tasks', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const tasks = storageService.getAllTasks(limit);

      res.json({
        tasks,
        count: tasks.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get tasks' });
    }
  });

  app.get('/api/tasks/:taskId', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const status = storageService.getTaskStatus(taskId);

      if (!status) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json(status);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get task status' });
    }
  });

  app.get('/api/tasks/:taskId/result', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const result = storageService.getResult(taskId);

      if (!result) {
        return res.status(404).json({ error: 'Result not found' });
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get result' });
    }
  });

  app.get('/api/tasks/:taskId/candidates', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const result = storageService.getResult(taskId);

      if (!result) {
        return res.status(404).json({ error: 'Result not found' });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const minSnr = req.query.minSnr ? parseFloat(req.query.minSnr as string) : 0;

      const candidates = result.candidates
        .filter(c => c.snr >= minSnr)
        .slice(0, limit);

      res.json({
        taskId,
        candidates,
        count: candidates.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get candidates' });
    }
  });

  app.get('/api/tasks/:taskId/rfi', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const result = storageService.getResult(taskId);

      if (!result) {
        return res.status(404).json({ error: 'Result not found' });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

      res.json({
        taskId,
        rfiRemoved: result.rfiRemoved || false,
        rfiCount: result.rfiCount || 0,
        rfiInfo: (result.rfiInfo || []).slice(0, limit),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get RFI information' });
    }
  });

  app.get('/api/tasks/:taskId/candidates/:idx/profile', (req: Request, res: Response) => {
    try {
      const { taskId, idx } = req.params;
      const result = storageService.getResult(taskId);

      if (!result) {
        return res.status(404).json({ error: 'Result not found' });
      }

      const candidateIdx = parseInt(idx, 10);
      if (candidateIdx < 0 || candidateIdx >= result.candidates.length) {
        return res.status(404).json({ error: 'Candidate index out of range' });
      }

      const candidate = result.candidates[candidateIdx];

      res.json({
        taskId,
        candidateIndex: candidateIdx,
        period: candidate.period,
        dm: candidate.dm,
        snr: candidate.snr,
        profile: candidate.profile,
        normalizedProfile: candidate.normalizedProfile,
        asciiPlot: candidate.asciiPlot,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get candidate profile' });
    }
  });

  app.get('/api/tasks/:taskId/candidates/:idx/matches', (req: Request, res: Response) => {
    try {
      const { taskId, idx } = req.params;
      const result = storageService.getResult(taskId);

      if (!result) {
        return res.status(404).json({ error: 'Result not found' });
      }

      const candidateIdx = parseInt(idx, 10);
      if (candidateIdx < 0 || candidateIdx >= result.candidates.length) {
        return res.status(404).json({ error: 'Candidate index out of range' });
      }

      const candidate = result.candidates[candidateIdx];

      res.json({
        taskId,
        candidateIndex: candidateIdx,
        bestMatch: candidate.bestMatch,
        matches: candidate.matches || [],
        matchCount: (candidate.matches || []).length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get candidate matches' });
    }
  });

  app.get('/api/pulsars', (req: Request, res: Response) => {
    try {
      const pulsars = pulsarDatabase.getAllPulsars();

      const simplifiedPulsars = pulsars.map(p => ({
        name: p.name,
        period: p.period,
        dm: p.dm,
        snr: p.snr,
        ra: p.ra,
        dec: p.dec,
        type: p.type,
        profileLength: p.profile.length,
      }));

      res.json({
        pulsars: simplifiedPulsars,
        count: simplifiedPulsars.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get pulsar database' });
    }
  });

  app.get('/api/pulsars/:name', (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const pulsar = pulsarDatabase.getPulsarByName(name);

      if (!pulsar) {
        return res.status(404).json({ error: 'Pulsar not found' });
      }

      res.json(pulsar);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get pulsar' });
    }
  });

  app.get('/api/pulsars/:name/profile', (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const pulsar = pulsarDatabase.getPulsarByName(name);

      if (!pulsar) {
        return res.status(404).json({ error: 'Pulsar not found' });
      }

      const SignalProcessor = require('./signal-processor').SignalProcessor;
      const processor = new SignalProcessor();
      const asciiPlot = processor.generateDetailedASCIIPlot(pulsar.profile, pulsar.period, pulsar.dm, pulsar.snr);

      res.json({
        name: pulsar.name,
        profile: pulsar.profile,
        asciiPlot,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get pulsar profile' });
    }
  });

  app.get('/api/tasks/:taskId/download/csv', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const filePath = await storageService.exportResultToCSV(taskId);

      res.download(filePath, `${taskId}_candidates.csv`, (err) => {
        if (err) {
          res.status(500).json({ error: 'Failed to download file' });
        }
      });
    } catch (error) {
      if ((error as Error).message.includes('not found')) {
        res.status(404).json({ error: 'Result not found' });
      } else {
        res.status(500).json({ error: 'Failed to generate CSV' });
      }
    }
  });

  app.get('/api/tasks/:taskId/download/json', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const filePath = await storageService.exportResultToJSON(taskId);

      res.download(filePath, `${taskId}_result.json`, (err) => {
        if (err) {
          res.status(500).json({ error: 'Failed to download file' });
        }
      });
    } catch (error) {
      if ((error as Error).message.includes('not found')) {
        res.status(404).json({ error: 'Result not found' });
      } else {
        res.status(500).json({ error: 'Failed to generate JSON' });
      }
    }
  });

  app.get('/api/tasks/:taskId/download/rfi/csv', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const filePath = await storageService.exportRFIToCSV(taskId);

      res.download(filePath, `${taskId}_rfi.csv`, (err) => {
        if (err) {
          res.status(500).json({ error: 'Failed to download file' });
        }
      });
    } catch (error) {
      if ((error as Error).message.includes('not found')) {
        res.status(404).json({ error: 'Result not found' });
      } else {
        res.status(500).json({ error: 'Failed to generate RFI CSV' });
      }
    }
  });

  app.get('/api/metrics', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const metrics = await metricsService.getProcessingMetrics(limit);

      res.json({
        metrics,
        count: metrics.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  });

  app.post('/api/tasks/:taskId/reprocess', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const rawData = await storageService.getRawData(taskId);

      if (!rawData) {
        return res.status(404).json({ error: 'Raw data not found' });
      }

      const task = storageService.getTask(taskId);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const newTaskId = uuidv4();

      const timeSeries: TimeSeries = {
        taskId: newTaskId,
        data: rawData,
        samplingRate: req.body.samplingRate || 1000,
        startFrequency: req.body.startFrequency || 1000,
        endFrequency: req.body.endFrequency || 1500,
        dmMin: req.body.dmMin || 0,
        dmMax: req.body.dmMax || 1000,
        timestamp: Date.now(),
        sourceName: task.sourceName || 'unknown',
      };

      const processingTask: ProcessingTask = {
        taskId: newTaskId,
        signalData: timeSeries,
        submittedAt: Date.now(),
      };

      storageService.createTask(newTaskId, task.sourceName);
      await storageService.saveRawData(newTaskId, rawData);

      try {
        await kafkaService.sendTask(processingTask);
      } catch (kafkaError) {
        console.warn('Kafka not available, task will be processed locally');
      }

      storageService.updateTaskStatus(newTaskId, 'pending', 0);

      res.status(202).json({
        taskId: newTaskId,
        originalTaskId: taskId,
        status: 'pending',
        message: 'Reprocessing task submitted successfully',
      });
    } catch (error) {
      console.error('Error reprocessing task:', error);
      res.status(500).json({ error: 'Failed to reprocess task' });
    }
  });

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  return app;
}
