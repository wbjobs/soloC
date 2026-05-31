export interface LogEntry {
  id?: number;
  timestamp: number;
  level: string;
  message: string;
  source: string;
  host?: string;
  process?: string;
  raw: string;
}

export interface Cluster {
  id: number;
  size: number;
  sampleLogs: LogEntry[];
  representative: string;
}

export interface SearchFilters {
  level: string;
  source: string;
  startDate: string;
  endDate: string;
  regex: string;
}

export interface Pattern {
  sequence: string[];
  support: number;
  frequency: number;
}

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

export interface RegexTemplate {
  id: string;
  name: string;
  pattern: string;
  description: string;
  category: string;
  examples: string[];
  testResults: Array<{ input: string; match: boolean }>;
}
