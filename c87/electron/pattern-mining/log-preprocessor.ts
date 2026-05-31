
export interface TokenizedLog {
  original: string;
  tokens: string[];
  level: string;
  timestamp: number;
}

const IP_PATTERN = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX_PATTERN = /\b0x[0-9a-f]+\b/gi;
const NUMBER_PATTERN = /\b\d+\b/g;
const PATH_PATTERN = /\/[\w\-/.]+/g;
const EMAIL_PATTERN = /[\w.-]+@[\w.-]+\.\w+/g;
const URL_PATTERN = /https?:\/\/[\w\-./?=&%#]+/gi;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
  'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'up', 'down', 'in', 'out', 'on', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also',
  'now', 'still', 'ever', 'never', 'already', 'yet', 'always',
  'while', 'during', 'before', 'after', 'above', 'below', 'between',
  'through', 'during', 'before', 'after', 'above', 'below', 'between'
]);

class LogPreprocessor {
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private replacePlaceholders(text: string): string {
    return text
      .replace(URL_PATTERN, 'URL')
      .replace(EMAIL_PATTERN, 'EMAIL')
      .replace(IP_PATTERN, 'IP')
      .replace(UUID_PATTERN, 'UUID')
      .replace(HEX_PATTERN, 'HEX')
      .replace(PATH_PATTERN, 'PATH')
      .replace(NUMBER_PATTERN, 'NUM');
  }

  private tokenize(text: string): string[] {
    const normalized = this.normalizeText(this.replacePlaceholders(text));
    
    return normalized
      .split(/\s+/)
      .filter(token => {
        if (token.length < 2) return false;
        if (STOP_WORDS.has(token)) return false;
        if (/^\d+$/.test(token)) return false;
        return true;
      });
  }

  public preprocess(logs: Array<{ message: string; level: string; timestamp: number }>): TokenizedLog[] {
    return logs.map(log => ({
      original: log.message,
      tokens: this.tokenize(log.message),
      level: log.level,
      timestamp: log.timestamp
    }));
  }

  public groupByTimeWindow(tokenizedLogs: TokenizedLog[], windowMinutes: number = 5): string[][] {
    if (tokenizedLogs.length === 0) return [];

    const sorted = [...tokenizedLogs].sort((a, b) => a.timestamp - b.timestamp);
    const windowMs = windowMinutes * 60 * 1000;
    const windows: string[][] = [];
    let currentWindow: string[] = [];
    let windowStart = sorted[0].timestamp;

    for (const log of sorted) {
      if (log.timestamp - windowStart > windowMs) {
        if (currentWindow.length > 0) {
          windows.push(currentWindow);
        }
        currentWindow = [];
        windowStart = log.timestamp;
      }
      currentWindow.push(...log.tokens);
    }

    if (currentWindow.length > 0) {
      windows.push(currentWindow);
    }

    return windows;
  }

  public groupByLevel(tokenizedLogs: TokenizedLog[]): Map<string, string[][]> {
    const levelGroups = new Map<string, TokenizedLog[]>();
    
    for (const log of tokenizedLogs) {
      if (!levelGroups.has(log.level)) {
        levelGroups.set(log.level, []);
      }
      levelGroups.get(log.level)!.push(log);
    }

    const result = new Map<string, string[][]>();
    for (const [level, logs] of levelGroups) {
      const sequences = logs.map(log => log.tokens).filter(seq => seq.length > 0);
      result.set(level, sequences);
    }

    return result;
  }

  public extractKeywords(tokenizedLogs: TokenizedLog[], topN: number = 20): Array<{ word: string; count: number }> {
    const wordCounts = new Map<string, number>();

    for (const log of tokenizedLogs) {
      for (const token of log.tokens) {
        wordCounts.set(token, (wordCounts.get(token) || 0) + 1);
      }
    }

    return Array.from(wordCounts.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }
}

export { LogPreprocessor };
