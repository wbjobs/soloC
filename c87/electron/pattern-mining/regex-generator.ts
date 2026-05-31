
export interface RegexTemplate {
  id: string;
  name: string;
  pattern: string;
  description: string;
  category: string;
  examples: string[];
  testResults: Array<{ input: string; match: boolean }>;
}

interface PatternToken {
  type: 'literal' | 'variable' | 'number' | 'ip' | 'uuid' | 'hex' | 'path' | 'email' | 'url' | 'timestamp' | 'whitespace' | 'word';
  value: string;
  original?: string;
}

const PATTERN_DETECTORS = [
  {
    type: 'ip' as const,
    regex: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
    template: '\\\\d{1,3}\\\\.\\\\d{1,3}\\\.\\\\d{1,3}\\\.\\\\d{1,3}',
    name: 'IP地址'
  },
  {
    type: 'uuid' as const,
    regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    template: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    name: 'UUID'
  },
  {
    type: 'hex' as const,
    regex: /^0x[0-9a-f]+$/i,
    template: '0x[0-9a-f]+',
    name: '十六进制数'
  },
  {
    type: 'url' as const,
    regex: /^https?:\/\/[\w\-./?=&%#]+$/i,
    template: 'https?:\\\\/\\\\/[\\\\w\\\\-./?=&%#]+',
    name: 'URL'
  },
  {
    type: 'email' as const,
    regex: /^[\w.-]+@[\w.-]+\.\w+$/,
    template: '[\\\\w.-]+@[\\\\w.-]+\\.\\\\w+',
    name: '邮箱地址'
  },
  {
    type: 'path' as const,
    regex: /^\/[\w\-/.]+$/,
    template: '\\\\/[\\\\w\\\\-./]+',
    name: '文件路径'
  },
  {
    type: 'timestamp' as const,
    regex: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    template: '\\\\d{4}-\\\\d{2}-\\\\d{2}T\\\\d{2}:\\\\d{2}:\\\\d{2}',
    name: 'ISO时间戳'
  },
  {
    type: 'number' as const,
    regex: /^\d+$/,
    template: '\\\\d+',
    name: '数字'
  }
];

class RegexGenerator {
  private tokenize(text: string): PatternToken[] {
    const tokens: PatternToken[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      let matched = false;

      for (const detector of PATTERN_DETECTORS) {
        const match = remaining.match(new RegExp(`^${detector.regex.source}`, 'i');
        if (match) {
          tokens.push({
            type: detector.type,
            value: detector.template,
            original: match[0]
          });
          remaining = remaining.slice(match[0].length);
          matched = true;
          break;
        }
      }

      if (!matched) {
        const wsMatch = remaining.match(/^\s+/);
        if (wsMatch) {
          tokens.push({
            type: 'whitespace',
            value: '\\s+',
            original: wsMatch[0]
          });
          remaining = remaining.slice(wsMatch[0].length);
          continue;
        }

        const wordMatch = remaining.match(/^[a-zA-Z_]+/);
        if (wordMatch) {
          tokens.push({
            type: 'literal',
            value: wordMatch[0],
            original: wordMatch[0]
          });
          remaining = remaining.slice(wordMatch[0].length);
          continue;
        }

        const specialMatch = remaining.match(/^[^\s\w]/);
        if (specialMatch) {
          tokens.push({
            type: 'literal',
            value: specialMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            original: specialMatch[0]
          });
          remaining = remaining.slice(1);
          continue;
        }

        break;
      }
    }

    return tokens;
  }

  private mergeLiterals(tokens: PatternToken[]): PatternToken[] {
    const merged: PatternToken[] = [];
    let currentLiteral = '';

    for (const token of tokens) {
      if (token.type === 'literal') {
      } else {
        if (currentLiteral) {
          merged.push({ type: 'literal', value: currentLiteral });
          currentLiteral = '';
        }
        merged.push(token);
      }
    }

    if (currentLiteral) {
      merged.push({ type: 'literal', value: currentLiteral });
    }

    return merged;
  }

  public generateFromLog(log: string): RegexTemplate {
    const tokens = this.tokenize(log);
    const mergedTokens = this.mergeLiterals(tokens);

    const patternParts = mergedTokens.map(t => t.value).join('');

    const categories = mergedTokens
      .filter(t => t.type !== 'literal' && t.type !== 'whitespace')
      .map(t => PATTERN_DETECTORS.find(d => d.type === t.type)?.name || t.type);

    return {
      id: `regex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `日志匹配规则',
      pattern: `^${patternParts}$`,
      description: `自动生成的正则表达式，包含: ${categories.length > 0 ? categories.join(', ') : '纯文本匹配'}`,
      category: categories[0] || 'general',
      examples: [log.slice(0, 100)],
      testResults: []
    };
  }

  public generateFromPattern(pattern: string[]): RegexTemplate {
    const patternStr = pattern
      .map(p => {
        for (const detector of PATTERN_DETECTORS) {
          if (new RegExp(detector.regex.source, 'i').test(p)) {
            return detector.template;
          }
        }
        return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('.*');

    return {
      id: `regex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `模式匹配规则`,
      pattern: `.*${patternStr}.*`,
      description: `基于频繁模式: ${pattern.join(' ')}`,
      category: 'pattern_based',
      examples: [],
      testResults: []
    };
  }

  public optimizeRegex(regex: string, logs: string[]): RegexTemplate {
    const testResults: Array<{ input: string; match: boolean }> = [];

    try {
      const re = new RegExp(regex, 'i');
      for (const log of logs.slice(0, 10)) {
        testResults.push({
          input: log.slice(0, 100),
          match: re.test(log)
        });
      }
    } catch (e) {
    }

    const matchCount = testResults.filter(t => t.match).length;

    return {
      id: `regex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `优化正则`,
      pattern: regex,
      description: `匹配率: ${matchCount}/${testResults.length}`,
      category: 'optimized',
      examples: testResults.filter(t => t.match).map(t => t.input),
      testResults
    };
  }

  public generateForCategory(category: string): RegexTemplate {
    const templates: Record<string, { pattern: string; description: string }> = {
      error: {
        pattern: '.*(error|exception|failed|fatal|critical).*',
        description: '匹配所有错误和异常信息'
      },
      warning: {
        pattern: '.*(warning|warn|caution).*',
        description: '匹配所有警告信息'
      },
      network: {
        pattern: '.*(connection|timeout|disconnect|connect).*',
        description: '匹配网络相关日志'
      },
      security: {
        pattern: '.*(auth|login|password|token|unauthorized|forbidden).*',
        description: '匹配安全相关日志'
      },
      performance: {
        pattern: '.*(slow|timeout|latency|slow|performance).*',
        description: '匹配性能相关日志'
      },
      database: {
        pattern: '.*(sql|query|database|db).*',
        description: '匹配数据库相关日志'
      }
    };

    const template = templates[category.toLowerCase()] || templates.error;

    return {
      id: `regex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `${category}通用规则`,
      pattern: template.pattern,
      description: template.description,
      category,
      examples: [],
      testResults: []
    };
  }

  public testRegex(regex: string, testLogs: string[]): {
    matchCount: number;
    totalCount: number;
    matches: string[];
  } {
    let matchCount = 0;
    const matches: string[] = [];

    try {
      const re = new RegExp(regex, 'i');
      for (const log of testLogs) {
        if (re.test(log)) {
          matchCount++;
          if (matches.length < 10) {
            matches.push(log.slice(0, 200));
          }
        }
      }
    } catch (e) {
    }

    return {
      matchCount,
      totalCount: testLogs.length,
      matches
    };
  }
}

export { RegexGenerator };
