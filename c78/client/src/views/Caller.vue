<template>
  <div class="caller-container">
    <div class="video-container">
      <video ref="localVideo" autoplay playsinline muted class="local-video"></video>
      <canvas ref="arCanvas" class="ar-canvas"></canvas>
      
      <div class="instructors-indicator">
        <div 
          v-for="inst in instructors" 
          :key="inst.socketId"
          class="instructor-badge"
          :style="{ borderColor: inst.color }"
        >
          <span class="color-dot" :style="{ backgroundColor: inst.color }"></span>
          {{ inst.name }}
        </div>
      </div>
      
      <div class="annotation-panel">
        <button 
          v-for="tool in annotationTools" 
          :key="tool.type"
          class="tool-btn"
          :class="{ active: currentTool === tool.type }"
          :style="{ borderColor: myColor }"
          @click="selectTool(tool.type)"
        >
          {{ tool.icon }} {{ tool.name }}
        </button>
        <button class="tool-btn clear-btn" @click="clearMyAnnotations">🗑️ 清除</button>
        <button class="tool-btn screenshot-btn" @click="takeScreenshot">📸 截图</button>
      </div>
    </div>

    <div class="control-panel">
      <div v-if="!sessionId" class="identity-select">
        <h3>选择身份</h3>
        <input 
          v-model="instructorName" 
          type="text" 
          placeholder="输入你的名称"
          class="session-input"
        />
        <button class="action-btn primary" @click="createSession">创建会话（作为指导者）</button>
        
        <div class="divider">或</div>
        
        <input 
          v-model="joinSessionId" 
          type="text" 
          placeholder="输入会话ID"
          class="session-input"
        />
        <button class="action-btn secondary" @click="joinSession">加入会话（作为指导者）</button>
      </div>
      
      <div v-else class="session-details">
        <h3>会话信息</h3>
        <p>会话ID: <span class="session-id">{{ sessionId }}</span></p>
        <p>我的颜色: <span class="color-dot-large" :style="{ backgroundColor: myColor }"></span></p>
        <p>在线指导者: <span class="instructor-count">{{ instructors.length }}/3</span></p>
        <p>我的标注数: <span class="annotation-count">{{ myAnnotations.length }}</span></p>
        
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
        
        <button class="action-btn danger" @click="hangUp">离开会话</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import socketService from '../services/socket'
import webRTCService from '../services/webrtc'
import { ARController } from '../services/ar'

const router = useRouter()
const localVideo = ref(null)
const arCanvas = ref(null)

const sessionId = ref('')
const joinSessionId = ref('')
const instructorName = ref('')
const myColor = ref('#ff4444')
const myInstructorId = ref('')
const instructors = ref([])
const myAnnotations = ref([])
const otherAnnotations = ref([])

const currentTool = ref('arrow')

let arController = null

const annotationTools = [
  { type: 'arrow', name: '箭头', icon: '➡️' },
  { type: 'circle', name: '圆圈', icon: '⭕' },
  { type: 'point', name: '点', icon: '📍' }
]

const selectTool = (tool) => {
  currentTool.value = tool
  if (arController) {
    arController.setCurrentTool(tool)
    arController.setCurrentColor(myColor.value)
  }
}

const createSession = () => {
  socketService.emit('create-session', {
    isInstructor: true,
    instructorName: instructorName.value || '指导者1'
  })
}

const joinSession = () => {
  if (joinSessionId.value.trim()) {
    socketService.emit('join-session', {
      sessionId: joinSessionId.value.trim(),
      isInstructor: true,
      instructorName: instructorName.value || '指导者'
    })
  }
}

const hangUp = () => {
  socketService.emit('hang-up', { sessionId: sessionId.value })
  cleanup()
}

const clearMyAnnotations = () => {
  myAnnotations.value = []
  socketService.emit('clear-annotations', {
    sessionId: sessionId.value,
    instructorId: myInstructorId.value
  })
  if (arController) {
    arController.clearAnnotations()
  }
}

const cleanup = () => {
  webRTCService.close()
  sessionId.value = ''
  instructors.value = []
  myAnnotations.value = []
  otherAnnotations.value = []
}

const takeScreenshot = async () => {
  if (!arCanvas.value) return
  
  const canvas = document.createElement('canvas')
  canvas.width = arCanvas.value.width
  canvas.height = arCanvas.value.height
  const ctx = canvas.getContext('2d')
  
  ctx.drawImage(localVideo.value, 0, 0, canvas.width, canvas.height)
  ctx.drawImage(arCanvas.value, 0, 0)
  
  canvas.toBlob(async (blob) => {
    const formData = new FormData()
    formData.append('screenshot', blob, 'screenshot.png')
    formData.append('sessionId', sessionId.value)
    formData.append('annotations', JSON.stringify([...myAnnotations.value, ...otherAnnotations.value]))
    
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

const setupSocketListeners = () => {
  socketService.on('session-created', (data) => {
    sessionId.value = data.sessionId
    myColor.value = data.color.color
    myInstructorId.value = data.instructorId
    instructors.value = [{
      socketId: data.instructorId,
      name: instructorName.value || '指导者1',
      color: data.color.color
    }]
  })

  socketService.on('session-joined', (data) => {
    sessionId.value = data.sessionId
    myColor.value = data.color.color
    myInstructorId.value = data.instructorId
    instructors.value = data.instructors || []
  })

  socketService.on('instructor-joined', (instructor) => {
    if (!instructors.value.find(i => i.socketId === instructor.socketId)) {
      instructors.value.push(instructor)
    }
  })

  socketService.on('instructor-left', (data) => {
    instructors.value = data.instructors || []
    otherAnnotations.value = otherAnnotations.value.filter(
      a => a.instructorId !== data.instructorId
    )
  })

  socketService.on('annotation-update', (annotation) => {
    if (annotation.instructorId !== myInstructorId.value) {
      otherAnnotations.value.push(annotation)
      if (arController) {
        arController.addExternalAnnotation(annotation)
      }
    }
  })

  socketService.on('instructor-cleared', ({ instructorId }) => {
    otherAnnotations.value = otherAnnotations.value.filter(
      a => a.instructorId !== instructorId
    )
    if (arController) {
      arController.clearInstructorAnnotations(instructorId)
    }
  })

  socketService.on('hang-up', () => {
    cleanup()
  })

  socketService.on('error', (error) => {
    alert(error.message)
  })
}

onMounted(async () => {
  socketService.connect()
  setupSocketListeners()
  
  try {
    const stream = await webRTCService.initialize()
    if (localVideo.value) {
      localVideo.value.srcObject = stream
    }
    
    if (arCanvas.value) {
      arController = new ARController(arCanvas.value, localVideo.value)
      arController.setCurrentColor(myColor.value)
      arController.onAnnotation = (annotation) => {
        const annoWithId = {
          ...annotation,
          instructorId: myInstructorId.value,
          instructorColor: myColor.value
        }
        myAnnotations.value.push(annoWithId)
        socketService.emit('annotation-update', {
          sessionId: sessionId.value,
          annotation,
          instructorId: myInstructorId.value
        })
      }
      arController.start()
    }
  } catch (error) {
    console.error('Failed to initialize:', error)
    alert('无法访问摄像头，请检查权限设置')
  }
})

onUnmounted(() => {
  if (arController) {
    arController.stop()
  }
  cleanup()
  socketService.disconnect()
})
</script>

<style scoped>
.caller-container {
  width: 100%;
  height: 100vh;
  display: flex;
  background: #1a1a2e;
}

.video-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.local-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ar-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
}

.instructors-indicator {
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.instructor-badge {
  background: rgba(0, 0, 0, 0.7);
  padding: 8px 12px;
  border-radius: 20px;
  border-left: 3px solid;
  color: white;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.color-dot-large {
  display: inline-block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  vertical-align: middle;
}

.annotation-panel {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  background: rgba(0, 0, 0, 0.7);
  padding: 15px;
  border-radius: 15px;
  flex-wrap: wrap;
  justify-content: center;
}

.tool-btn {
  padding: 12px 20px;
  border: none;
  border-left: 3px solid transparent;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 1rem;
}

.tool-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.tool-btn.active {
  background: linear-gradient(135deg, #e94560, #ff6b6b);
}

.clear-btn {
  background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
}

.screenshot-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
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

.identity-select h3,
.session-details h3 {
  color: white;
  margin-bottom: 15px;
  font-size: 1.2rem;
}

.divider {
  color: #666;
  text-align: center;
  padding: 15px 0;
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

.instructor-count,
.annotation-count {
  color: #00ff88;
  font-weight: bold;
}

.instructors-list {
  background: rgba(255, 255, 255, 0.05);
  padding: 15px;
  border-radius: 10px;
  margin: 10px 0;
}

.instructors-list h4 {
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
  background: linear-gradient(135deg, #e94560, #ff6b6b);
  color: white;
}

.secondary {
  background: linear-gradient(135deg, #00d9ff, #0099cc);
  color: white;
}

.danger {
  background: linear-gradient(135deg, #ff4444, #cc0000);
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
