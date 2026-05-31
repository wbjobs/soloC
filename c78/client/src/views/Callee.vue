<template>
  <div class="callee-container">
    <div class="video-container">
      <video ref="remoteVideo" autoplay playsinline class="remote-video"></video>
      <canvas ref="annotationCanvas" class="annotation-canvas"></canvas>
      
      <div class="status-indicator">
        <span :class="{ connected: isConnected }">
          {{ isConnected ? '● 已连接' : '○ 未连接' }}
        </span>
      </div>

      <div class="timeline-controls" v-if="sessionId">
        <div class="control-buttons">
          <button @click="togglePlayback" class="play-btn">
            {{ isPlaying ? '⏸ 暂停' : '▶ 播放' }}
          </button>
          <button @click="resetTimeline" class="reset-btn">↺ 重置</button>
          <span class="time-display">
            {{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}
          </span>
        </div>
        <input 
          type="range" 
          class="timeline-slider"
          :min="0" 
          :max="totalDuration" 
          v-model="currentTime"
          @input="seekTimeline"
        />
        <div class="timeline-markers">
          <div 
            v-for="(anno, idx) in timelineAnnotations" 
            :key="idx"
            class="timeline-marker"
            :style="{ 
              left: ((anno.relativeTime || 0) * 100) + '%',
              backgroundColor: anno.instructorColor || '#ff4444'
            }"
            @click="jumpToAnnotation(idx)"
          ></div>
        </div>
      </div>
    </div>

    <div class="control-panel">
      <div v-if="!sessionId" class="join-session">
        <h3>加入会话</h3>
        <input 
          v-model="joinSessionId" 
          type="text" 
          placeholder="输入会话ID"
          class="session-input"
        />
        <button class="action-btn primary" @click="joinSession">加入会话</button>
      </div>
      
      <div v-else class="session-details">
        <h3>会话信息</h3>
        <p>会话ID: <span class="session-id">{{ sessionId }}</span></p>
        <p>标注总数: <span class="annotation-count">{{ allAnnotations.length }}</span></p>
        
        <div class="instructors-list">
          <h4>在线指导者:</h4>
          <div 
            v-for="inst in instructors" 
            :key="inst.socketId"
            class="instructor-item"
          >
            <span class="color-dot" :style="{ backgroundColor: inst.color }"></span>
            <span>{{ inst.name }}</span>
          </div>
        </div>

        <div class="annotation-history">
          <h4>标注历史</h4>
          <div class="annotation-list">
            <div 
              v-for="(anno, idx) in displayAnnotations.slice().reverse()" 
              :key="idx"
              class="annotation-item"
              :class="{ 'highlighted': idx === highlightedAnnotation }"
              @click="jumpToAnnotation(allAnnotations.indexOf(anno))"
            >
              <span class="anno-type" :style="{ color: anno.instructorColor || '#fff' }">
                {{ getAnnotationIcon(anno.type) }}
              </span>
              <span class="anno-text">{{ getAnnotationText(anno) }}</span>
              <span class="anno-time">{{ formatTime(anno.timestamp - sessionStart) }}</span>
            </div>
          </div>
        </div>
        
        <button class="action-btn danger" @click="hangUp">离开会话</button>
        <button class="action-btn screenshot-btn" @click="takeScreenshot">📸 保存截图</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import socketService from '../services/socket'

const remoteVideo = ref(null)
const annotationCanvas = ref(null)

const sessionId = ref('')
const joinSessionId = ref('')
const isConnected = ref(false)
const instructors = ref([])
const allAnnotations = ref([])
const sessionStart = ref(Date.now())
const currentTime = ref(0)
const isPlaying = ref(false)
const playbackRate = ref(1)
const highlightedAnnotation = ref(-1)

let canvasCtx = null
let animationFrameId = null
let playInterval = null

const displayAnnotations = computed(() => {
  if (!isPlaying.value) {
    return allAnnotations.value
  }
  return allAnnotations.value.filter(a => (a.timestamp - sessionStart.value) <= currentTime.value)
})

const timelineAnnotations = computed(() => {
  const duration = totalDuration.value
  if (duration === 0) return []
  
  return allAnnotations.value.map(anno => ({
    ...anno,
    relativeTime: (anno.timestamp - sessionStart.value) / duration
  }))
})

const totalDuration = computed(() => {
  if (allAnnotations.value.length === 0) return 0
  const lastTime = Math.max(...allAnnotations.value.map(a => a.timestamp))
  return Math.max(lastTime - sessionStart.value, 0)
})

const getAnnotationIcon = (type) => {
  const icons = {
    arrow: '➡️',
    circle: '⭕',
    point: '📍'
  }
  return icons[type] || '❓'
}

const getAnnotationText = (annotation) => {
  const types = {
    arrow: '箭头标注',
    circle: '圆形标注',
    point: '点标注'
  }
  return types[annotation.type] || '未知标注'
}

const formatTime = (ms) => {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

const joinSession = () => {
  if (joinSessionId.value.trim()) {
    socketService.emit('join-session', {
      sessionId: joinSessionId.value.trim(),
      isViewer: true
    })
  }
}

const hangUp = () => {
  stopPlayback()
  socketService.emit('hang-up', { sessionId: sessionId.value })
  sessionId.value = ''
  instructors.value = []
  allAnnotations.value = []
  isConnected.value = false
}

const takeScreenshot = async () => {
  if (!annotationCanvas.value || !remoteVideo.value) return
  
  const canvas = document.createElement('canvas')
  canvas.width = annotationCanvas.value.width
  canvas.height = annotationCanvas.value.height
  const ctx = canvas.getContext('2d')
  
  ctx.drawImage(remoteVideo.value, 0, 0, canvas.width, canvas.height)
  ctx.drawImage(annotationCanvas.value, 0, 0)
  
  canvas.toBlob(async (blob) => {
    const formData = new FormData()
    formData.append('screenshot', blob, 'screenshot.png')
    formData.append('sessionId', sessionId.value)
    formData.append('annotations', JSON.stringify(allAnnotations.value))
    
    try {
      await fetch('/api/screenshot', {
        method: 'POST',
        body: formData
      })
      alert('截图保存成功！')
    } catch (error) {
      console.error('Failed to save screenshot:', error)
      alert('截图保存失败')
    }
  }, 'image/png')
}

const togglePlayback = () => {
  if (isPlaying.value) {
    stopPlayback()
  } else {
    startPlayback()
  }
}

const startPlayback = () => {
  if (currentTime.value >= totalDuration.value) {
    currentTime.value = 0
  }
  isPlaying.value = true
  playInterval = setInterval(() => {
    currentTime.value += 100 * playbackRate.value
    if (currentTime.value >= totalDuration.value) {
      currentTime.value = totalDuration.value
      stopPlayback()
    }
  }, 100)
}

const stopPlayback = () => {
  isPlaying.value = false
  if (playInterval) {
    clearInterval(playInterval)
    playInterval = null
  }
}

const resetTimeline = () => {
  stopPlayback()
  currentTime.value = 0
}

const seekTimeline = (e) => {
  currentTime.value = parseInt(e.target.value)
}

const jumpToAnnotation = (idx) => {
  if (idx >= 0 && idx < allAnnotations.value.length) {
    highlightedAnnotation.value = idx
    const anno = allAnnotations.value[idx]
    currentTime.value = anno.timestamp - sessionStart.value
    
    setTimeout(() => {
      highlightedAnnotation.value = -1
    }, 1000)
  }
}

const drawAnnotation = (annotation) => {
  const color = annotation.instructorColor || annotation.color
  canvasCtx.save()
  
  if (annotation.type === 'arrow') {
    canvasCtx.strokeStyle = color
    canvasCtx.fillStyle = color
    canvasCtx.lineWidth = 4
    
    canvasCtx.translate(annotation.x, annotation.y)
    canvasCtx.rotate(annotation.angle || 0)
    
    const size = 60
    canvasCtx.beginPath()
    canvasCtx.moveTo(-size / 2, 0)
    canvasCtx.lineTo(size / 2, 0)
    canvasCtx.lineTo(size / 2 - 15, -12)
    canvasCtx.moveTo(size / 2, 0)
    canvasCtx.lineTo(size / 2 - 15, 12)
    canvasCtx.stroke()
  } else if (annotation.type === 'circle') {
    canvasCtx.strokeStyle = color
    canvasCtx.lineWidth = 4
    
    canvasCtx.beginPath()
    canvasCtx.arc(annotation.x, annotation.y, annotation.radius || 40, 0, Math.PI * 2)
    canvasCtx.stroke()
    
    canvasCtx.beginPath()
    canvasCtx.arc(annotation.x, annotation.y, 5, 0, Math.PI * 2)
    canvasCtx.fillStyle = color
    canvasCtx.fill()
  } else if (annotation.type === 'point') {
    canvasCtx.fillStyle = color
    
    canvasCtx.beginPath()
    canvasCtx.arc(annotation.x, annotation.y, 12, 0, Math.PI * 2)
    canvasCtx.fill()
    
    canvasCtx.beginPath()
    canvasCtx.arc(annotation.x, annotation.y, 6, 0, Math.PI * 2)
    canvasCtx.fillStyle = '#000'
    canvasCtx.fill()
  }
  
  canvasCtx.restore()
}

const draw = () => {
  if (!canvasCtx || !annotationCanvas.value) return
  
  canvasCtx.clearRect(0, 0, annotationCanvas.value.width, annotationCanvas.value.height)
  
  for (const annotation of displayAnnotations.value) {
    drawAnnotation(annotation)
  }
  
  animationFrameId = requestAnimationFrame(draw)
}

const setupSocketListeners = () => {
  socketService.on('session-joined', (data) => {
    sessionId.value = data.sessionId
    sessionStart.value = Date.now()
    instructors.value = data.instructors || []
    allAnnotations.value = data.annotations || []
    isConnected.value = true
    joinSessionId.value = ''
  })

  socketService.on('instructor-joined', (instructor) => {
    if (!instructors.value.find(i => i.socketId === instructor.socketId)) {
      instructors.value.push(instructor)
    }
  })

  socketService.on('instructor-left', (data) => {
    instructors.value = data.instructors || []
  })

  socketService.on('annotation-update', (annotation) => {
    allAnnotations.value.push(annotation)
    if (!isPlaying.value) {
      currentTime.value = annotation.timestamp - sessionStart.value
    }
  })

  socketService.on('hang-up', () => {
    sessionId.value = ''
    instructors.value = []
    allAnnotations.value = []
    isConnected.value = false
    stopPlayback()
  })

  socketService.on('error', (error) => {
    alert(error.message)
  })
}

onMounted(() => {
  socketService.connect()
  setupSocketListeners()
  
  if (annotationCanvas.value) {
    canvasCtx = annotationCanvas.value.getContext('2d')
    const resizeCanvas = () => {
      if (annotationCanvas.value) {
        annotationCanvas.value.width = annotationCanvas.value.offsetWidth
        annotationCanvas.value.height = annotationCanvas.value.offsetHeight
      }
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    draw()
  }
})

onUnmounted(() => {
  stopPlayback()
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  socketService.disconnect()
})
</script>

<style scoped>
.callee-container {
  width: 100%;
  height: 100vh;
  display: flex;
  background: #1a1a2e;
}

.video-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #000;
  display: flex;
  flex-direction: column;
}

.remote-video {
  flex: 1;
  width: 100%;
  object-fit: contain;
}

.annotation-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: calc(100% - 80px);
  pointer-events: none;
}

.status-indicator {
  position: absolute;
  top: 20px;
  right: 20px;
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 20px;
  color: #ff4444;
  font-weight: bold;
}

.status-indicator .connected {
  color: #00ff88;
}

.timeline-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.85);
  padding: 15px 20px;
  height: 80px;
}

.control-buttons {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 10px;
}

.play-btn, .reset-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  transition: all 0.2s ease;
}

.play-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.play-btn:hover {
  transform: scale(1.05);
}

.reset-btn {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.reset-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.time-display {
  color: white;
  font-family: monospace;
  font-size: 14px;
}

.timeline-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.2);
  outline: none;
  cursor: pointer;
}

.timeline-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.timeline-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.timeline-markers {
  position: relative;
  width: 100%;
  height: 20px;
  margin-top: 5px;
}

.timeline-marker {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.timeline-marker:hover {
  transform: translateY(-50%) scale(1.5);
}

.control-panel {
  width: 320px;
  background: #16213e;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.join-session h3,
.session-details h3 {
  color: white;
  margin-bottom: 15px;
  font-size: 1.2rem;
}

.session-details p {
  color: #a0a0a0;
  margin-bottom: 10px;
}

.session-id {
  color: #00d9ff;
  font-weight: bold;
  font-family: monospace;
}

.annotation-count {
  color: #00ff88;
  font-weight: bold;
}

.instructors-list,
.annotation-history {
  background: rgba(255, 255, 255, 0.05);
  padding: 15px;
  border-radius: 10px;
  margin: 10px 0;
}

.instructors-list h4,
.annotation-history h4 {
  color: white;
  margin-bottom: 10px;
  font-size: 0.95rem;
}

.instructor-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  color: white;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.instructor-item:last-child {
  border-bottom: none;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.annotation-list {
  max-height: 300px;
  overflow-y: auto;
}

.annotation-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
}

.annotation-item:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(5px);
}

.annotation-item.highlighted {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.2);
}

.anno-type {
  font-size: 1.2rem;
}

.anno-text {
  flex: 1;
  color: white;
  font-size: 0.9rem;
}

.anno-time {
  color: #888;
  font-size: 0.8rem;
  font-family: monospace;
}

.action-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: bold;
  transition: all 0.3s ease;
  width: 100%;
  margin-bottom: 10px;
}

.primary {
  background: linear-gradient(135deg, #00d9ff, #0099cc);
  color: white;
}

.danger {
  background: linear-gradient(135deg, #ff4444, #cc0000);
  color: white;
}

.screenshot-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.action-btn:hover {
  transform: scale(1.02);
}

.session-input {
  width: 100%;
  padding: 12px;
  border: 2px solid #333;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1rem;
  margin-bottom: 10px;
  box-sizing: border-box;
}

.session-input:focus {
  outline: none;
  border-color: #00d9ff;
}
</style>
