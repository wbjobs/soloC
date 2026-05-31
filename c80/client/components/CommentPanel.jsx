import React, { useState, useEffect, useRef } from 'react'
import VoiceRecorder from './VoiceRecorder'

function CommentPanel({ comments, onAddComment, onAddReply, onResolve, onDelete, onClose, selectedComment, onGenerateSummary }) {
  const [newComment, setNewComment] = useState('')
  const [author, setAuthor] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [voiceData, setVoiceData] = useState(null)
  const [replyText, setReplyText] = useState({})
  const [summary, setSummary] = useState(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    const savedAuthor = localStorage.getItem('whiteboard_author')
    if (savedAuthor) {
      setAuthor(savedAuthor)
    }
  }, [])

  const handleAddComment = () => {
    if (!newComment.trim() && !voiceData) return
    
    const comment = {
      x: window.commentPosition?.x || Math.random() * 500 + 100,
      y: window.commentPosition?.y || Math.random() * 300 + 100,
      content: newComment,
      author: author || '匿名用户',
      type: voiceData ? 'voice' : 'text',
      voiceData: voiceData
    }
    
    onAddComment(comment)
    setNewComment('')
    setVoiceData(null)
    window.commentPosition = null
    
    if (author) {
      localStorage.setItem('whiteboard_author', author)
    }
  }

  const handleAddReply = (commentId) => {
    if (!replyText[commentId]?.trim()) return
    
    onAddReply(commentId, {
      content: replyText[commentId],
      author: author || '匿名用户'
    })
    
    setReplyText(prev => ({ ...prev, [commentId]: '' }))
  }

  const handleVoiceRecorded = (audioData) => {
    setVoiceData(audioData)
  }

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true)
    try {
      const result = await onGenerateSummary()
      setSummary(result)
    } catch (error) {
      console.error('Failed to generate summary:', error)
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const playVoice = (voiceData) => {
    const audio = new Audio(voiceData)
    audio.play()
  }

  const filteredComments = comments.filter(c => showResolved || !c.resolved)
  const resolvedCount = comments.filter(c => c.resolved).length

  return (
    <div className="comment-panel" style={{
      position: 'fixed',
      right: '20px',
      top: '80px',
      width: '380px',
      maxHeight: '600px',
      background: '#1a1a2e',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      zIndex: 1000
    }}>
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>
          💬 评论 ({comments.length})
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '20px',
            padding: '4px 8px'
          }}
        >
          ✕
        </button>
      </div>

      {comments.length > 0 && (
        <div style={{
          padding: '12px 16px',
          background: '#252542',
          borderBottom: '1px solid #333'
        }}>
          <button
            onClick={handleGenerateSummary}
            disabled={isGeneratingSummary}
            style={{
              width: '100%',
              padding: '10px',
              background: '#4a6cf7',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isGeneratingSummary ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {isGeneratingSummary ? '🤖 生成中...' : '✨ AI 生成评论摘要'}
          </button>
          
          {summary && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              background: summary.fallback ? '#3d3d5c' : '#2d4a7c',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#ddd',
              lineHeight: '1.5'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>📊 摘要</span>
                <span style={{ color: '#888' }}>
                  {summary.totalComments} 条 · {summary.resolvedCount} 已解决
                </span>
              </div>
              {summary.summary}
            </div>
          )}
        </div>
      )}

      <div style={{
        padding: '16px',
        borderBottom: '1px solid #333'
      }}>
        <div style={{ marginBottom: '10px' }}>
          <input
            type="text"
            placeholder="你的名字"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#252542',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <textarea
            ref={textareaRef}
            placeholder="添加评论..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAddComment())}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: '#252542',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '14px',
              resize: 'none',
              minHeight: '60px'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <VoiceRecorder onVoiceRecorded={handleVoiceRecorded} />
          {voiceData && (
            <span style={{ color: '#4ade80', fontSize: '12px' }}>✓ 已录制语音</span>
          )}
          <button
            onClick={handleAddComment}
            disabled={!newComment.trim() && !voiceData}
            style={{
              marginLeft: 'auto',
              padding: '8px 20px',
              background: '#4a6cf7',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (!newComment.trim() && !voiceData) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            发布
          </button>
        </div>
      </div>

      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #333'
      }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#aaa',
          fontSize: '13px',
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          显示已解决 ({resolvedCount})
        </label>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px'
      }}>
        {filteredComments.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#666'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💭</div>
            <div>暂无评论</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              点击工具栏的评论按钮，然后点击白板添加
            </div>
          </div>
        ) : (
          filteredComments.map(comment => (
            <div
              key={comment.id}
              style={{
                marginBottom: '12px',
                padding: '12px',
                background: comment.resolved ? '#2a3a2a' : '#252542',
                borderRadius: '8px',
                border: selectedComment === comment.id ? '2px solid #4a6cf7' : 'none'
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '8px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#4a6cf7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {(comment.author || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>
                      {comment.author || '匿名'}
                    </div>
                    <div style={{ color: '#666', fontSize: '11px' }}>
                      {formatTime(comment.timestamp)}
                      {comment.type === 'voice' && <span style={{ marginLeft: '6px' }}>🎤</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => onResolve(comment.id, !comment.resolved)}
                    style={{
                      padding: '4px 8px',
                      background: comment.resolved ? '#4ade80' : '#3d3d5c',
                      border: 'none',
                      borderRadius: '4px',
                      color: comment.resolved ? '#fff' : '#aaa',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    {comment.resolved ? '✓ 已解决' : '解决'}
                  </button>
                  <button
                    onClick={() => onDelete(comment.id)}
                    style={{
                      padding: '4px 8px',
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {comment.type === 'voice' && comment.voiceData ? (
                <div style={{
                  padding: '10px',
                  background: '#1a1a2e',
                  borderRadius: '6px',
                  marginBottom: '8px'
                }}>
                  <button
                    onClick={() => playVoice(comment.voiceData)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: '#4a6cf7',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    ▶️ 播放语音评论
                  </button>
                  {comment.content && (
                    <div style={{ marginTop: '8px', color: '#aaa', fontSize: '13px' }}>
                      {comment.content}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  color: '#ddd',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  marginBottom: '8px'
                }}>
                  {comment.content}
                </div>
              )}

              <div style={{
                borderTop: '1px solid #333',
                paddingTop: '10px',
                marginTop: '8px'
              }}>
                {comment.replies?.map(reply => (
                  <div key={reply.id} style={{
                    padding: '8px',
                    background: '#1a1a2e',
                    borderRadius: '6px',
                    marginBottom: '6px',
                    marginLeft: '20px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#4a6cf7', fontSize: '12px', fontWeight: '500' }}>
                        {reply.author || '匿名'}
                      </span>
                      <span style={{ color: '#666', fontSize: '11px' }}>
                        {formatTime(reply.timestamp)}
                      </span>
                    </div>
                    <div style={{ color: '#ccc', fontSize: '13px' }}>
                      {reply.content}
                    </div>
                  </div>
                ))}
                
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <input
                    type="text"
                    placeholder="回复..."
                    value={replyText[comment.id] || ''}
                    onChange={(e) => setReplyText(prev => ({
                      ...prev,
                      [comment.id]: e.target.value
                    }))}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddReply(comment.id)}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      background: '#1a1a2e',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '13px'
                    }}
                  />
                  <button
                    onClick={() => handleAddReply(comment.id)}
                    disabled={!replyText[comment.id]?.trim()}
                    style={{
                      padding: '6px 12px',
                      background: '#4a6cf7',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'white',
                      cursor: !replyText[comment.id]?.trim() ? 'not-allowed' : 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    回复
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default CommentPanel
