import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';
import * as readline from 'readline';
import * as Database from 'better-sqlite3';
import * as path from 'path';

interface IndexTask {
  filePath: string;
  dbPath: string;
  format: string;
  startLine: number;
  fileSize: number;
}

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
  host?: string;
  process?: string;
  raw: string;
}

interface Progress {
  processed: number;
  total: number;
  percentage: number;
  status: 'indexing' | 'inserting' | 'completed' | 'error';
  message: string;
}

const task: IndexTask = workerData;

let db: Database.Database;

const initDatabase = () => {
  db = new Database(task.dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA cache_size = -10000');
};

const parseJSONLine = (line: string, source: string): LogEntry | null => {
  try {
    const data = JSON.parse(line);
    let timestamp: number;
    if (data.timestamp) {
      timestamp = new Date(data.timestamp).getTime();
    } else if (data.time) {
      timestamp = new Date(data.time).getTime();
    } else if (data['@timestamp']) {
      timestamp = new Date(data['@timestamp']).getTime();
    } else {
      timestamp = Date.now();
    }

    let level = 'INFO';
    if (data.level) level = String(data.level).toUpperCase();
    else if (data.severity) level = String(data.severity).toUpperCase();
    else if (data.log_level) level = String(data.log_level).toUpperCase();

    let message = data.message || data.msg || data.log || line;

    return {
      timestamp,
      level,
      message: String(message),
      source,
      host: data.host || data.hostname,
      process: data.process || data.service,
      raw: line
    };
  } catch {
    return null;
  }
};

const parseApacheLog = (line: string, source: string): LogEntry | null => {
  const apacheRegex = /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]+)" (\d+) (\d+|-) "([^"]*)" "([^"]*)"$/;
  const match = line.match(apacheRegex);

  if (!match) return null;

  const [, host, dateStr, request, status] = match;
  const timestamp = new Date(dateStr.replace(/:/, ' ')).getTime();

  let level = 'INFO';
  const statusCode = parseInt(status);
  if (statusCode >= 500) level = 'ERROR';
  else if (statusCode >= 400) level = 'WARN';

  return {
    timestamp,
    level,
    message: request,
    source,
    host,
    process: 'apache',
    raw: line
  };
};

const parseSystemdJournal = (line: string, source: string): LogEntry | null => {
  const journalRegex = /^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+)\[(\d+)\]:\s+(.*)$/;
  const match = line.match(journalRegex);

  if (!match) return null;

  const [, dateStr, host, processName, pid, message] = match;
  const currentYear = new Date().getFullYear();
  const timestamp = new Date(`${currentYear} ${dateStr}`).getTime();

  let level = 'INFO';
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('error') || lowerMessage.includes('failed')) level = 'ERROR';
  else if (lowerMessage.includes('warn')) level = 'WARN';

  return {
    timestamp,
    level,
    message,
    source,
    host,
    process: `${processName}[${pid}]`,
    raw: line
  };
};

const detectFormat = (firstLine: string): string => {
  if (firstLine.trim().startsWith('{') && firstLine.trim().endsWith('}')) {
    return 'json';
  }
  if (/^\S+ \S+ \S+ \[/.test(firstLine)) {
    return 'apache';
  }
  if (/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+/.test(firstLine)) {
    return 'systemd';
  }
  return 'auto';
};

const sendProgress = (progress: Progress) => {
  parentPort?.postMessage(progress);
};

const estimateLines = (filePath: string, sampleSize: number = 1024 * 1024): number => {
  const buffer = Buffer.alloc(sampleSize);
  const fd = fs.openSync(filePath, 'r');
  const bytesRead = fs.readSync(fd, buffer, 0, sampleSize, 0);
  fs.closeSync(fd);

  const sample = buffer.toString('utf8', 0, bytesRead);
  const lineCount = (sample.match(/\n/g) || []).length;
  const avgLineSize = bytesRead / Math.max(lineCount, 1);
  const fileSize = fs.statSync(filePath).size;

  return Math.floor(fileSize / avgLineSize);
};

const processFile = async () => {
  try {
    initDatabase();

    const source = path.basename(task.filePath);
    const estimatedLines = estimateLines(task.filePath);

    sendProgress({
      processed: 0,
      total: estimatedLines,
      percentage: 0,
      status: 'indexing',
      message: '开始解析日志文件...'
    });

    const fileStream = fs.createReadStream(task.filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const logs: LogEntry[] = [];
    let lineCount = 0;
    let processedCount = 0;
    let detectedFormat = task.format;
    const BATCH_SIZE = 1000;
    let lastProgressTime = Date.now();

    for await (const line of rl) {
      lineCount++;

      if (lineCount <= task.startLine) continue;
      if (!line.trim()) continue;

      processedCount++;

      if (processedCount === 1 && task.format === 'auto') {
        detectedFormat = detectFormat(line);
      }

      let logEntry: LogEntry | null = null;

      switch (detectedFormat) {
        case 'json':
          logEntry = parseJSONLine(line, source);
          break;
        case 'apache':
          logEntry = parseApacheLog(line, source);
          break;
        case 'systemd':
          logEntry = parseSystemdJournal(line, source);
          break;
        default:
          logEntry = {
            timestamp: Date.now(),
            level: 'INFO',
            message: line,
            source,
            raw: line
          };
      }

      if (logEntry) {
        logs.push(logEntry);
      }

      if (logs.length >= BATCH_SIZE) {
        sendProgress({
          processed: processedCount + task.startLine,
          total: estimatedLines,
          percentage: Math.min(100, ((processedCount + task.startLine) / estimatedLines) * 100),
          status: 'inserting',
          message: `正在批量插入 ${logs.length} 条日志...`
        });

        const insertMany = db.transaction((logList: LogEntry[]) => {
          const stmt = db.prepare(`
            INSERT INTO logs (timestamp, level, message, source, host, process, raw)
            VALUES (@timestamp, @level, @message, @source, @host, @process, @raw)
          `);
          for (const log of logList) {
            stmt.run(log);
          }
        });
        insertMany(logs);

        logs.length = 0;

        sendProgress({
          processed: processedCount + task.startLine,
          total: estimatedLines,
          percentage: Math.min(100, ((processedCount + task.startLine) / estimatedLines) * 100),
          status: 'indexing',
          message: `已处理 ${processedCount.toLocaleString()} 行...`
        });
      }

      const now = Date.now();
      if (now - lastProgressTime > 200) {
        sendProgress({
          processed: processedCount + task.startLine,
          total: estimatedLines,
          percentage: Math.min(100, ((processedCount + task.startLine) / estimatedLines) * 100),
          status: 'indexing',
          message: `已处理 ${processedCount.toLocaleString()} 行...`
        });
        lastProgressTime = now;
      }
    }

    if (logs.length > 0) {
      sendProgress({
        processed: processedCount + task.startLine,
        total: estimatedLines,
        percentage: Math.min(100, ((processedCount + task.startLine) / estimatedLines) * 100),
        status: 'inserting',
        message: `正在批量插入最后 ${logs.length} 条日志...`
      });

      const insertMany = db.transaction((logList: LogEntry[]) => {
        const stmt = db.prepare(`
          INSERT INTO logs (timestamp, level, message, source, host, process, raw)
          VALUES (@timestamp, @level, @message, @source, @host, @process, @raw)
        `);
        for (const log of logList) {
          stmt.run(log);
        }
      });
      insertMany(logs);
    }

    const fileStateStmt = db.prepare(`
      INSERT OR REPLACE INTO file_state (file_path, last_processed_line, last_processed_size, last_updated)
      VALUES (?, ?, ?, ?)
    `);
    fileStateStmt.run(task.filePath, lineCount, task.fileSize, Date.now());

    sendProgress({
      processed: processedCount,
      total: estimatedLines,
      percentage: 100,
      status: 'completed',
      message: `完成！成功导入 ${processedCount.toLocaleString()} 条日志`
    });

    db.close();
  } catch (error) {
    sendProgress({
      processed: 0,
      total: 0,
      percentage: 0,
      status: 'error',
      message: `错误: ${String(error)}`
    });
  }
};

processFile();
