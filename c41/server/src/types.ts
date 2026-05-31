export interface PerformanceMetrics {
  url: string;
  timestamp: number;
  lcp?: number;
  fid?: number;
  cls?: number;
  resources: ResourceTiming[];
  navigation?: NavigationTiming;
}

export interface ResourceTiming {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  initiatorType: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  domainLookupStart: number;
  domainLookupEnd: number;
  connectStart: number;
  connectEnd: number;
  secureConnectionStart: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
}

export interface NavigationTiming {
  domContentLoadedEventEnd: number;
  loadEventEnd: number;
  domInteractive: number;
  domComplete: number;
  responseStart: number;
  responseEnd: number;
  fetchStart: number;
  domainLookupStart: number;
  domainLookupEnd: number;
  connectStart: number;
  connectEnd: number;
  secureConnectionStart: number;
  requestStart: number;
}

export interface MetricsRecord {
  id: number;
  url: string;
  timestamp: number;
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  navigation: string | null;
}

export interface ResourceRecord {
  id: number;
  metricsId: number;
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  initiatorType: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  domainLookupStart: number;
  domainLookupEnd: number;
  connectStart: number;
  connectEnd: number;
  secureConnectionStart: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
}

export interface AlertThresholds {
  lcp: number;
  fid: number;
  cls: number;
}

export interface AlertMessage {
  type: 'ALERT';
  url: string;
  timestamp: number;
  metric: string;
  value: number;
  threshold: number;
  message: string;
}

export interface AlertRecord {
  id: number;
  url: string;
  timestamp: number;
  metric: string;
  value: number;
  threshold: number;
}
