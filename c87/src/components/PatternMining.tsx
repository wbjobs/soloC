
import React, { useState } from 'react';
import { Pattern, RuleSuggestion, RegexTemplate } from '../types';

interface MiningResult {
  patterns: Pattern[];
  keywords: Array<{ word: string; count: number }>;
  ruleSuggestions: RuleSuggestion[];
  regexTemplates: RegexTemplate[];
  processingTime: number;
  totalLogs: number;
}

interface PatternMiningProps {
  onApplyRegex?: (regex: string) => void;
}

const PatternMining: React.FC<PatternMiningProps> = ({ onApplyRegex }) => {
  const [isMining, setIsMining] = useState(false);
  const [result, setResult] = useState<MiningResult | null>(null);
  const [activeTab, setActiveTab] = useState<'patterns' | 'rules' | 'regex'>('patterns');
  const [minSupport, setMinSupport] = useState(0.01);
  const [maxPatternLength, setMaxPatternLength] = useState(8);
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const [testingRegex, setTestingRegex] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ matchCount: number; totalCount: number; matches: string[] } | null>(null);

  const handleMinePatterns = async () => {
    setIsMining(true);
    setResult(null);

    try {
      const response = await (window as any).electronAPI.minePatterns(minSupport, maxPatternLength);
      if (response.success) {
        setResult(response.data);
      }
    } catch (error) {
      console.error('模式挖掘失败:', error);
    } finally {
      setIsMining(false);
    }
  };

  const handleTestRegex = async (regex: string) => {
    setTestingRegex(regex);
    try {
      const response = await (window as any).electronAPI.testRegex(regex, 100);
      if (response.success) {
        setTestResults(response.data);
      }
    } catch (error) {
      console.error('正则测试失败:', error);
    }
  };

  const handleCopyRegex = (regex: string) => {
    navigator.clipboard.writeText(regex);
  };

  const handleApplyToFilter = (regex: string) => {
    if (onApplyRegex) {
      onApplyRegex(regex);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#dc3545';
      case 'high': return '#fd7e14';
      case 'medium': return '#ffc107';
      case 'low': return '#28a745';
      default: return '#6c757d';
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      error_detection: '#dc3545',
      warning_detection: '#ffc107',
      network: '#007bff',
      security: '#6610f2',
      database: '#28a745',
      performance: '#17a2b8',
      storage: '#fd7e14',
      api: '#6f42c1',
      crash_detection: '#dc3545',
      auto_error: '#dc3545',
      security_auto: '#6610f2',
      pattern_based: '#17a2b8',
      optimized: '#28a745',
      general: '#6c757d'
    };
    return colors[category] || '#6c757d';
  };

  return (
    <div className="pattern-mining-container">
      <div className="mining-header">
        <h2>🔍 模式发现</h2>
        <p className="mining-description">
          使用PrefixSpan算法挖掘日志中的频繁序列模式，自动生成规则建议和正则表达式模板
        </p>
      </div>

      <div className="mining-controls">
        <div className="control-group">
          <label>最小支持度:</label>
          <input
            type="number"
            min="0.001"
            max="0.5"
            step="0.001"
            value={minSupport}
            onChange={(e) => setMinSupport(parseFloat(e.target.value))}
            disabled={isMining}
          />
          <span className="control-hint">控制模式的频率阈值</span>
        </div>

        <div className="control-group">
          <label>最大模式长度:</label>
          <input
            type="number"
            min="2"
            max="15"
            step="1"
            value={maxPatternLength}
            onChange={(e) => setMaxPatternLength(parseInt(e.target.value))}
            disabled={isMining}
          />
          <span className="control-hint">序列的最大词数</span>
        </div>

        <button
          className="mine-button"
          onClick={handleMinePatterns}
          disabled={isMining}
        >
          {isMining ? '⏳ 挖掘中...' : '🚀 开始挖掘'}
        </button>
      </div>

      {result && (
        <div className="mining-stats">
          <div className="stat-item">
            <span className="stat-value">{result.totalLogs.toLocaleString()}</span>
            <span className="stat-label">处理日志数</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{result.patterns.length}</span>
            <span className="stat-label">发现模式</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{result.ruleSuggestions.length}</span>
            <span className="stat-label">规则建议</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{result.processingTime}ms</span>
            <span className="stat-label">处理时间</span>
          </div>
        </div>
      )}

      {result && (
        <div className="mining-tabs">
          <div className="tab-header">
            <button
              className={`tab-button ${activeTab === 'patterns' ? 'active' : ''}`}
              onClick={() => setActiveTab('patterns')}
            >
              频繁模式 ({result.patterns.length})
            </button>
            <button
              className={`tab-button ${activeTab === 'rules' ? 'active' : ''}`}
              onClick={() => setActiveTab('rules')}
            >
              规则建议 ({result.ruleSuggestions.length})
            </button>
            <button
              className={`tab-button ${activeTab === 'regex' ? 'active' : ''}`}
              onClick={() => setActiveTab('regex')}
            >
              正则模板 ({result.regexTemplates.length})
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'patterns' && (
              <div className="patterns-list">
                <div className="keywords-cloud">
                  <h3>📊 热门关键词</h3>
                  <div className="keywords-container">
                    {result.keywords.slice(0, 20).map((kw, idx) => (
                      <span
                        key={idx}
                        className="keyword-tag"
                        style={{
                          fontSize: `${Math.min(20, 12 + (kw.count / result.keywords[0].count) * 8)}px`,
                          opacity: 0.5 + (kw.count / result.keywords[0].count) * 0.5
                        }}
                      >
                        {kw.word}
                        <span className="keyword-count">{kw.count}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="patterns-grid">
                  {result.patterns.slice(0, 50).map((pattern, idx) => (
                    <div
                      key={idx}
                      className="pattern-card"
                      onClick={() => setExpandedPattern(expandedPattern === pattern.sequence.join(' ') ? null : pattern.sequence.join(' '))}
                    >
                      <div className="pattern-header">
                        <span className="pattern-support">
                          出现 {pattern.support} 次 ({(pattern.frequency * 100).toFixed(1)}%)
                        </span>
                        <span className="pattern-length">
                          长度 {pattern.sequence.length}
                        </span>
                      </div>
                      <div className="pattern-sequence">
                        {pattern.sequence.map((word, wIdx) => (
                          <span key={wIdx} className="pattern-word">
                            {word}
                          </span>
                        ))}
                      </div>
                      {expandedPattern === pattern.sequence.join(' ') && (
                        <div className="pattern-actions">
                          <button
                            className="pattern-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTestRegex(pattern.sequence.join('.*'));
                            }}
                          >
                            🧪 测试匹配
                          </button>
                          <button
                            className="pattern-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyRegex(`.*${pattern.sequence.join('.*')}.*`);
                            }}
                          >
                            📋 复制正则
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'rules' && (
              <div className="rules-list">
                {result.ruleSuggestions.map((rule, idx) => (
                  <div key={idx} className="rule-card">
                    <div className="rule-header">
                      <div className="rule-title">
                        <span
                          className="rule-severity"
                          style={{ backgroundColor: getSeverityColor(rule.severity) }}
                        >
                          {rule.severity.toUpperCase()}
                        </span>
                        <h4>{rule.name}</h4>
                      </div>
                      <span
                        className="rule-category"
                        style={{ backgroundColor: getCategoryColor(rule.category) }}
                      >
                        {rule.category}
                      </span>
                    </div>
                    <p className="rule-description">{rule.description}</p>
                    <div className="rule-pattern">
                      <strong>模式:</strong> {rule.pattern.join(' → ')}
                    </div>
                    <div className="rule-regex">
                      <strong>正则:</strong>
                      <code>{rule.regex}</code>
                    </div>
                    <div className="rule-stats">
                      <span className="rule-support">支持度: {rule.support}</span>
                      <span className="rule-frequency">频率: {(rule.frequency * 100).toFixed(1)}%</span>
                    </div>
                    {rule.exampleLogs.length > 0 && (
                      <div className="rule-examples">
                        <strong>示例日志:</strong>
                        <ul>
                          {rule.exampleLogs.map((log, eIdx) => (
                            <li key={eIdx} className="example-log">{log}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="rule-actions">
                      <button
                        className="rule-action-btn primary"
                        onClick={() => handleApplyToFilter(rule.regex)}
                      >
                        ✨ 应用到过滤器
                      </button>
                      <button
                        className="rule-action-btn secondary"
                        onClick={() => handleCopyRegex(rule.regex)}
                      >
                        📋 复制正则
                      </button>
                      <button
                        className="rule-action-btn secondary"
                        onClick={() => handleTestRegex(rule.regex)}
                      >
                        🧪 测试匹配
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'regex' && (
              <div className="regex-list">
                {result.regexTemplates.map((regex, idx) => (
                  <div key={idx} className="regex-card">
                    <div className="regex-header">
                      <h4>{regex.name}</h4>
                      <span
                        className="regex-category"
                        style={{ backgroundColor: getCategoryColor(regex.category) }}
                      >
                        {regex.category}
                      </span>
                    </div>
                    <p className="regex-description">{regex.description}</p>
                    <div className="regex-pattern">
                      <code>{regex.pattern}</code>
                    </div>
                    {regex.testResults.length > 0 && (
                      <div className="regex-test-summary">
                        测试通过率: {regex.testResults.filter(t => t.match).length}/{regex.testResults.length}
                      </div>
                    )}
                    <div className="regex-actions">
                      <button
                        className="regex-action-btn primary"
                        onClick={() => handleApplyToFilter(regex.pattern)}
                      >
                        ✨ 应用到过滤器
                      </button>
                      <button
                        className="regex-action-btn secondary"
                        onClick={() => handleCopyRegex(regex.pattern)}
                      >
                        📋 复制正则
                      </button>
                      <button
                        className="regex-action-btn secondary"
                        onClick={() => handleTestRegex(regex.pattern)}
                      >
                        🧪 测试匹配
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {testingRegex && (
        <div className="regex-test-modal" onClick={() => { setTestingRegex(null); setTestResults(null); }}>
          <div className="test-modal-content" onClick={e => e.stopPropagation()}>
            <div className="test-modal-header">
              <h3>正则表达式测试</h3>
              <button
                className="close-button"
                onClick={() => { setTestingRegex(null); setTestResults(null); }}
              >
                ×
              </button>
            </div>
            <div className="test-modal-body">
              <div className="test-regex-display">
                <code>{testingRegex}</code>
              </div>
              {testResults && (
                <>
                  <div className="test-summary">
                    匹配: <strong>{testResults.matchCount}</strong> / {testResults.totalCount}
                    <div className="test-progress-bar">
                      <div
                        className="test-progress-fill"
                        style={{ width: `${(testResults.matchCount / Math.max(1, testResults.totalCount)) * 100}%` }}
                      />
                    </div>
                  </div>
                  {testResults.matches.length > 0 && (
                    <div className="test-matches">
                      <h4>匹配的日志:</h4>
                      <ul>
                        {testResults.matches.map((match, idx) => (
                          <li key={idx} className="match-item">{match}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatternMining;
