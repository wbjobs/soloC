import React from 'react'

function Toolbar({
  tool,
  color,
  strokeWidth,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onExportSVG,
  onToggleHistory,
  onToggleComments,
  onToggleCommentMode,
  onClearAll,
  onDedupe,
  roomId,
  syncStatus,
  commentCount,
  commentMode
}) {
  const tools = [
    { id: 'pen', icon: '✏️', label: '画笔' },
    { id: 'rect', icon: '⬜', label: '矩形' },
    { id: 'circle', icon: '⭕', label: '圆形' },
    { id: 'text', icon: '📝', label: '文本' },
    { id: 'eraser', icon: '🧹', label: '橡皮擦' }
  ]

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId)
    alert('Room CID 已复制到剪贴板！')
  }

  return (
    <div className="toolbar">
      <div className="tool-group">
        {tools.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => onToolChange(t.id)}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="tool-group">
        <input
          type="color"
          className="color-picker"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
        />
        <input
          type="number"
          className="stroke-width"
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          min="1"
          max="20"
          title="线条粗细"
        />
      </div>

      <div className="tool-group">
        <button className="tool-btn" onClick={onExportSVG} title="导出 SVG">
          💾
        </button>
        <button className="tool-btn" onClick={onToggleHistory} title="历史记录">
          📜
        </button>
        <button 
          className={`tool-btn ${commentMode ? 'active' : ''}`} 
          onClick={onToggleCommentMode} 
          title="添加评论锚点"
        >
          💬
          {commentCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              background: '#4a6cf7',
              color: 'white',
              fontSize: '10px',
              padding: '2px 5px',
              borderRadius: '10px'
            }}>
              {commentCount}
            </span>
          )}
        </button>
        <button className="tool-btn" onClick={onClearAll} title="清空画布">
          🗑️
        </button>
        <button className="tool-btn" onClick={onDedupe} title="清理重复对象">
          🔍
        </button>
      </div>

      <div className="room-controls">
        {syncStatus && (
          <div className="room-info" style={{ marginRight: '12px' }}>
            <span style={{ 
              color: syncStatus.isSynced ? '#4ade80' : '#fbbf24',
              marginRight: '8px'
            }}>
              {syncStatus.isSynced ? '✓' : '⏳'}
            </span>
            <span>{syncStatus.totalShapes || 0} 图形</span>
            <span style={{ marginLeft: '8px' }}>
              {syncStatus.peers || 0} 连接
            </span>
          </div>
        )}
        <div className="room-info">
          <span>Room CID:</span>
          <span style={{ fontFamily: 'monospace' }}>{roomId.slice(0, 20)}...</span>
          <button 
            className="btn btn-secondary" 
            style={{ height: '28px', padding: '0 12px', fontSize: '12px' }}
            onClick={copyRoomId}
          >
            复制
          </button>
        </div>
      </div>
    </div>
  )
}

export default Toolbar
