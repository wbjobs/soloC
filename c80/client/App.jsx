import React, { useState, useEffect, useRef, useCallback } from 'react'
import Lobby from './components/Lobby'
import Whiteboard from './components/Whiteboard'
import Toolbar from './components/Toolbar'
import HistoryPanel from './components/HistoryPanel'
import CommentPanel from './components/CommentPanel'
import { yjsStore } from './store/yjsStore'

function App() {
  const [roomId, setRoomId] = useState(null)
  const [shapes, setShapes] = useState([])
  const [allShapes, setAllShapes] = useState([])
  const [comments, setComments] = useState([])
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [showHistory, setShowHistory] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [syncProgress, setSyncProgress] = useState({ isSynced: false, totalShapes: 0 })
  const [isLoading, setIsLoading] = useState(false)
  const [commentMode, setCommentMode] = useState(false)
  const isInitialized = useRef(false)

  useEffect(() => {
    if (roomId && !isInitialized.current) {
      isInitialized.current = true
      setIsLoading(true)
      
      yjsStore.init(roomId)
      
      yjsStore.waitForSync(15000).then((progress) => {
        setSyncProgress(progress)
        setIsLoading(false)
      })
      
      const unsubscribe = yjsStore.subscribe((state) => {
        setShapes(state.shapes)
        setAllShapes(state.allShapes || state.shapes)
        setComments(yjsStore.getComments())
        setSyncProgress(yjsStore.getSyncProgress())
      })

      const interval = setInterval(() => {
        setSyncProgress(yjsStore.getSyncProgress())
      }, 500)

      return () => {
        unsubscribe()
        clearInterval(interval)
        yjsStore.destroy()
        isInitialized.current = false
      }
    }
  }, [roomId])

  const handleViewportChange = useCallback((viewport) => {
    yjsStore.setViewport(viewport.x, viewport.y, viewport.width, viewport.height)
  }, [])

  const handleCreateRoom = async () => {
    try {
      const response = await fetch('/api/room/create')
      const data = await response.json()
      if (data.success) {
        setRoomId(data.cid)
      }
    } catch (error) {
      console.error('Failed to create room:', error)
      const fallbackId = 'whiteboard-' + Date.now()
      setRoomId(fallbackId)
    }
  }

  const handleJoinRoom = (cid) => {
    setRoomId(cid)
  }

  const handleExportSVG = () => {
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svgElement.setAttribute('width', '1920')
    svgElement.setAttribute('height', '1080')
    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    allShapes.forEach(shape => {
      let element
      switch (shape.type) {
        case 'rect':
          element = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
          element.setAttribute('x', shape.x)
          element.setAttribute('y', shape.y)
          element.setAttribute('width', shape.width)
          element.setAttribute('height', shape.height)
          element.setAttribute('fill', 'none')
          element.setAttribute('stroke', shape.color)
          element.setAttribute('stroke-width', shape.strokeWidth)
          break
        case 'circle':
          element = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
          element.setAttribute('cx', shape.cx)
          element.setAttribute('cy', shape.cy)
          element.setAttribute('r', shape.r)
          element.setAttribute('fill', 'none')
          element.setAttribute('stroke', shape.color)
          element.setAttribute('stroke-width', shape.strokeWidth)
          break
        case 'path':
          element = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          const d = shape.points.reduce((acc, point, i) => {
            return acc + (i === 0 ? `M ${point.x} ${point.y}` : ` L ${point.x} ${point.y}`)
          }, '')
          element.setAttribute('d', d)
          element.setAttribute('fill', 'none')
          element.setAttribute('stroke', shape.color)
          element.setAttribute('stroke-width', shape.strokeWidth)
          element.setAttribute('stroke-linecap', 'round')
          element.setAttribute('stroke-linejoin', 'round')
          break
        case 'text':
          element = document.createElementNS('http://www.w3.org/2000/svg', 'text')
          element.setAttribute('x', shape.x)
          element.setAttribute('y', shape.y)
          element.setAttribute('fill', shape.color)
          element.setAttribute('font-size', shape.fontSize || 16)
          element.textContent = shape.text
          break
      }
      if (element) {
        svgElement.appendChild(element)
      }
    })

    const svgString = new XMLSerializer().serializeToString(svgElement)
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `whiteboard-${Date.now()}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDedupe = () => {
    const count = yjsStore.deduplicateShapes()
    alert(`Removed ${count} duplicate shapes`)
  }

  const handleAddComment = (comment) => {
    yjsStore.addComment(comment)
  }

  const handleAddReply = (commentId, reply) => {
    yjsStore.addReplyToComment(commentId, reply)
  }

  const handleResolveComment = (commentId, resolved) => {
    yjsStore.resolveComment(commentId, resolved)
  }

  const handleDeleteComment = (commentId) => {
    yjsStore.deleteComment(commentId)
  }

  const handleGenerateSummary = async () => {
    return await yjsStore.generateCommentSummary()
  }

  const handleToggleCommentMode = () => {
    setCommentMode(!commentMode)
    setShowComments(true)
  }

  if (!roomId) {
    return (
      <Lobby 
        onCreateRoom={handleCreateRoom} 
        onJoinRoom={handleJoinRoom}
      />
    )
  }

  return (
    <div className="app">
      {isLoading && (
        <div className="loading-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          color: 'white'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '20px' }}>⏳ Syncing Whiteboard...</div>
          <div style={{ width: '300px', height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${syncProgress.estimatedProgress || 50}%`,
              height: '100%',
              background: '#4a6cf7',
              transition: 'width 0.3s'
            }} />
          </div>
          <div style={{ marginTop: '10px', fontSize: '14px', color: '#aaa' }}>
            Loaded {syncProgress.totalShapes || 0} shapes | {syncProgress.peers || 0} peers connected
          </div>
        </div>
      )}

      <Toolbar
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        onToolChange={setTool}
        onColorChange={setColor}
        onStrokeWidthChange={setStrokeWidth}
        onExportSVG={handleExportSVG}
        onToggleHistory={() => setShowHistory(!showHistory)}
        onToggleComments={() => setShowComments(!showComments)}
        onToggleCommentMode={handleToggleCommentMode}
        onClearAll={() => yjsStore.clearAll()}
        onDedupe={handleDedupe}
        roomId={roomId}
        syncStatus={syncProgress}
        commentCount={comments.length}
        commentMode={commentMode}
      />
      
      <div className="whiteboard-container">
        <Whiteboard
          shapes={shapes}
          allShapes={allShapes}
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          onAddShape={(shape) => yjsStore.addShape(shape)}
          onViewportChange={handleViewportChange}
          historyIndex={historyIndex}
          comments={comments}
          commentMode={commentMode}
          onCommentClick={(comment) => {}}
        />
      </div>

      {showHistory && (
        <HistoryPanel
          history={yjsStore.getHistory()}
          historyIndex={historyIndex}
          onHistoryIndexChange={setHistoryIndex}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showComments && (
        <CommentPanel
          comments={comments}
          onAddComment={handleAddComment}
          onAddReply={handleAddReply}
          onResolve={handleResolveComment}
          onDelete={handleDeleteComment}
          onGenerateSummary={handleGenerateSummary}
          onClose={() => {
            setShowComments(false)
            setCommentMode(false)
          }}
        />
      )}
    </div>
  )
}

export default App
