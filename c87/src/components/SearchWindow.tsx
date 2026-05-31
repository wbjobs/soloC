import React, { useState, useEffect } from 'react';
import { LogEntry } from '../types';
import * as dayjs from 'dayjs';

const SearchWindow: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LogEntry[]>([]);

  useEffect(() => {
    handleSearch();
  }, []);

  const handleSearch = async () => {
    const data = await window.electronAPI.quickSearch(query);
    setResults(data);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="search-window">
      <div className="search-window-header">
        <button onClick={() => window.electronAPI.closeSearchWindow()}>×</button>
      </div>
      <input
        type="text"
        className="search-window-input"
        placeholder="快速搜索日志... (按ESC关闭)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        onKeyDown={(e) => e.key === 'Escape' && window.electronAPI.closeSearchWindow()}
      />
      <div className="search-results">
        {results.length === 0 ? (
          <div className="empty-state">
            <p>未找到匹配的日志</p>
          </div>
        ) : (
          results.map((log) => (
            <div key={log.id} className="search-result-item">
              <div style={{ display: 'flex', gap: '10px', marginBottom: '5px' }}>
                <span className={`log-level ${log.level}`}>{log.level}</span>
                <span style={{ color: '#888' }}>{dayjs(log.timestamp).format('MM-DD HH:mm:ss')}</span>
                <span style={{ color: '#666' }}>{log.source}</span>
              </div>
              <div style={{ fontFamily: 'monospace' }}>{log.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SearchWindow;
