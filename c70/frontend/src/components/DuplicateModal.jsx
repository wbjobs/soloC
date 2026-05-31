import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = 'http://localhost:5000/api'

function DuplicateModal({ item, onClose, onCleanupComplete }) {
  const [selectedKeep, setSelectedKeep] = useState('')
  const [selectedReplace, setSelectedReplace] = useState(new Set())
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (item && item.paths && item.paths.length > 0) {
      setSelectedKeep(item.paths[0])
      const others = new Set(item.paths.slice(1))
      setSelectedReplace(others)
    }
  }, [item])

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleKeepChange = (path) => {
    setSelectedKeep(path)
    const newReplace = new Set(selectedReplace)
    newReplace.delete(path)
    setSelectedReplace(newReplace)
  }

  const handleReplaceToggle = (path) => {
    if (path === selectedKeep) return
    
    const newReplace = new Set(selectedReplace)
    if (newReplace.has(path)) {
      newReplace.delete(path)
    } else {
      newReplace.add(path)
    }
    setSelectedReplace(newReplace)
  }

  const selectAllReplace = () => {
    const all = new Set(item.paths.filter(p => p !== selectedKeep))
    setSelectedReplace(all)
  }

  const handleExecuteCleanup = async () => {
    if (selectedReplace.size === 0) return
    
    setIsProcessing(true)
    setResult(null)

    try {
      const response = await axios.post(`${API_BASE}/cleanup/replace`, {
        file_hash: item.hash,
        keep_path: selectedKeep,
        replace_paths: Array.from(selectedReplace)
      })

      setResult(response.data)
      
      if (response.data.success && onCleanupComplete) {
        setTimeout(() => {
          onCleanupComplete()
        }, 1500)
      }
    } catch (err) {
      setResult({ success: false, error: err.message })
    } finally {
      setIsProcessing(false)
    }
  }

  const openPath = (path) => {
    const { shell } = window.require('electron')
    shell.showItemInFolder(path)
  }

  if (!item) return null

  const savedSpace = item.size * selectedReplace.size

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal duplicate-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔗 重复文件清理助手</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-section">
          <h3>📝 文件信息</h3>
          <div className="hash-display">{item.hash}</div>
          <div className="file-info">
            <div className="info-item">
              <div className="info-label">副本数量</div>
              <div className="info-value">{item.count}</div>
            </div>
            <div className="info-item">
              <div className="info-label">单文件大小</div>
              <div className="info-value">{formatSize(item.size)}</div>
            </div>
            <div className="info-item">
              <div className="info-label">预计释放空间</div>
              <div className="info-value saved">{formatSize(savedSpace)}</div>
            </div>
          </div>
        </div>

        <div className="modal-section">
          <div className="section-header">
            <h3>📍 选择基准副本（保留）</h3>
          </div>
          <div className="paths-list">
            {item.paths && item.paths.map((path, index) => (
              <div key={index} className={`path-item ${selectedKeep === path ? 'keep-selected' : ''}`}>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="keep"
                    checked={selectedKeep === path}
                    onChange={() => handleKeepChange(path)}
                  />
                  <span className="keep-indicator">📌 保留</span>
                </label>
                <span className="path-text">{path}</span>
                <button className="btn btn-small btn-secondary" onClick={() => openPath(path)}>
                  定位
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-section">
          <div className="section-header">
            <h3>🔄 选择替换为符号链接的副本</h3>
            <button className="btn btn-small btn-primary" onClick={selectAllReplace}>
              全选
            </button>
          </div>
          <div className="paths-list">
            {item.paths && item.paths.map((path, index) => {
              const isKeep = path === selectedKeep
              const isReplace = selectedReplace.has(path)
              
              return (
                <div key={index} className={`path-item ${isKeep ? 'keep-selected' : ''} ${isReplace ? 'replace-selected' : ''}`}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      disabled={isKeep}
                      checked={isReplace}
                      onChange={() => handleReplaceToggle(path)}
                    />
                    {isKeep ? <span className="keep-badge">保留</span> : null}
                  </label>
                  <span className="path-text">{path}</span>
                  <button className="btn btn-small btn-secondary" onClick={() => openPath(path)}>
                    定位
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {result && (
          <div className={`result-banner ${result.success ? 'success' : 'error'}`}>
            {result.success ? (
              <span>✓ 成功！替换了 {result.replaced_count} 个文件，释放 {formatSize(result.saved_space)}</span>
            ) : (
              <span>✗ 失败: {result.error}</span>
            )}
          </div>
        )}

        <div className="cleanup-options">
          <div className="option-checkbox">
            <input type="checkbox" id="keepInTrash" defaultChecked />
            <label htmlFor="keepInTrash">
              原始文件移至回收站（可恢复）
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-primary btn-large"
            onClick={handleExecuteCleanup}
            disabled={isProcessing || selectedReplace.size === 0}
          >
            {isProcessing ? (
              <>
                <span className="spinner-inline"></span>
                处理中...
              </>
            ) : (
              `执行清理 (${selectedReplace.size} 个文件)`
            )}
          </button>
        </div>

        <div className="cleanup-hint">
          <p>💡 <strong>提示：</strong></p>
          <ul>
            <li>基准副本将作为原始文件保留</li>
            <li>选中的副本将被替换为指向基准的符号链接</li>
            <li>原始文件将移至回收站，可通过 Undo 完全恢复</li>
            <li>Windows 需启用开发者模式或管理员权限创建符号链接</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default DuplicateModal
