import React from 'react'

function StatusBar({ status }) {
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="status-bar">
      <div className="status-item">
        <span>📁 已索引文件:</span>
        <span className="status-value">{status.total_files || 0}</span>
      </div>
      <div className="status-item">
        <span>🔑 唯一哈希值:</span>
        <span className="status-value">{status.unique_files || 0}</span>
      </div>
      <div className="status-item">
        <span>🔗 重复组:</span>
        <span className="status-value">{status.duplicate_groups || 0}</span>
      </div>
      <div className="status-item">
        <span>💾 可释放空间:</span>
        <span className="status-value">{formatSize(status.wasted_space || 0)}</span>
      </div>
      <div className="status-item">
        <span>📂 FUSE挂载:</span>
        <span className="status-value">
          {status.mounted ? '✓ 已挂载' : '未挂载'}
        </span>
      </div>
    </div>
  )
}

export default StatusBar
