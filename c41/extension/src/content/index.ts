import { onLCP, onFID, onCLS } from 'web-vitals';
import { PerformanceMetrics, ResourceTiming, NavigationTiming } from '../types';

const BACKEND_URL = 'http://localhost:3000/api/metrics';
const SEND_INTERVAL = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

let metrics: PerformanceMetrics = {
  url: window.location.href,
  timestamp: Date.now(),
  resources: []
};

let isContentScriptRegistered = false;

function safeExecute<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.warn('Safe execute failed:', e);
    return fallback;
  }
}

function collectResources(): ResourceTiming[] {
  return safeExecute(() => {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return entries.map(entry => ({
      name: entry.name,
      entryType: entry.entryType,
      startTime: entry.startTime,
      duration: entry.duration,
      initiatorType: entry.initiatorType,
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0,
      decodedBodySize: entry.decodedBodySize || 0,
      domainLookupStart: entry.domainLookupStart || 0,
      domainLookupEnd: entry.domainLookupEnd || 0,
      connectStart: entry.connectStart || 0,
      connectEnd: entry.connectEnd || 0,
      secureConnectionStart: entry.secureConnectionStart || 0,
      requestStart: entry.requestStart || 0,
      responseStart: entry.responseStart || 0,
      responseEnd: entry.responseEnd || 0
    }));
  }, []);
}

function collectNavigation(): NavigationTiming | undefined {
  return safeExecute(() => {
    const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (!navigation) return undefined;
    
    return {
      domContentLoadedEventEnd: navigation.domContentLoadedEventEnd || 0,
      loadEventEnd: navigation.loadEventEnd || 0,
      domInteractive: navigation.domInteractive || 0,
      domComplete: navigation.domComplete || 0,
      responseStart: navigation.responseStart || 0,
      responseEnd: navigation.responseEnd || 0,
      fetchStart: navigation.fetchStart || 0,
      domainLookupStart: navigation.domainLookupStart || 0,
      domainLookupEnd: navigation.domainLookupEnd || 0,
      connectStart: navigation.connectStart || 0,
      connectEnd: navigation.connectEnd || 0,
      secureConnectionStart: navigation.secureConnectionStart || 0,
      requestStart: navigation.requestStart || 0
    };
  }, undefined);
}

async function sendMetricsWithRetry(retryCount: number = 0): Promise<void> {
  try {
    metrics.url = window.location.href;
    metrics.timestamp = Date.now();
    metrics.resources = collectResources();
    metrics.navigation = collectNavigation();

    await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metrics),
      keepalive: true
    });
  } catch (err) {
    if (retryCount < MAX_RETRIES) {
      setTimeout(() => sendMetricsWithRetry(retryCount + 1), RETRY_DELAY * (retryCount + 1));
    }
  }
}

function sendMetrics() {
  sendMetricsWithRetry().catch(() => {});
}

function updatePopup() {
  safeExecute(() => {
    chrome.runtime.sendMessage({
      type: 'METRICS_UPDATE',
      data: metrics
    }).catch(() => {});
  }, undefined);
}

function setupMessageListener() {
  try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'GET_METRICS') {
        metrics.resources = collectResources();
        metrics.navigation = collectNavigation();
        sendResponse(metrics);
      }
      return true;
    });
  } catch (e) {
    console.warn('Failed to setup message listener:', e);
  }
}

function initMetricsCollection() {
  try {
    onLCP(metric => {
      metrics.lcp = metric.value;
      updatePopup();
    });

    onFID(metric => {
      metrics.fid = metric.value;
      updatePopup();
    });

    onCLS(metric => {
      metrics.cls = metric.value;
      updatePopup();
    });

    setInterval(sendMetrics, SEND_INTERVAL);

    window.addEventListener('beforeunload', () => {
      sendMetrics();
    });

    isContentScriptRegistered = true;
  } catch (e) {
    console.error('Failed to initialize metrics collection:', e);
  }
}

function checkAndInit() {
  if (window.top !== window.self) {
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initMetricsCollection();
      setupMessageListener();
    });
  } else {
    initMetricsCollection();
    setupMessageListener();
  }
}

checkAndInit();

export {};
