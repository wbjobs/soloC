import React, { useState, useEffect, useCallback } from 'react';
import { PerformanceMetrics, MetricScore, AlertMessage } from '../types';

function calculateScore(metrics: PerformanceMetrics): MetricScore {
  const lcpValue = metrics.lcp || 0;
  const fidValue = metrics.fid || 0;
  const clsValue = metrics.cls || 0;

  let lcpScore = 0;
  if (lcpValue <= 2500) lcpScore = 100;
  else if (lcpValue <= 4000) lcpScore = 50;
  else lcpScore = 0;

  let fidScore = 0;
  if (fidValue <= 100) fidScore = 100;
  else if (fidValue <= 300) fidScore = 50;
  else fidScore = 0;

  let clsScore = 0;
  if (clsValue <= 0.1) clsScore = 100;
  else if (clsValue <= 0.25) clsScore = 50;
  else clsScore = 0;

  const getGrade = (score: number) => {
    if (score >= 90) return 'good';
    if (score >= 50) return 'needs-improvement';
    return 'poor';
  };

  const overall = Math.round((lcpScore + fidScore + clsScore) / 3);

  return {
    lcp: { value: lcpValue, score: lcpScore, grade: getGrade(lcpScore) },
    fid: { value: fidValue, score: fidScore, grade: getGrade(fidScore) },
    cls: { value: clsValue, score: clsScore, grade: getGrade(clsScore) },
    overall
  };
}

function getOverallGrade(score: number): string {
  if (score >= 90) return 'good';
  if (score >= 50) return 'needs-improvement';
  return 'poor';
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

function getMetricIcon(metric: string): string {
  switch (metric) {
    case 'lcp': return '⏱️';
    case 'fid': return '⌨️';
    case 'cls': return '📐';
    default: return '⚠️';
  }
}

function AlertBanner({ alerts, onDismiss }: { alerts: AlertMessage[]; onDismiss: () => void }) {
  if (alerts.length === 0) return null;

  return (
    <div className="alert-banner">
      <div className="alert-header">
        <span className="alert-title">🚨 性能告警 ({alerts.length})</span>
        <button className="alert-dismiss" onClick={onDismiss}>
          清除
        </button>
      </div>
      <div className="alert-list">
        {alerts.slice(0, 3).map((alert, index) => (
          <div key={`${alert.timestamp}-${index}`} className="alert-item">
            <span className="alert-icon">{getMetricIcon(alert.metric)}</span>
            <div className="alert-content">
              <div className="alert-message">{alert.message}</div>
              <div className="alert-time">{formatTime(alert.timestamp)}</div>
            </div>
          </div>
        ))}
        {alerts.length > 3 && (
          <div className="alert-more">还有 {alerts.length - 3} 条告警...</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);

  const fetchMetrics = useCallback(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(
          tabs[0].id, 
          { type: 'GET_METRICS' },
          (response) => {
            if (chrome.runtime.lastError) {
              if (retryCount < 3) {
                setTimeout(() => {
                  setRetryCount(prev => prev + 1);
                }, 500);
              }
              return;
            }
            if (response) {
              setMetrics(response);
              setRetryCount(0);
            }
          }
        );
      }
    });
  }, [retryCount]);

  const fetchAlerts = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_ALERTS' }, (response) => {
      if (response && Array.isArray(response)) {
        setAlerts(response);
      }
    });
  }, []);

  const clearAlerts = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'CLEAR_ALERTS' });
    setAlerts([]);
  }, []);

  useEffect(() => {
    fetchMetrics();
    fetchAlerts();

    const interval = setInterval(fetchMetrics, 2000);

    const listener = (request: any) => {
      if (request.type === 'METRICS_UPDATE') {
        setMetrics(request.data);
      }
      if (request.type === 'NEW_ALERT') {
        setAlerts(prev => {
          const newAlerts = [request.data, ...prev];
          return newAlerts.slice(0, 50);
        });
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [fetchMetrics, fetchAlerts]);

  if (!metrics) {
    return (
      <div className="container">
        <div className="loading">
          <div>正在收集性能数据...</div>
          {retryCount > 0 && <div style={{ fontSize: '12px', marginTop: '8px', color: '#666' }}>重试中... ({retryCount}/3)</div>}
        </div>
      </div>
    );
  }

  const currentUrlAlerts = alerts.filter(a => a.url === metrics.url);
  const score = calculateScore(metrics);
  const overallGrade = getOverallGrade(score.overall);

  return (
    <div className="container">
      <AlertBanner alerts={currentUrlAlerts} onDismiss={clearAlerts} />

      <div className="header">
        <h1>性能监控</h1>
        <p>实时页面性能指标</p>
        <p className="url">{metrics.url}</p>
      </div>

      <div className="overall-score">
        <div className={`score-circle ${overallGrade}`}>
          {score.overall}
        </div>
        <div className="score-label">综合评分</div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-name">LCP</span>
            <span className={`metric-grade ${score.lcp.grade}`}>
              {score.lcp.grade === 'good' ? '优秀' : score.lcp.grade === 'needs-improvement' ? '良好' : '较差'}
            </span>
          </div>
          <div className="metric-value">
            {metrics.lcp ? `${(metrics.lcp / 1000).toFixed(2)}s` : '-'}
          </div>
          <div className="metric-desc">最大内容绘制</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-name">FID</span>
            <span className={`metric-grade ${score.fid.grade}`}>
              {score.fid.grade === 'good' ? '优秀' : score.fid.grade === 'needs-improvement' ? '良好' : '较差'}
            </span>
          </div>
          <div className="metric-value">
            {metrics.fid ? `${metrics.fid.toFixed(0)}ms` : '-'}
          </div>
          <div className="metric-desc">首次输入延迟</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-name">CLS</span>
            <span className={`metric-grade ${score.cls.grade}`}>
              {score.cls.grade === 'good' ? '优秀' : score.cls.grade === 'needs-improvement' ? '良好' : '较差'}
            </span>
          </div>
          <div className="metric-value">
            {metrics.cls !== undefined ? metrics.cls.toFixed(3) : '-'}
          </div>
          <div className="metric-desc">累积布局偏移</div>
        </div>
      </div>

      {metrics.navigation && (
        <div className="nav-info">
          <h3>导航计时</h3>
          <div className="nav-item">
            <span className="nav-label">DOM 加载</span>
            <span className="nav-value">{metrics.navigation.domContentLoadedEventEnd.toFixed(0)}ms</span>
          </div>
          <div className="nav-item">
            <span className="nav-label">页面加载</span>
            <span className="nav-value">{metrics.navigation.loadEventEnd.toFixed(0)}ms</span>
          </div>
          <div className="nav-item">
            <span className="nav-label">TTFB</span>
            <span className="nav-value">{Math.max(0, metrics.navigation.responseStart - metrics.navigation.fetchStart).toFixed(0)}ms</span>
          </div>
          <div className="nav-item">
            <span className="nav-label">DNS 查询</span>
            <span className="nav-value">{Math.max(0, metrics.navigation.domainLookupEnd - metrics.navigation.domainLookupStart).toFixed(0)}ms</span>
          </div>
          <div className="nav-item">
            <span className="nav-label">TCP 连接</span>
            <span className="nav-value">{Math.max(0, metrics.navigation.connectEnd - metrics.navigation.connectStart).toFixed(0)}ms</span>
          </div>
        </div>
      )}
    </div>
  );
}
