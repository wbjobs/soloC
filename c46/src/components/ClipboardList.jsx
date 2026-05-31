import React from 'react';

const { ipcRenderer } = window.require ? window.require('electron') : {
  ipcRenderer: { send: () => {} },
};

function ClipboardList({ items }) {
  const handleCopy = (item) => {
    ipcRenderer.send('copy-to-clipboard', item);
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    ipcRenderer.send('delete-item', id);
  };

  const handleToggleStar = (e, id) => {
    e.stopPropagation();
    ipcRenderer.send('toggle-item-star', id);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`;
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}小时前`;
    } else {
      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'text':
        return '文本';
      case 'image':
        return '图片';
      case 'file':
        return '文件';
      default:
        return '未知';
    }
  };

  const getImageSrc = (item) => {
    if (item.metadata && item.metadata.dataUrl) {
      return item.metadata.dataUrl;
    }
    if (typeof item.content === 'string' && item.content.startsWith('data:')) {
      return item.content;
    }
    if (typeof item.content === 'string' && item.content.endsWith('.png')) {
      return `file://${item.content}`;
    }
    return '';
  };

  const formatFileContent = (content) => {
    if (!content) return '';
    let formatted = content;
    if (formatted.startsWith('file://')) {
      formatted = decodeURIComponent(formatted.replace('file://', ''));
    }
    if (formatted.startsWith('text/uri-list:')) {
      formatted = formatted.replace('text/uri-list:', '');
    }
    return formatted;
  };

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <p>暂无剪贴板记录</p>
        <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.6 }}>
          复制一些内容后会显示在这里
        </p>
      </div>
    );
  }

  return (
    <div className="clipboard-list">
      {items.map((item) => (
        <div
          key={item.id}
          className={`clipboard-item ${item.starred ? 'starred' : ''}`}
          onClick={() => handleCopy(item)}
        >
          <button
            className="star-btn"
            onClick={(e) => handleToggleStar(e, item.id)}
          >
            {item.starred ? '⭐' : '☆'}
          </button>
          <button
            className="delete-btn"
            onClick={(e) => handleDelete(e, item.id)}
          >
            ✕
          </button>
          <div className="item-header">
            <div className="item-type">
              <span className={`type-badge ${item.type}`}>
                {getTypeLabel(item.type)}
              </span>
              {item.type === 'image' && item.metadata && item.metadata.size && (
                <span style={{ marginLeft: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>
                  {(item.metadata.size / 1024).toFixed(1)} KB
                </span>
              )}
            </div>
            <span className="item-time">{formatTime(item.timestamp)}</span>
          </div>
          {item.type === 'image' ? (
            <img
              src={getImageSrc(item)}
              alt="clipboard"
              className="item-content image-preview"
            />
          ) : (
            <div className="item-content">
              {item.type === 'file'
                ? formatFileContent(item.content)
                : item.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default ClipboardList;
