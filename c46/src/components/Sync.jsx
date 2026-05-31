import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require ? window.require('electron') : {
  ipcRenderer: {
    send: () => {},
    on: () => {},
    removeListener: () => {},
  },
};

function Sync() {
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [activeTab, setActiveTab] = useState('export');

  useEffect(() => {
    ipcRenderer.send('has-sync-password');

    const handleHasPassword = (event, result) => {
      setHasPassword(result.hasPassword);
    };

    const handlePasswordSet = (event, result) => {
      if (result.success) {
        showMessage('密码设置成功！', 'success');
        setHasPassword(true);
        setPassword('');
        setConfirmPassword('');
      } else {
        showMessage(result.error || '密码设置失败', 'error');
      }
    };

    const handlePasswordVerified = (event, result) => {
      if (result.success) {
        setIsVerified(true);
        showMessage('密码验证成功！', 'success');
      } else {
        showMessage(result.error || '密码错误', 'error');
      }
    };

    const handleExportResult = (event, result) => {
      if (result.canceled) return;
      if (result.success) {
        showMessage(`成功导出 ${result.itemCount} 条记录！`, 'success');
      } else {
        showMessage(result.error || '导出失败', 'error');
      }
    };

    const handleImportResult = (event, result) => {
      if (result.canceled) return;
      if (result.success) {
        showMessage(`成功导入 ${result.importedCount} 条新记录！`, 'success');
      } else {
        showMessage(result.error || '导入失败', 'error');
      }
    };

    ipcRenderer.on('has-sync-password-result', handleHasPassword);
    ipcRenderer.on('sync-password-set', handlePasswordSet);
    ipcRenderer.on('sync-password-verified', handlePasswordVerified);
    ipcRenderer.on('export-result', handleExportResult);
    ipcRenderer.on('import-result', handleImportResult);

    return () => {
      ipcRenderer.removeListener('has-sync-password-result', handleHasPassword);
      ipcRenderer.removeListener('sync-password-set', handlePasswordSet);
      ipcRenderer.removeListener('sync-password-verified', handlePasswordVerified);
      ipcRenderer.removeListener('export-result', handleExportResult);
      ipcRenderer.removeListener('import-result', handleImportResult);
    };
  }, []);

  const showMessage = (msg, type) => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleSetPassword = () => {
    if (!password || password.length < 6) {
      showMessage('密码长度至少6位', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showMessage('两次输入的密码不一致', 'error');
      return;
    }
    ipcRenderer.send('set-sync-password', password);
  };

  const handleVerifyPassword = () => {
    if (!password) {
      showMessage('请输入密码', 'error');
      return;
    }
    ipcRenderer.send('verify-sync-password', password);
  };

  const handleExport = () => {
    if (!password) {
      showMessage('请输入密码', 'error');
      return;
    }
    ipcRenderer.send('export-encrypted-data', password);
  };

  const handleImport = () => {
    if (!password) {
      showMessage('请输入密码', 'error');
      return;
    }
    ipcRenderer.send('import-encrypted-data', password);
  };

  return (
    <div className="sync-container">
      {message && (
        <div className={`message ${messageType}`}>
          {message}
        </div>
      )}

      {!hasPassword ? (
        <div className="password-setup">
          <h3>🔐 设置同步密码</h3>
          <p className="description">
            设置一个密码来加密您的剪贴板数据，以便在不同设备间同步。
            请务必记住此密码，丢失后将无法恢复数据。
          </p>
          <div className="input-group">
            <label>设置密码</label>
            <input
              type="password"
              placeholder="至少6位密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label>确认密码</label>
            <input
              type="password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSetPassword()}
            />
          </div>
          <button className="primary-btn" onClick={handleSetPassword}>
            设置密码
          </button>
        </div>
      ) : !isVerified ? (
        <div className="password-verify">
          <h3>🔑 验证密码</h3>
          <p className="description">
            请输入您的同步密码以进行数据导入导出操作。
          </p>
          <div className="input-group">
            <label>输入密码</label>
            <input
              type="password"
              placeholder="请输入同步密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleVerifyPassword()}
            />
          </div>
          <button className="primary-btn" onClick={handleVerifyPassword}>
            验证
          </button>
        </div>
      ) : (
        <div className="sync-operations">
          <h3>☁️ 数据同步</h3>
          <p className="description">
            导出加密的剪贴板数据到文件，或从文件导入恢复数据。
            <br />
            <span style={{ color: '#4ade80' }}>⭐ 标星的记录会被优先同步</span>
          </p>

          <div className="tabs">
            <button
              className={`tab ${activeTab === 'export' ? 'active' : ''}`}
              onClick={() => setActiveTab('export')}
            >
              导出数据
            </button>
            <button
              className={`tab ${activeTab === 'import' ? 'active' : ''}`}
              onClick={() => setActiveTab('import')}
            >
              导入数据
            </button>
          </div>

          {activeTab === 'export' ? (
            <div className="operation-panel">
              <div className="input-group">
                <label>确认密码</label>
                <input
                  type="password"
                  placeholder="请输入密码用于加密"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button className="primary-btn" onClick={handleExport}>
                📤 导出加密数据
              </button>
              <p className="hint">
                导出的文件可以通过任意云盘（如百度云、OneDrive等）传输到其他设备
              </p>
            </div>
          ) : (
            <div className="operation-panel">
              <div className="input-group">
                <label>确认密码</label>
                <input
                  type="password"
                  placeholder="请输入密码用于解密"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button className="primary-btn secondary" onClick={handleImport}>
                📥 导入加密数据
              </button>
              <p className="hint">
                选择之前导出的 .enc 文件，将自动合并不重复的剪贴板记录
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Sync;
