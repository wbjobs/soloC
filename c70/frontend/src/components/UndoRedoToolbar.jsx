import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = 'http://localhost:5000/api'

function UndoRedoToolbar({ onOperationComplete }) {
  const [status, setStatus] = useState({ can_undo: false, can_redo: false })
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [processing, setProcessing] = useState({ undo: false, redo: false })

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/cleanup/status`)
      setStatus(res.data)
      if (res.data.history) {
        setHistory(res.data.history)
      }
    } catch (err) {
      console.error('Failed to fetch cleanup status:', err)
    }
  }

  useEffect(() => {
    fetchStatus()
    
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [])

  const handleUndo = async () => {
    if (!status.can_undo || processing.undo) return
    
    setProcessing(prev => ({ ...prev, undo: true }))
    try {
      await axios.post(`${API_BASE}/cleanup/undo`)
      await fetchStatus()
      if (onOperationComplete) onOperationComplete()
    } catch (err) {
      console.error('Undo failed:', err)
    } finally {
      setProcessing(prev => ({ ...prev, undo: false }))
    }
  }

  const handleRedo = async () => {
    if (!status.can_redo || processing.redo) return
    
    setProcessing(prev => ({ ...prev, redo: true }))
    try {
      await axios.post(`${API_BASE}/cleanup/redo`)
      await fetchStatus()
      if (onOperationComplete) onOperationComplete()
    } catch (err) {
      console.error('Redo failed:', err)
    } finally {
      setProcessing(prev => ({ ...prev, redo: false }))
    }
  }

  return (
    <div className="undo-redo-toolbar">
      <div className="toolbar-buttons">
        <button
          className={`btn btn-undo ${!status.can_undo ? 'disabled' : ''}`}
          onClick={handleUndo}
          disabled={!status.can_undo || processing.undo}
          title="撤销上一次操作"
        >
          {processing.undo ? (
            <span className="spinner-inline"></span>
          ) : (
            '↩️'
          )}
          撤销
        </button>
        
        <button
          className={`btn btn-redo ${!status.can_redo ? 'disabled' : ''}`}
          onClick={handleRedo}
          disabled={!status.can_redo || processing.redo}
          title="重做已撤销的操作"
        >
          {processing.redo ? (
            <span className="spinner-inline"></span>
          ) : (
            '↪️'
          )}
          重做
        </button>

        <button
          className="btn btn-history"
          onClick={() => setShowHistory(!showHistory)}
          title="显示操作历史"
        >
          📜
        </button>
      </div>

      {showHistory && (
        <div className="history-dropdown">
          <div className="history-header">
            <strong>操作历史</strong>
            <button className="close-btn" onClick={() => setShowHistory(false)}>×</button>
          </div>
          <div className="history-list">
            {history.length === 0 ? (
              <div className="history-empty">暂无操作历史</div>
            ) : (
              history.map((op, index) => (
                <div key={op.id || index} className="history-item">
                  <div className="history-type">
                    {op.type === 'symlink_replace' ? '🔗 符号链接替换' : '📁 操作'}
                  </div>
                  <div className="history-desc">{op.description}</div>
                  <div className="history-time">
                    {new Date(op.timestamp).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {status.last_operation && (
        <div className="last-operation">
          <span className="last-op-label">上次操作:</span>
          <span className="last-op-desc">{status.last_operation.description}</span>
        </div>
      )}
    </div>
  )
}

export default UndoRedoToolbar
