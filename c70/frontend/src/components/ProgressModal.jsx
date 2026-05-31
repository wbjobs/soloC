import React from 'react'

function ProgressModal({ progress, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal progress-modal">
        <div className="modal-header">
          <h2>📊 正在索引文件</h2>
        </div>

        <div className="progress-content">
          <div className="progress-bar-container">
            <div 
              className="progress-bar" 
              style={{ width: `${progress.percent || 0}%` }}
            ></div>
          </div>
          
          <div className="progress-stats">
            <span>已处理: {progress.current || 0} / {progress.total || 0}</span>
            <span className="progress-percent">{progress.percent || 0}%</span>
          </div>
          
          <p className="progress-note">
            正在计算文件哈希值，这可能需要几分钟时间...
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn btn-danger" onClick={onCancel}>
            取消索引
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProgressModal
