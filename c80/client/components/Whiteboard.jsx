import React, { useRef, useState, useEffect, useCallback } from 'react'

function Whiteboard({ 
  shapes, 
  allShapes, 
  tool, 
  color, 
  strokeWidth, 
  onAddShape, 
  onViewportChange, 
  historyIndex,
  comments,
  commentMode,
  onCommentClick
}) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [startPos, setStartPos] = useState(null)
  const [currentPath, setCurrentPath] = useState([])
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 })
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const lastPanPos = useRef(null)

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        setDimensions({ width, height: height - 80 })
      }
    }
    window.addEventListener('resize', handleResize)
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (onViewportChange) {
      onViewportChange({
        x: -panOffset.x / zoom,
        y: -panOffset.y / zoom,
        width: dimensions.width / zoom,
        height: dimensions.height / zoom
      })
    }
  }, [panOffset, zoom, dimensions, onViewportChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    ctx.save()
    ctx.translate(panOffset.x, panOffset.y)
    ctx.scale(zoom, zoom)
    
    const displayShapes = historyIndex >= 0 
      ? (allShapes || shapes).slice(0, historyIndex + 1)
      : shapes

    displayShapes.forEach(shape => {
      drawShape(ctx, shape)
    })

    comments.forEach(comment => {
      drawCommentMarker(ctx, comment)
    })
    
    ctx.restore()
  }, [shapes, allShapes, comments, historyIndex, dimensions, panOffset, zoom])

  const drawShape = (ctx, shape) => {
    ctx.strokeStyle = shape.color
    ctx.lineWidth = shape.strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    switch (shape.type) {
      case 'rect':
        ctx.beginPath()
        ctx.strokeRect(shape.x, shape.y, shape.width, shape.height)
        break
      case 'circle':
        ctx.beginPath()
        ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2)
        ctx.stroke()
        break
      case 'path':
        if (shape.points && shape.points.length > 1) {
          ctx.beginPath()
          ctx.moveTo(shape.points[0].x, shape.points[0].y)
          for (let i = 1; i < shape.points.length; i++) {
            ctx.lineTo(shape.points[i].x, shape.points[i].y)
          }
          ctx.stroke()
        }
        break
      case 'text':
        ctx.fillStyle = shape.color
        ctx.font = `${shape.fontSize || 16}px sans-serif`
        ctx.fillText(shape.text, shape.x, shape.y)
        break
    }
  }

  const drawCommentMarker = (ctx, comment) => {
    const x = comment.x
    const y = comment.y
    
    ctx.save()
    
    ctx.beginPath()
    ctx.fillStyle = comment.resolved ? '#4ade80' : '#4a6cf7'
    ctx.arc(x, y, 12, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(comment.author?.[0]?.toUpperCase() || '?', x, y)
    
    if (comment.replies?.length > 0) {
      ctx.beginPath()
      ctx.fillStyle = '#fbbf24'
      ctx.arc(x + 10, y - 10, 8, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.fillStyle = '#000'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText(comment.replies.length.toString(), x + 10, y - 10)
    }
    
    ctx.restore()
  }

  const screenToWorld = (x, y) => ({
    x: (x - panOffset.x) / zoom,
    y: (y - panOffset.y) / zoom
  })

  const worldToScreen = (x, y) => ({
    x: x * zoom + panOffset.x,
    y: y * zoom + panOffset.y
  })

  const getMousePos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
  }

  const handleMouseDown = (e) => {
    if (historyIndex >= 0) return
    
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      lastPanPos.current = { x: e.clientX, y: e.clientY }
      return
    }

    if (commentMode && e.button === 0) {
      const pos = getMousePos(e)
      window.commentPosition = pos
      onCommentClick && onCommentClick({ x: pos.x, y: pos.y })
      return
    }

    const pos = getMousePos(e)
    setIsDrawing(true)
    setStartPos(pos)

    if (tool === 'pen' || tool === 'eraser') {
      setCurrentPath([pos])
    }

    if (tool === 'text') {
      const text = prompt('输入文本:')
      if (text) {
        onAddShape({
          type: 'text',
          x: pos.x,
          y: pos.y,
          text,
          color,
          strokeWidth,
          fontSize: 16
        })
      }
    }
  }

  const handleMouseMove = (e) => {
    if (isPanning && lastPanPos.current) {
      const dx = e.clientX - lastPanPos.current.x
      const dy = e.clientY - lastPanPos.current.y
      setPanOffset(prev => ({
        x: prev.x + dx,
        y: prev.y + dy
      }))
      lastPanPos.current = { x: e.clientX, y: e.clientY }
      return
    }

    if (!isDrawing || historyIndex >= 0) return

    const pos = getMousePos(e)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    ctx.save()
    ctx.translate(panOffset.x, panOffset.y)
    ctx.scale(zoom, zoom)

    if (tool === 'pen' || tool === 'eraser') {
      setCurrentPath(prev => [...prev, pos])
      
      if (currentPath.length > 0) {
        ctx.strokeStyle = tool === 'eraser' ? '#f8f9fa' : color
        ctx.lineWidth = tool === 'eraser' ? strokeWidth * 5 : strokeWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(currentPath[currentPath.length - 1].x, currentPath[currentPath.length - 1].y)
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false)
      lastPanPos.current = null
      return
    }

    if (!isDrawing || historyIndex >= 0) return
    setIsDrawing(false)

    if ((tool === 'pen' || tool === 'eraser') && currentPath.length > 1) {
      onAddShape({
        type: 'path',
        points: currentPath,
        color: tool === 'eraser' ? '#f8f9fa' : color,
        strokeWidth: tool === 'eraser' ? strokeWidth * 5 : strokeWidth
      })
      setCurrentPath([])
    } else if (tool === 'rect' && startPos) {
      onAddShape({
        type: 'rect',
        x: startPos.x,
        y: startPos.y,
        width: 100,
        height: 80,
        color,
        strokeWidth
      })
    } else if (tool === 'circle' && startPos) {
      onAddShape({
        type: 'circle',
        cx: startPos.x + 40,
        cy: startPos.y + 40,
        r: 40,
        color,
        strokeWidth
      })
    }
    setStartPos(null)
  }

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(5, zoom * delta))
    
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      const worldX = (mouseX - panOffset.x) / zoom
      const worldY = (mouseY - panOffset.y) / zoom
      
      setPanOffset({
        x: mouseX - worldX * newZoom,
        y: mouseY - worldY * newZoom
      })
    }
    
    setZoom(newZoom)
  }, [zoom, panOffset])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false })
      return () => canvas.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  const resetView = () => {
    setPanOffset({ x: 0, y: 0 })
    setZoom(1)
  }

  return (
    <div ref={containerRef} className="whiteboard-container" style={{ position: 'relative' }}>
      {commentMode && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 16px',
          background: '#4a6cf7',
          color: 'white',
          borderRadius: '8px',
          fontSize: '14px',
          zIndex: 100,
          pointerEvents: 'none'
        }}>
          评论模式 - 点击白板任意位置添加评论锚点
        </div>
      )}

      <div className="zoom-controls" style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        gap: '8px',
        zIndex: 100
      }}>
        <button 
          onClick={() => setZoom(z => Math.min(5, z * 1.2))}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: 'none',
            background: '#1a1a2e',
            color: 'white',
            cursor: 'pointer',
            fontSize: '18px'
          }}
        >+</button>
        <button 
          onClick={() => setZoom(z => Math.max(0.1, z * 0.8))}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: 'none',
            background: '#1a1a2e',
            color: 'white',
            cursor: 'pointer',
            fontSize: '18px'
          }}
        >-</button>
        <button 
          onClick={resetView}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: 'none',
            background: '#1a1a2e',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >⌂</button>
        <div style={{
          padding: '0 12px',
          background: '#1a1a2e',
          color: 'white',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          fontSize: '14px'
        }}>
          {Math.round(zoom * 100)}%
        </div>
      </div>

      <div className="pan-hint" style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        padding: '8px 12px',
        background: 'rgba(26, 26, 46, 0.8)',
        color: '#aaa',
        borderRadius: '8px',
        fontSize: '12px'
      }}>
        Alt + 拖拽 或 中键拖拽平移 • 滚轮缩放
      </div>

      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="whiteboard"
        style={{
          cursor: commentMode ? 'crosshair' : (isPanning ? 'grabbing' : tool === 'text' ? 'text' : 'crosshair')
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  )
}

export default Whiteboard
