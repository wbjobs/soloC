import React from 'react'

function HistoryPanel({ history, historyIndex, onHistoryIndexChange, onClose }) {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString()
  }

  const getTypeLabel = (type) => {
    const labels = {
      add: '➕ Add Shape',
      update: '✏️ Update Shape',
      delete: '🗑️ Delete Shape',
      clear: '🧹 Clear All'
    }
    return labels[type] || type
  }

  return (
    <div className="history-panel">
      <div className="history-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>History</span>
        <button 
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '18px' }}
        >
          ✕
        </button>
      </div>
      <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
        <button 
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={() => onHistoryIndexChange(-1)}
        >
          Back to Latest
        </button>
      </div>
      <div className="history-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {history.slice().reverse().map((item, index) => {
          const realIndex = history.length - 1 - index
          return (
            <div
              key={index}
              className={`history-item ${historyIndex === realIndex ? 'active' : ''}`}
              onClick={() => onHistoryIndexChange(realIndex)}
              style={{
                padding: '12px',
                marginBottom: '8px',
                background: historyIndex === realIndex ? '#4a6cf7' : '#252542',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <div className="history-time" style={{ color: '#fff', fontWeight: '600' }}>
                {formatTime(item.timestamp)}
              </div>
              <div className="history-type" style={{ color: '#aaa', fontSize: '12px', marginTop: '4px' }}>
                {getTypeLabel(item.type)}
              </div>
              {item.shape && item.shape.type && (
                <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>
                  Type: {item.shape.type}
                </div>
              )}
            </div>
          )
        })}
        {history.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
            No history yet
          </div>
        )}
      </div>
    </div>
  )
}

export default HistoryPanel