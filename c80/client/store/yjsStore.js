import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'

const CHUNK_SIZE = 100
const VIEWPORT_MARGIN = 200

class YjsStore {
  constructor() {
    this.ydoc = null
    this.provider = null
    this.shapesMap = null
    this.shapesIndex = null
    this.history = null
    this.chunks = null
    this.commentsMap = null
    this.commentThreads = null
    this.listeners = new Set()
    this.dedupeCache = new Set()
    this.viewport = { x: 0, y: 0, width: 1920, height: 1080 }
    this.isInitialized = false
  }

  generateShapeId() {
    const clientId = this.ydoc?.clientID || Date.now()
    const clock = this.ydoc?.store?.state?.get(clientId)?.clock || Date.now()
    return `${clientId.toString(36)}-${clock.toString(36)}`
  }

  generateCommentId() {
    const clientId = this.ydoc?.clientID || Date.now()
    const clock = this.ydoc?.store?.state?.get(clientId)?.clock || Date.now()
    return `comment-${clientId.toString(36)}-${clock.toString(36)}`
  }

  init(roomId) {
    if (this.isInitialized) {
      console.warn('YjsStore already initialized')
      return this
    }

    this.ydoc = new Y.Doc()
    this.shapesMap = this.ydoc.getMap('shapes')
    this.shapesIndex = this.ydoc.getMap('shapesIndex')
    this.history = this.ydoc.getArray('history')
    this.chunks = this.ydoc.getMap('chunks')
    this.commentsMap = this.ydoc.getMap('comments')
    this.commentThreads = this.ydoc.getMap('commentThreads')
    
    this.provider = new WebrtcProvider(roomId, this.ydoc, {
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling.fly.dev'],
      maxConns: 20,
      filterBcConns: true
    })

    this.shapesMap.observe((event) => {
      event.keysChanged.forEach((key) => {
        this.dedupeCache.add(key)
      })
      
      if (this.dedupeCache.size > 1000) {
        this.cleanupDedupeCache()
      }
      
      this.notifyListeners()
    })
    
    this.commentsMap.observe(() => {
      this.notifyListeners()
    })
    
    this.commentThreads.observe(() => {
      this.notifyListeners()
    })
    
    this.history.observeDeep(() => {
      this.notifyListeners()
    })

    this.isInitialized = true
    return this
  }

  destroy() {
    if (this.provider) {
      this.provider.destroy()
    }
    if (this.ydoc) {
      this.ydoc.destroy()
    }
    this.listeners.clear()
    this.dedupeCache.clear()
    this.isInitialized = false
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notifyListeners() {
    const state = this.getState()
    this.listeners.forEach(listener => listener(state))
  }

  cleanupDedupeCache() {
    const currentIds = new Set(this.shapesMap.keys())
    for (const id of this.dedupeCache) {
      if (!currentIds.has(id)) {
        this.dedupeCache.delete(id)
      }
    }
  }

  setViewport(x, y, width, height) {
    this.viewport = { x, y, width, height }
    this.notifyListeners()
  }

  isShapeInViewport(shape) {
    const { x, y, width, height } = this.viewport
    const margin = VIEWPORT_MARGIN
    
    let shapeBounds
    switch (shape.type) {
      case 'rect':
        shapeBounds = {
          minX: shape.x - margin,
          minY: shape.y - margin,
          maxX: shape.x + shape.width + margin,
          maxY: shape.y + shape.height + margin
        }
        break
      case 'circle':
        shapeBounds = {
          minX: shape.cx - shape.r - margin,
          minY: shape.cy - shape.r - margin,
          maxX: shape.cx + shape.r + margin,
          maxY: shape.cy + shape.r + margin
        }
        break
      case 'path':
        if (shape.points && shape.points.length > 0) {
          const xs = shape.points.map(p => p.x)
          const ys = shape.points.map(p => p.y)
          shapeBounds = {
            minX: Math.min(...xs) - margin,
            minY: Math.min(...ys) - margin,
            maxX: Math.max(...xs) + margin,
            maxY: Math.max(...ys) + margin
          }
        } else {
          return true
        }
        break
      case 'text':
        shapeBounds = {
          minX: shape.x - margin,
          minY: shape.y - 50 - margin,
          maxX: shape.x + 200 + margin,
          maxY: shape.y + margin
        }
        break
      default:
        return true
    }
    
    return !(shapeBounds.maxX < x || shapeBounds.minX > x + width ||
             shapeBounds.maxY < y || shapeBounds.minY > y + height)
  }

  getState() {
    const allShapes = Array.from(this.shapesMap.values())
    const visibleShapes = allShapes.filter(shape => this.isShapeInViewport(shape))
    
    return {
      shapes: visibleShapes,
      allShapes,
      history: this.history?.toArray() || [],
      totalShapes: allShapes.length,
      visibleShapes: visibleShapes.length
    }
  }

  deduplicateShapes() {
    const seenIds = new Set()
    const duplicates = []
    
    this.shapesMap.forEach((shape, id) => {
      if (seenIds.has(id)) {
        duplicates.push(id)
      } else {
        seenIds.add(id)
      }
    })
    
    if (duplicates.length > 0) {
      console.warn(`Found ${duplicates.length} duplicate shapes, cleaning up`)
      duplicates.forEach(id => this.shapesMap.delete(id))
    }
    
    return duplicates.length
  }

  addShape(shape) {
    const id = this.generateShapeId()
    
    if (this.dedupeCache.has(id)) {
      console.warn('Shape ID already exists, regenerating')
      return this.addShape(shape)
    }
    
    const shapeWithId = {
      ...shape,
      id,
      timestamp: Date.now(),
      clientId: this.ydoc.clientID
    }
    
    this.shapesMap.set(id, shapeWithId)
    this.dedupeCache.add(id)
    
    this.updateSpatialIndex(shapeWithId)
    
    this.history.push([{
      type: 'add',
      shapeId: id,
      shape: shapeWithId,
      timestamp: Date.now()
    }])
    
    return shapeWithId
  }

  updateSpatialIndex(shape) {
    const chunkX = Math.floor((shape.x || shape.cx || 0) / 1000)
    const chunkY = Math.floor((shape.y || shape.cy || 0) / 1000)
    const chunkKey = `${chunkX},${chunkY}`
    
    let chunk = this.chunks.get(chunkKey)
    if (!chunk) {
      chunk = new Y.Array()
      this.chunks.set(chunkKey, chunk)
    }
    
    if (!chunk.toArray().includes(shape.id)) {
      chunk.push([shape.id])
    }
  }

  updateShape(id, updates) {
    const existingShape = this.shapesMap.get(id)
    if (!existingShape) {
      console.warn(`Shape ${id} not found for update`)
      return
    }
    
    const updatedShape = { ...existingShape, ...updates }
    this.shapesMap.set(id, updatedShape)
    
    this.updateSpatialIndex(updatedShape)
    
    this.history.push([{
      type: 'update',
      shapeId: id,
      updates,
      timestamp: Date.now()
    }])
    
    return updatedShape
  }

  deleteShape(id) {
    const shape = this.shapesMap.get(id)
    if (!shape) {
      return
    }
    
    this.shapesMap.delete(id)
    this.dedupeCache.delete(id)
    
    this.history.push([{
      type: 'delete',
      shape,
      timestamp: Date.now()
    }])
  }

  clearAll() {
    const allShapes = Array.from(this.shapesMap.values())
    const ids = Array.from(this.shapesMap.keys())
    
    ids.forEach(id => {
      this.shapesMap.delete(id)
      this.dedupeCache.delete(id)
    })
    
    this.history.push([{
      type: 'clear',
      shapes: allShapes,
      timestamp: Date.now()
    }])
  }

  getHistory() {
    return this.history?.toArray() || []
  }

  getShapes() {
    return Array.from(this.shapesMap.values())
  }

  getShapeById(id) {
    return this.shapesMap.get(id)
  }

  async loadShapesInViewport(viewport) {
    this.setViewport(viewport.x, viewport.y, viewport.width, viewport.height)
    return this.getState().shapes
  }

  async batchLoadShapes(shapeIds) {
    const results = []
    for (let i = 0; i < shapeIds.length; i += CHUNK_SIZE) {
      const chunk = shapeIds.slice(i, i + CHUNK_SIZE)
      chunk.forEach(id => {
        const shape = this.shapesMap.get(id)
        if (shape) {
          results.push(shape)
        }
      })
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    return results
  }

  getSyncProgress() {
    if (!this.provider) return 100
    
    const peers = this.provider.awareness.getStates().size
    const totalShapes = this.shapesMap?.size || 0
    
    return {
      peers,
      totalShapes,
      isSynced: peers > 0 || totalShapes > 0,
      estimatedProgress: Math.min(100, Math.floor((totalShapes / 1000) * 100))
    }
  }

  async waitForSync(timeout = 10000) {
    const startTime = Date.now()
    
    return new Promise((resolve, reject) => {
      const checkSync = () => {
        const progress = this.getSyncProgress()
        if (progress.isSynced || Date.now() - startTime > timeout) {
          resolve(progress)
        } else {
          setTimeout(checkSync, 100)
        }
      }
      checkSync()
    })
  }

  addComment(comment) {
    const id = this.generateCommentId()
    const commentWithMeta = {
      ...comment,
      id,
      timestamp: Date.now(),
      clientId: this.ydoc?.clientID || Date.now(),
      resolved: false,
      replies: []
    }
    
    this.commentsMap.set(id, commentWithMeta)
    return commentWithMeta
  }

  addReplyToComment(commentId, reply) {
    const comment = this.commentsMap.get(commentId)
    if (!comment) return null
    
    const replyId = this.generateCommentId()
    const replyWithMeta = {
      ...reply,
      id: replyId,
      timestamp: Date.now(),
      clientId: this.ydoc?.clientID || Date.now()
    }
    
    const updatedReplies = [...(comment.replies || []), replyWithMeta]
    this.commentsMap.set(commentId, {
      ...comment,
      replies: updatedReplies
    })
    
    return replyWithMeta
  }

  resolveComment(commentId, resolved = true) {
    const comment = this.commentsMap.get(commentId)
    if (!comment) return null
    
    this.commentsMap.set(commentId, {
      ...comment,
      resolved
    })
    
    return this.commentsMap.get(commentId)
  }

  deleteComment(commentId) {
    this.commentsMap.delete(commentId)
  }

  getComments() {
    return Array.from(this.commentsMap.values())
  }

  getCommentById(id) {
    return this.commentsMap.get(id)
  }

  getCommentsInViewport() {
    const comments = this.getComments()
    return comments.filter(comment => this.isShapeInViewport({
      type: 'point',
      x: comment.x,
      y: comment.y
    }))
  }

  async generateCommentSummary() {
    const comments = this.getComments()
    if (comments.length === 0) return { summary: '暂无评论' }

    const commentTexts = comments.map(c => {
      const replies = c.replies?.map(r => r.content).join('\n') || ''
      return `[${new Date(c.timestamp).toLocaleString()}] ${c.author || '匿名'}: ${c.content}\n${replies}`
    }).join('\n\n')

    const prompt = `请为以下白板评论生成一个简洁的摘要（不超过200字），总结主要讨论点和待办事项：\n\n${commentTexts}`

    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen2:0.5b',
          prompt: prompt,
          stream: false
        })
      })

      if (response.ok) {
        const data = await response.json()
        return {
          summary: data.response,
          totalComments: comments.length,
          resolvedCount: comments.filter(c => c.resolved).length
        }
      } else {
        throw new Error('LLM API not available')
      }
    } catch (error) {
      console.warn('Failed to generate summary, using fallback:', error)
      return {
        summary: `共 ${comments.length} 条评论，${comments.filter(c => c.resolved).length} 条已解决。`,
        totalComments: comments.length,
        resolvedCount: comments.filter(c => c.resolved).length,
        fallback: true
      }
    }
  }
}

export const yjsStore = new YjsStore()
