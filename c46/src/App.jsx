import React, { useState, useEffect } from 'react';
import ClipboardList from './components/ClipboardList';
import Blacklist from './components/Blacklist';
import Sync from './components/Sync';

const { ipcRenderer } = window.require ? window.require('electron') : {
  ipcRenderer: {
    send: () => {},
    on: () => {},
    removeListener: () => {},
  },
};

function App() {
  const [history, setHistory] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('history');

  useEffect(() => {
    ipcRenderer.send('get-history');
    ipcRenderer.send('get-blacklist');

    const handleClipboardUpdate = (event, data) => {
      setHistory(data);
    };

    const handleBlacklistUpdate = (event, data) => {
      setBlacklist(data);
    };

    ipcRenderer.on('clipboard-update', handleClipboardUpdate);
    ipcRenderer.on('blacklist-update', handleBlacklistUpdate);

    return () => {
      ipcRenderer.removeListener('clipboard-update', handleClipboardUpdate);
      ipcRenderer.removeListener('blacklist-update', handleBlacklistUpdate);
    };
  }, []);

  const filteredHistory = history.filter(item => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    if (item.type === 'text') {
      return item.content.toLowerCase().includes(query);
    } else if (item.type === 'file') {
      return item.content.toLowerCase().includes(query);
    }
    return false;
  });

  const handleClose = () => {
    ipcRenderer.send('hide-window');
  };

  return (
    <div className="app-container">
      <div className="header">
        <div className="header-top">
          <h1 className="title">📋 剪贴板历史</h1>
          <button className="close-btn" onClick={handleClose}>
            ✕
          </button>
        </div>
        <input
          type="text"
          className="search-input"
          placeholder="搜索剪贴板历史..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            历史记录
          </button>
          <button
            className={`tab ${activeTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            ☁️ 同步
          </button>
          <button
            className={`tab ${activeTab === 'blacklist' ? 'active' : ''}`}
            onClick={() => setActiveTab('blacklist')}
          >
            黑名单
          </button>
        </div>
      </div>
      <div className="content">
        {activeTab === 'history' ? (
          <ClipboardList items={filteredHistory} />
        ) : activeTab === 'sync' ? (
          <Sync />
        ) : (
          <Blacklist items={blacklist} />
        )}
      </div>
    </div>
  );
}

export default App;