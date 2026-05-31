import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { config } from './config';

export interface ProcessingMetrics {
  taskId: string;
  processingTimeMs: number;
  initialSnr: number;
  finalSnr: number;
  candidateCount: number;
  sourceName?: string;
}

export class MetricsService {
  private influxDB: InfluxDB;
  private writeApi: any;
  private queryApi: any;
  private isConnected: boolean = false;

  constructor() {
    this.influxDB = new InfluxDB({
      url: config.influxdb.url,
      token: config.influxdb.token,
    });

    this.writeApi = this.influxDB.getWriteApi(
      config.influxdb.org,
      config.influxdb.bucket
    );

    this.queryApi = this.influxDB.getQueryApi(config.influxdb.org);
  }

  connect(): void {
    this.isConnected = true;
    console.log('InfluxDB connected successfully');
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    await this.writeApi.close();
    this.isConnected = false;
    console.log('InfluxDB disconnected');
  }

  async recordProcessingMetrics(metrics: ProcessingMetrics): Promise<void> {
    if (!this.isConnected) {
      console.warn('InfluxDB not connected, skipping metrics recording');
      return;
    }

    const point = new Point('signal_processing')
      .stringField('task_id', metrics.taskId)
      .floatField('processing_time_ms', metrics.processingTimeMs)
      .floatField('initial_snr', metrics.initialSnr)
      .floatField('final_snr', metrics.finalSnr)
      .intField('candidate_count', metrics.candidateCount)
      .timestamp(new Date());

    if (metrics.sourceName) {
      point.stringField('source_name', metrics.sourceName);
    }

    this.writeApi.writePoint(point);
    await this.writeApi.flush();

    console.log(`Metrics recorded for task ${metrics.taskId}`);
  }

  async getProcessingMetrics(limit: number = 100): Promise<any[]> {
    const fluxQuery = `
      from(bucket: "${config.influxdb.bucket}")
        |> range(start: -7d)
        |> filter(fn: (r) => r._measurement == "signal_processing")
        |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: ${limit})
    `;

    const results: any[] = [];

    return new Promise((resolve, reject) => {
      this.queryApi.queryRows(fluxQuery, {
        next(row: any, tableMeta: any) {
          const o = tableMeta.toObject(row);
          results.push({
            time: o._time,
            taskId: o.task_id,
            processingTimeMs: o.processing_time_ms,
            initialSnr: o.initial_snr,
            finalSnr: o.final_snr,
            candidateCount: o.candidate_count,
            sourceName: o.source_name,
          });
        },
        error(error: Error) {
          reject(error);
        },
        complete() {
          resolve(results);
        },
      });
    });
  }

  async getAverageProcessingTime(hours: number = 24): Promise<number> {
    const fluxQuery = `
      from(bucket: "${config.influxdb.bucket}")
        |> range(start: -${hours}h)
        |> filter(fn: (r) => r._measurement == "signal_processing")
        |> filter(fn: (r) => r._field == "processing_time_ms")
        |> mean()
    `;

    let avg = 0;

    return new Promise((resolve, reject) => {
      this.queryApi.queryRows(fluxQuery, {
        next(row: any, tableMeta: any) {
          const o = tableMeta.toObject(row);
          avg = o._value;
        },
        error(error: Error) {
          reject(error);
        },
        complete() {
          resolve(avg);
        },
      });
    });
  }
}

export const metricsService = new MetricsService();
