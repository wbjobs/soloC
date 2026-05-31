import React, { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import TreeView from './components/TreeView'
import DuplicateModal from './components/DuplicateModal'
import StatusBar from './components/StatusBar'
import ProgressModal from './components/ProgressModal'
import UndoRedoToolbar from './components/UndoRedoToolbar'
import './App.css'

const API_BASE = 'http://localhost:5000/api'

function App() {
  const [treeData, setTreeData] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [status, setStatus] = useState({})
  const [stats, setStats] = useState({})
  const [selectedItem, setSelectedItem] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 })
  const [autoCleaning, setAutoCleaning] = useState(false)
  
  const eventSourceRef = useRef(null)
  const abortControllerRef = useRef(null)
  const loadMoreRef = useRef(null)

  useEffect(() => {
    fetchStatus()
    fetchStats()
    fetchTreeData(1)
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/status`)
      setStatus(res.data)
    } catch (err) {
      console.error('Failed to fetch status:', err)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_BASE}/stats`)
      setStats(res.data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }

  const fetchTreeData = async (page = 1, append = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    
    setLoading(!append)
    try {
      const res = await axios.get(`${API_BASE}/tree?page=${page}&per_page=100`, {
        signal: abortControllerRef.current.signal
      })
      
      if (append) {
        setTreeData(prev => [...prev, ...res.data.data])
      } else {
        setTreeData(res.data.data)
      }
      setPagination(res.data.pagination)
    } catch (err) {
      if (err.name !== 'CanceledError') {
        console.error('Failed to fetch tree data:', err)
      }
    } finally {
      setLoading(false)
    }
  }

  const setupProgressStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    
    eventSourceRef.current = new EventSource(`${API_BASE}/index/progress`)
    
    eventSourceRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'progress') {
          setProgress(data)
        } else if (data.type === 'complete') {
          setShowProgress(false)
          fetchStatus()
          fetchStats()
          fetchTreeData(1)
          if (eventSourceRef.current) {
            eventSourceRef.current.close()
          }
        }
      } catch (e) {
        console.error('Failed to parse progress:', e)
      }
    }
    
    eventSourceRef.current.onerror = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  const handleIndexFiles = async () => {
    try {
      await axios.post(`${API_BASE}/index`, { path: 'C:/' })
      setShowProgress(true)
      setupProgressStream()
    } catch (err) {
      console.error('Failed to start indexing:', err)
    }
  }

  const handleCancelIndexing = async () => {
    try {
      await axios.post(`${API_BASE}/index/cancel`)
      setShowProgress(false)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      fetchStatus()
      fetchTreeData(1)
    } catch (err) {
      console.error('Failed to cancel indexing:', err)
    }
  }

  const handleNodeClick = (node) => {
    setSelectedItem(node)
    setShowModal(true)
  }

  const handleCleanupComplete = () => {
    fetchStats()
    fetchTreeData(1)
  }

  const handleAutoCleanup = async () => {
    if (!window.confirm('确定要执行自动清理吗？这将把所有重复文件替换为符号链接。')) {
      return
    }
    
    setAutoCleaning(true)
    try {
      const res = await axios.post(`${API_BASE}/cleanup/auto`, {
        min_copies: 2,
        min_size: 1024 * 1024
      })
      
      if (res.data.success) {
        alert(`自动清理完成！\n处理了 ${res.data.operations_count} 组重复文件\n共释放 ${formatSize(res.data.total_saved_space)} 空间`)
        handleCleanupComplete()
      } else {
        alert('自动清理失败: ' + res.data.error)
      }
    } catch (err) {
      console.error('Auto cleanup failed:', err)
      alert('自动清理失败: ' + err.message)
    } finally {
      setAutoCleaning(false)
    }
  }

  const handleLoadMore = useCallback(() => {
    if (pagination.page < pagination.pages && !loading) {
      fetchTreeData(pagination.page + 1, true)
    }
  }, [pagination.page, pagination.pages, loading])

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🔍 Dedup FS Explorer</h1>
        <div className="header-actions">
          {status.is_indexing ? (
            <button className="btn btn-danger" onClick={handleCancelIndexing}>
              取消索引
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleIndexFiles}>
              重新索引
            </button>
          )}
          <button 
            className="btn btn-success" 
            onClick={handleAutoCleanup}
            disabled={autoCleaning}
          >
            {autoCleaning ? '清理中...' : '🤖 自动清理'}
          </button>
          <button className="btn btn-secondary" onClick={() => fetchTreeData(1)}>
            刷新
          </button>
        </div>
      </header>

      <div className="toolbar-wrapper">
        <UndoRedoToolbar onOperationComplete={handleCleanupComplete} />
      </div>

      <StatusBar status={{ ...status, ...stats }} />

      <main className="app-main">
        <div className="tree-container">
          <div className="tree-header">
            <h2>去重文件视图</h2>
            <span className="tree-count">共 {pagination.total} 组重复文件</span>
          </div>
          
          {loading && treeData.length === 0 ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>正在加载文件索引...</p>
            </div>
          ) : (
            <>
              <TreeView 
                data={treeData} 
                onNodeClick={handleNodeClick}
              />
              
              {pagination.page < pagination.pages && (
                <div className="load-more" ref={loadMoreRef}>
                  <button 
                    className="btn btn-secondary"
                    onClick={handleLoadMore}
                    disabled={loading}
                  >
                    {loading ? '加载中...' : `加载更多 (${pagination.page}/${pagination.pages})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {showModal && selectedItem && (
        <DuplicateModal
          item={selectedItem}
          onClose={() => setShowModal(false)}
          onCleanupComplete={handleCleanupComplete}
        />
      )}

      {showProgress && (
        <ProgressModal
          progress={progress}
          onCancel={handleCancelIndexing}
        />
      )}
    </div>
  )
}

export default App
