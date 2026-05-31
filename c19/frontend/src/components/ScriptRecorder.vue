<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { Script, ScriptFrame, ScriptPlayerState, ScriptRecorderState, JoystickData } from '../types'

const props = defineProps<{
  isJoystickActive: boolean
}>()

const emit = defineEmits<{
  (e: 'play-frame', frame: JoystickData): void
}>()

const recorderState = ref<ScriptRecorderState>('idle')
const playerState = ref<ScriptPlayerState>('idle')

const recordedFrames = ref<ScriptFrame[]>([])
const recordingStartTime = ref<number>(0)
const selectedScriptId = ref<string | null>(null)

const savedScripts = ref<Script[]>(() => {
  const saved = localStorage.getItem('robot_scripts')
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch {
      return []
    }
  }
  return []
})

watch(savedScripts, (scripts) => {
  localStorage.setItem('robot_scripts', JSON.stringify(scripts))
}, { deep: true })

let playInterval: ReturnType<typeof setInterval> | null = null
let currentFrameIndex = 0
let playStartTime = 0

const selectedScript = computed(() => {
  return savedScripts.value.find(s => s.id === selectedScriptId.value) || null
})

const recordingDuration = computed(() => {
  if (recorderState.value === 'recording') {
    return (Date.now() - recordingStartTime.value) / 1000
  }
  return recordedFrames.value.length > 0 
    ? (recordedFrames.value[recordedFrames.value.length - 1].timestamp - recordedFrames.value[0].timestamp) / 1000
    : 0
})

const currentPlaybackPosition = computed(() => {
  if (playerState.value === 'playing' && selectedScript.value) {
    return (Date.now() - playStartTime) / 1000
  }
  return 0
})

const currentPlaybackProgress = computed(() => {
  if (!selectedScript.value || selectedScript.value.duration === 0) return 0
  return Math.min(100, (currentPlaybackPosition.value / selectedScript.value.duration) * 100)
})

const lastJoystickX = ref(0)
const lastJoystickY = ref(0)

const updateJoystickValue = (x: number, y: number) => {
  lastJoystickX.value = x
  lastJoystickY.value = y
}

const startRecording = () => {
  if (playerState.value !== 'idle') {
    stopPlaying()
  }
  
  recordedFrames.value = []
  recordingStartTime.value = Date.now()
  recorderState.value = 'recording'
  
  const recordFrame = () => {
    if (recorderState.value !== 'recording') return
    
    recordedFrames.value.push({
      timestamp: Date.now() - recordingStartTime.value,
      joystick: {
        x: lastJoystickX.value,
        y: lastJoystickY.value
      }
    })
    
    setTimeout(recordFrame, 50)
  }
  recordFrame()
}

const stopRecording = () => {
  recorderState.value = 'idle'
}

const saveScript = () => {
  if (recordedFrames.value.length < 10) {
    alert('录制时间太短，请录制至少1秒')
    return
  }
  
  const name = prompt('输入脚本名称:', `脚本 ${new Date().toLocaleString()}`)
  if (!name) return
  
  const script: Script = {
    id: `script_${Date.now()}`,
    name,
    createdAt: Date.now(),
    frames: [...recordedFrames.value],
    duration: (recordedFrames.value[recordedFrames.value.length - 1].timestamp - recordedFrames.value[0].timestamp) / 1000
  }
  
  savedScripts.value.unshift(script)
  selectedScriptId.value = script.id
  recordedFrames.value = []
}

const discardRecording = () => {
  recordedFrames.value = []
}

const playScript = () => {
  if (!selectedScript.value || selectedScript.value.frames.length === 0) return
  if (recorderState.value === 'recording') {
    stopRecording()
  }
  
  currentFrameIndex = 0
  playStartTime = Date.now()
  playerState.value = 'playing'
  
  const playNextFrame = () => {
    if (playerState.value !== 'playing') return
    if (!selectedScript.value) return
    
    const currentTime = Date.now() - playStartTime
    
    while (
      currentFrameIndex < selectedScript.value.frames.length &&
      selectedScript.value.frames[currentFrameIndex].timestamp <= currentTime
    ) {
      const frame = selectedScript.value.frames[currentFrameIndex]
      emit('play-frame', frame.joystick)
      currentFrameIndex++
    }
    
    if (currentFrameIndex >= selectedScript.value.frames.length) {
      stopPlaying()
      emit('play-frame', { x: 0, y: 0 })
    } else {
      playInterval = setTimeout(playNextFrame, 10) as any
    }
  }
  
  playNextFrame()
}

const pausePlaying = () => {
  if (playInterval) {
    clearTimeout(playInterval)
    playInterval = null
  }
  playerState.value = 'paused'
}

const resumePlaying = () => {
  if (!selectedScript.value) return
  playerState.value = 'playing'
  
  const remainingFrames = selectedScript.value.frames.slice(currentFrameIndex)
  const pauseTimeOffset = Date.now() - (playStartTime + selectedScript.value.frames[currentFrameIndex]?.timestamp || 0)
  playStartTime = pauseTimeOffset
  
  const playNextFrame = () => {
    if (playerState.value !== 'playing') return
    if (!selectedScript.value) return
    
    const currentTime = Date.now() - playStartTime
    
    while (
      currentFrameIndex < selectedScript.value.frames.length &&
      selectedScript.value.frames[currentFrameIndex].timestamp <= currentTime
    ) {
      const frame = selectedScript.value.frames[currentFrameIndex]
      emit('play-frame', frame.joystick)
      currentFrameIndex++
    }
    
    if (currentFrameIndex >= selectedScript.value.frames.length) {
      stopPlaying()
      emit('play-frame', { x: 0, y: 0 })
    } else {
      playInterval = setTimeout(playNextFrame, 10) as any
    }
  }
  
  playNextFrame()
}

const stopPlaying = () => {
  if (playInterval) {
    clearTimeout(playInterval)
    playInterval = null
  }
  playerState.value = 'idle'
  currentFrameIndex = 0
}

const deleteScript = (id: string) => {
  if (!confirm('确定要删除此脚本吗？')) return
  savedScripts.value = savedScripts.value.filter(s => s.id !== id)
  if (selectedScriptId.value === id) {
    selectedScriptId.value = null
    stopPlaying()
  }
}

const exportScript = (script: Script) => {
  const blob = new Blob([JSON.stringify(script, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${script.name}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString()
}

onUnmounted(() => {
  if (playInterval) {
    clearTimeout(playInterval)
  }
})

defineExpose({
  updateJoystickValue
})
</script>

<template>
  <div class="card">
    <h3 class="card-title">📼 脚本录制</h3>
    
    <div class="tabs">
      <button 
        class="tab-btn" 
        :class="{ active: recordedFrames.length > 0 || recorderState === 'recording' }"
      >
        录制
      </button>
      <button 
        class="tab-btn"
        :class="{ active: recordedFrames.length === 0 && recorderState === 'idle' }"
      >
        已保存
      </button>
    </div>
    
    <div v-if="recorderState === 'recording' || recordedFrames.length > 0" class="recording-panel">
      <div class="recording-status">
        <div class="recording-indicator" :class="{ recording: recorderState === 'recording' }">
          <span class="dot"></span>
          <span>{{ recorderState === 'recording' ? '录制中' : '已录制' }}</span>
        </div>
        <div class="duration">{{ formatDuration(recordingDuration) }}</div>
        <div class="frame-count">{{ recordedFrames.length }} 帧</div>
      </div>
      
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${Math.min(100, recordingDuration * 10)}%` }"></div>
      </div>
      
      <div class="action-buttons">
        <button 
          v-if="recorderState === 'recording'"
          class="btn btn-danger"
          @click="stopRecording"
        >
          ⏹️ 停止录制
        </button>
        
        <template v-else>
          <button 
            class="btn btn-primary"
            @click="saveScript"
            :disabled="recordedFrames.length < 10"
          >
            💾 保存
          </button>
          <button 
            class="btn btn-secondary"
            @click="discardRecording"
          >
            🗑️ 丢弃
          </button>
          <button 
            class="btn"
            @click="startRecording"
          >
            🔴 重新录制
          </button>
        </template>
      </div>
      
      <button 
        v-if="recorderState === 'idle' && recordedFrames.length === 0"
        class="btn btn-record"
        @click="startRecording"
      >
        🔴 开始录制
        <small>操作摇杆会被录制</small>
      </button>
    </div>
    
    <div v-else class="saved-scripts-panel">
      <div v-if="savedScripts.length === 0" class="empty-scripts">
        <div class="empty-icon">📼</div>
        <p>暂无保存的脚本</p>
        <p class="hint">使用摇杆操作时点击"开始录制"来记录运动轨迹</p>
      </div>
      
      <div v-else class="scripts-list">
        <div 
          v-for="script in savedScripts" 
          :key="script.id"
          class="script-item"
          :class="{ selected: selectedScriptId === script.id }"
          @click="selectedScriptId = script.id"
        >
          <div class="script-info">
            <div class="script-name">{{ script.name }}</div>
            <div class="script-meta">
              <span>⏱️ {{ formatDuration(script.duration) }}</span>
              <span>📊 {{ script.frames.length }}帧</span>
            </div>
            <div class="script-date">{{ formatDate(script.createdAt) }}</div>
          </div>
          
          <div class="script-actions">
            <button 
              v-if="playerState === 'idle'"
              class="icon-btn"
              title="播放"
              @click.stop="playScript"
            >
              ▶️
            </button>
            <button 
              v-else-if="selectedScriptId === script.id && playerState === 'playing'"
              class="icon-btn"
              title="暂停"
              @click.stop="pausePlaying"
            >
              ⏸️
            </button>
            <button 
              v-else-if="selectedScriptId === script.id && playerState === 'paused'"
              class="icon-btn"
              title="继续"
              @click.stop="resumePlaying"
            >
              ▶️
            </button>
            <button 
              v-if="playerState !== 'idle' && selectedScriptId === script.id"
              class="icon-btn"
              title="停止"
              @click.stop="stopPlaying"
            >
              ⏹️
            </button>
            <button 
              class="icon-btn"
              title="导出"
              @click.stop="exportScript(script)"
            >
              📤
            </button>
            <button 
              class="icon-btn delete"
              title="删除"
              @click.stop="deleteScript(script.id)"
            >
              🗑️
            </button>
          </div>
          
          <div 
            v-if="selectedScriptId === script.id && playerState !== 'idle'" 
            class="playback-progress"
          >
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: `${currentPlaybackProgress}%` }"></div>
            </div>
            <div class="progress-text">
              {{ formatDuration(currentPlaybackPosition) }} / {{ formatDuration(script.duration) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tab-btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: var(--bg-dark);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
}

.tab-btn.active {
  background: var(--primary-color);
  color: white;
}

.recording-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recording-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}

.recording-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.recording-indicator.recording {
  color: var(--danger-color);
}

.recording-indicator .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-secondary);
}

.recording-indicator.recording .dot {
  background: var(--danger-color);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.duration {
  font-family: monospace;
  font-size: 18px;
  font-weight: bold;
  color: var(--text-primary);
}

.frame-count {
  color: var(--text-secondary);
  font-size: 12px;
}

.progress-bar {
  height: 4px;
  background: var(--bg-dark);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary-color);
  transition: width 0.1s;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  background: var(--bg-dark);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn:hover:not(:disabled) {
  background: var(--bg-card-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-dark);
}

.btn-danger {
  background: var(--danger-color);
  color: white;
}

.btn-secondary {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.btn-record {
  background: linear-gradient(135deg, var(--danger-color), #f97316);
  color: white;
  padding: 16px;
  font-size: 16px;
  font-weight: bold;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.btn-record small {
  font-size: 12px;
  font-weight: normal;
  opacity: 0.8;
}

.saved-scripts-panel {
  max-height: 400px;
  overflow-y: auto;
}

.empty-scripts {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-scripts .hint {
  font-size: 12px;
  margin-top: 8px;
  opacity: 0.7;
}

.scripts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.script-item {
  background: var(--bg-dark);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.script-item:hover {
  background: var(--bg-card-hover);
}

.script-item.selected {
  border-color: var(--primary-color);
}

.script-info {
  margin-bottom: 8px;
}

.script-name {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.script-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.script-date {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.7;
  margin-top: 4px;
}

.script-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.icon-btn {
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  background: var(--bg-card);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: var(--bg-card-hover);
}

.icon-btn.delete:hover {
  background: var(--danger-color);
}

.playback-progress {
  margin-top: 12px;
}

.progress-text {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  font-family: monospace;
}
</style>
