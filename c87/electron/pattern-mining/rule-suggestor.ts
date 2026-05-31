
import { Pattern } from './prefix-span';

export interface RuleSuggestion {
  id: string;
  name: string;
  description: string;
  pattern: string[];
  regex: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  support: number;
  frequency: number;
  exampleLogs: string[];
}

interface RuleTemplate {
  keywords: string[];
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
}

const RULE_TEMPLATES: RuleTemplate[] = [
  {
    keywords: ['error', 'failed', 'failure', 'exception'],
    name: '错误检测规则',
    description: '检测日志中的错误和异常信息',
    severity: 'high',
    category: 'error_detection'
  },
  {
    keywords: ['warning', 'warn', 'caution'],
    name: '警告检测规则',
    description: '检测日志中的警告信息',
    severity: 'medium',
    category: 'warning_detection'
  },
  {
    keywords: ['connection', 'connect', 'disconnect', 'timeout'],
    name: '连接状态规则',
    description: '检测网络连接相关的问题',
    severity: 'high',
    category: 'network'
  },
  {
    keywords: ['auth', 'authentication', 'login', 'password', 'token'],
    name: '认证安全规则',
    description: '检测认证相关的安全事件',
    severity: 'critical',
    category: 'security'
  },
  {
    keywords: ['permission', 'denied', 'forbidden', 'unauthorized'],
    name: '权限控制规则',
    description: '检测权限相关的安全事件',
    severity: 'critical',
    category: 'security'
  },
  {
    keywords: ['sql', 'query', 'database', 'db'],
    name: '数据库操作规则',
    description: '检测数据库相关的操作和问题',
    severity: 'medium',
    category: 'database'
  },
  {
    keywords: ['memory', 'heap', 'outofmemory', 'gc'],
    name: '内存监控规则',
    description: '检测内存相关的问题',
    severity: 'high',
    category: 'performance'
  },
  {
    keywords: ['cpu', 'load', 'performance'],
    name: 'CPU性能规则',
    description: '检测CPU性能相关问题',
    severity: 'medium',
    category: 'performance'
  },
  {
    keywords: ['disk', 'space', 'storage'],
    name: '磁盘空间规则',
    description: '检测磁盘存储相关问题',
    severity: 'high',
    category: 'storage'
  },
  {
    keywords: ['request', 'response', 'api', 'endpoint'],
    name: 'API监控规则',
    description: '检测API请求和响应相关问题',
    severity: 'medium',
    category: 'api'
  },
  {
    keywords: ['slow', 'timeout', 'latency'],
    name: '性能延迟规则',
    description: '检测慢速请求和超时问题',
    severity: 'medium',
    category: 'performance'
  },
  {
    keywords: ['crash', 'panic', 'fatal', 'kill'],
    name: '崩溃检测规则',
    description: '检测服务崩溃和致命错误',
    severity: 'critical',
    category: 'crash_detection'
  }
];

class RuleSuggestor {
  private patterns: Pattern[];
  private originalLogs: string[];

  constructor(patterns: Pattern[], originalLogs: string[]) {
    this.patterns = patterns;
    this.originalLogs = originalLogs;
  }

  private findMatchingLogs(pattern: string[]): string[] {
    const matches: string[] = [];
    const patternLower = pattern.map(p => p.toLowerCase());

    for (const log of this.originalLogs) {
      const logLower = log.toLowerCase();
      const hasAllKeywords = patternLower.every(kw => logLower.includes(kw));
      if (hasAllKeywords) {
        matches.push(log);
        if (matches.length >= 3) break;
      }
    }

    return matches;
  }

  private matchTemplate(pattern: Pattern): RuleTemplate | null {
    for (const template of RULE_TEMPLATES) {
      const matchCount = template.keywords.filter(kw =>
        pattern.sequence.some(p => p.toLowerCase().includes(kw) || kw.includes(p.toLowerCase()))
      ).length;

      if (matchCount >= 1) {
        return template;
      }
    }
    return null;
  }

  public generateSuggestions(minSupport: number = 5): RuleSuggestion[] {
    const suggestions: RuleSuggestion[] = [];
    const seenPatterns = new Set<string>();

    for (const pattern of this.patterns) {
      if (pattern.support < minSupport) continue;
      if (pattern.sequence.length < 2) continue;

      const patternKey = pattern.sequence.join('|');
      if (seenPatterns.has(patternKey)) continue;
      seenPatterns.add(patternKey);

      const template = this.matchTemplate(pattern);
      if (!template) continue;

      const regex = this.generateRegexFromPattern(pattern.sequence);
      const exampleLogs = this.findMatchingLogs(pattern.sequence);

      suggestions.push({
        id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: template.name,
        description: `${template.description} - 发现模式: "${pattern.sequence.join(' ')}"`,
        pattern: pattern.sequence,
        regex,
        severity: template.severity,
        category: template.category,
        support: pattern.support,
        frequency: pattern.frequency,
        exampleLogs
      });
    }

    return suggestions
      .sort((a, b) => b.support - a.support)
      .slice(0, 50);
  }

  private generateRegexFromPattern(sequence: string[]): string {
    const escaped = sequence.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return `.*${escaped.join('.*')}.*`;
  }

  public generateAdvancedRules(): RuleSuggestion[] {
    const suggestions: RuleSuggestion[] = [];

    const errorPatterns = this.patterns.filter(p =>
      p.sequence.some(s => /error|exception|failed/i.test(s)) && p.support >= 3
    );

    for (const pattern of errorPatterns.slice(0, 10)) {
      const exampleLogs = this.findMatchingLogs(pattern.sequence);
      const hasException = pattern.sequence.some(s => /exception/i.test(s));

      suggestions.push({
        id: `error_rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: hasException ? '异常捕获规则' : '错误检测规则',
        description: `自动发现的错误模式: ${pattern.sequence.slice(0, 5).join(' ')}`,
        pattern: pattern.sequence,
        regex: this.generateRegexFromPattern(pattern.sequence),
        severity: hasException ? 'critical' : 'high',
        category: 'auto_error',
        support: pattern.support,
        frequency: pattern.frequency,
        exampleLogs
      });
    }

    return suggestions;
  }

  public generateSecurityRules(): RuleSuggestion[] {
    const securityKeywords = ['auth', 'login', 'password', 'token', 'unauthorized', 'forbidden', 'access', 'denied'];
    const suggestions: RuleSuggestion[] = [];

    for (const keyword of securityKeywords) {
      const matchingPatterns = this.patterns.filter(p =>
        p.sequence.some(s => s.toLowerCase().includes(keyword)) && p.support >= 2
      );

      for (const pattern of matchingPatterns.slice(0, 5)) {
        const exampleLogs = this.findMatchingLogs(pattern.sequence);

        suggestions.push({
          id: `sec_rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: `安全检测 - ${keyword}`,
          description: `与${keyword}相关的安全事件模式`,
          pattern: pattern.sequence,
          regex: this.generateRegexFromPattern(pattern.sequence),
          severity: keyword === 'unauthorized' || keyword === 'forbidden' ? 'critical' : 'high',
          category: 'security_auto',
          support: pattern.support,
          frequency: pattern.frequency,
          exampleLogs
        });
      }
    }

    return suggestions;
  }
}

export { RuleSuggestor };
