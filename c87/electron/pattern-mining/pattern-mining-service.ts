
import { ipcMain } from 'electron';
import * as Database from 'better-sqlite3';
import * as path from 'path';
import { PrefixSpan, Pattern } from './prefix-span';
import { LogPreprocessor, TokenizedLog } from './log-preprocessor';
import { RuleSuggestor, RuleSuggestion } from './rule-suggestor';
import { RegexGenerator, RegexTemplate } from './regex-generator';

export interface MiningResult {
  patterns: Pattern[];
  keywords: Array<{ word: string; count: number }>;
  ruleSuggestions: RuleSuggestion[];
  regexTemplates: RegexTemplate[];
  processingTime: number;
  totalLogs: number;
}

class PatternMiningService {
  private preprocessor: LogPreprocessor;
  private regexGenerator: RegexGenerator;

  constructor() {
    this.preprocessor = new LogPreprocessor();
    this.regexGenerator = new RegexGenerator();
  }

  private getDb(): Database.Database {
    const userData = process.env.APPDATA || 
      (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
    const dbPath = path.join(userData, 'LogAnalyzer', 'logs.db');
    return new Database(dbPath);
  }

  private fetchLogs(limit: number = 10000): Array<{ message: string; level: string; timestamp: number }> {
    const db = this.getDb();
    const logs = db.prepare(`
      SELECT message, level, timestamp
      FROM logs
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as Array<{ message: string; level: string; timestamp: number }>;
    db.close();
    return logs;
  }

  public async minePatterns(minSupport: number = 0.01, maxPatternLength: number = 8): Promise<MiningResult> {
    const startTime = Date.now();

    const rawLogs = this.fetchLogs();
    if (rawLogs.length === 0) {
      throw new Error('没有可用的日志数据进行模式挖掘');
    }

    const tokenizedLogs = this.preprocessor.preprocess(rawLogs);

    const sequences = tokenizedLogs
      .map(log => log.tokens)
      .filter(seq => seq.length >= 2);

    const prefixSpan = new PrefixSpan(sequences, minSupport, maxPatternLength);
    const patterns = prefixSpan.mine();

    const keywords = this.preprocessor.extractKeywords(tokenizedLogs, 50);

    const suggestor = new RuleSuggestor(patterns, rawLogs.map(l => l.message));
    const ruleSuggestions = [
      ...suggestor.generateSuggestions(Math.max(3, Math.floor(rawLogs.length * 0.005))),
      ...suggestor.generateAdvancedRules(),
      ...suggestor.generateSecurityRules()
    ];

    const uniqueSuggestions = this.deduplicateRules(ruleSuggestions);

    const regexTemplates: RegexTemplate[] = [
      ...uniqueSuggestions.slice(0, 10).map(r => this.regexGenerator.optimizeRegex(r.regex, rawLogs.map(l => l.message))),
      this.regexGenerator.generateForCategory('error'),
      this.regexGenerator.generateForCategory('warning'),
      this.regexGenerator.generateForCategory('security'),
      this.regexGenerator.generateForCategory('performance')
    ];

    const processingTime = Date.now() - startTime;

    return {
      patterns: patterns.slice(0, 100),
      keywords,
      ruleSuggestions: uniqueSuggestions,
      regexTemplates,
      processingTime,
      totalLogs: rawLogs.length
    };
  }

  private deduplicateRules(rules: RuleSuggestion[]): RuleSuggestion[] {
    const seen = new Set<string>();
    const result: RuleSuggestion[] = [];

    for (const rule of rules) {
      const key = rule.pattern.slice(0, 3).join('|');
      if (!seen.has(key)) {
        seen.add(key);
        result.push(rule);
      }
    }

    return result;
  }

  public generateRegexForPattern(pattern: string[]): RegexTemplate {
    return this.regexGenerator.generateFromPattern(pattern);
  }

  public testRegex(regex: string, limit: number = 100): {
    matchCount: number;
    totalCount: number;
    matches: string[];
  } {
    const logs = this.fetchLogs(limit);
    return this.regexGenerator.testRegex(regex, logs.map(l => l.message));
  }

  public getLogsByRegex(regex: string, limit: number = 50): string[] {
    const logs = this.fetchLogs(limit * 2);
    try {
      const re = new RegExp(regex, 'i');
      return logs
        .filter(l => re.test(l.message))
        .slice(0, limit)
        .map(l => l.message);
    } catch {
      return [];
    }
  }
}

const service = new PatternMiningService();

export const setupPatternMiningIPC = () => {
  ipcMain.handle('mine-patterns', async (_, minSupport: number = 0.01, maxPatternLength: number = 8) => {
    try {
      const result = await service.minePatterns(minSupport, maxPatternLength);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('generate-regex-for-pattern', async (_, pattern: string[]) => {
    try {
      const result = service.generateRegexForPattern(pattern);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('test-regex', async (_, regex: string, limit: number = 100) => {
    try {
      const result = service.testRegex(regex, limit);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('get-logs-by-regex', async (_, regex: string, limit: number = 50) => {
    try {
      const result = service.getLogsByRegex(regex, limit);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
};

export { PatternMiningService };
