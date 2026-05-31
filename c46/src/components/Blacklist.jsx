import React, { useState } from 'react';

const { ipcRenderer } = window.require ? window.require('electron') : {
  ipcRenderer: { send: () => {} },
};

function Blacklist({ items }) {
  const [newApp, setNewApp] = useState('');

  const handleAdd = () => {
    if (newApp.trim()) {
      ipcRenderer.send('add-to-blacklist', newApp.trim());
      setNewApp('');
    }
  };

  const handleRemove = (appName) => {
    ipcRenderer.send('remove-from-blacklist', appName);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  return (
    <div className="blacklist-section">
      <div className="blacklist-input">
        <input
          type="text"
          placeholder="输入应用名称添加到黑名单..."
          value={newApp}
          onChange={(e) => setNewApp(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button onClick={handleAdd}>添加</button>
      </div>
      <div className="blacklist-items">
        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px' }}>
            <p>暂无黑名单应用</p>
          </div>
        ) : (
          items.map((app, index) => (
            <div key={index} className="blacklist-item">
              <span>{app}</span>
              <button onClick={() => handleRemove(app)}>移除</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Blacklist;