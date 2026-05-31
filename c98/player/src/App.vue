<template>
  <div class="app-container">
    <header class="app-header">
      <h1>终端会话回放播放器</h1>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="loadRecording">
          打开录制文件
        </button>
        <button class="btn btn-secondary" @click="loadFromServer">
          从服务器加载
        </button>
        <button v-if="recording" class="btn btn-secondary" @click="showAnnotationPanel = !showAnnotationPanel">
          注释
        </button>
        <button v-if="recording" class="btn btn-secondary" @click="showTrimPanel = !showTrimPanel">
          裁剪
        </button>
        <button v-if="recording" class="btn btn-secondary" @click="togglePermissions">
          {{ isPublic ? '公开' : '私有' }}
        </button>
      </div>
    </header>

    <div class="main-content">
      <div v-if="isLoading" class="loading-panel">
        <div class="loading-spinner"></div>
        <p>正在加载录制文件...</p>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: loadProgress + '%' }"></div>
        </div>
        <p class="progress-text">{{ loadProgress }}%</p>
      </div>

      <div v-if="!recording && !isLoading" class="empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v10zm-8-1h2v-4h3l-4-4-4 4h3v4z"/>
        </svg>
        <p>请选择一个终端录制文件开始回放</p>
        <button class="btn btn-primary" @click="loadRecording">
          选择文件
        </button>
      </div>

      <div v-if="recording" class="terminal-container">
        <div class="terminal-header">
          <span class="dot dot-red"></span>
          <span class="dot dot-yellow"></span>
          <span class="dot dot-green"></span>
          <span class="terminal-title">{{ recording.header.shell }} - 终端回放</span>
        </div>
        <div class="terminal-body" ref="terminalRef"></div>
        
        <div v-if="currentAnnotations.length > 0" class="annotation-overlay">
          <div 
            v-for="(ann, index) in currentAnnotations" 
            :key="index"
            class="annotation-bubble"
          >
            <span class="annotation-text">{{ ann.text }}</span>
            <button class="close-btn" @click="deleteAnnotation(ann.id)">×</button>
          </div>
        </div>
      </div>

      <div v-if="recording" class="controls-panel">
        <div class="playback-controls">
          <button class="control-btn" @click="restartPlayback" title="重新开始">
            ⏮
          </button>
          <button class="control-btn" @click="stepBackward" title="后退">
            ⏪
          </button>
          <button class="control-btn" :class="{ active: isPlaying }" @click="togglePlayback" :title="isPlaying ? '暂停' : '播放'">
            {{ isPlaying ? '⏸' : '▶' }}
          </button>
          <button class="control-btn" @click="stepForward" title="前进">
            ⏩
          </button>
          <button class="control-btn" @click="stopPlayback" title="停止">
            ⏹
          </button>
          <div class="speed-control">
            <label>速度:</label>
            <select v-model="playbackSpeed" @change="updateSpeed">
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="4">4x</option>
              <option value="8">8x</option>
            </select>
          </div>
          <div class="time-display">
            {{ formatTime(currentTime) }} / {{ formatTime(recording.header.duration) }}
          </div>
        </div>
        <div class="progress-container">
          <div class="progress-bar" @click="seekTo">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
            <div 
              v-for="ann in annotations" 
              :key="ann.id"
              class="annotation-marker"
              :style="{ left: (ann.timestamp / recording.header.duration * 100) + '%' }"
              @click.stop="jumpToTimestamp(ann.timestamp)"
              :title="ann.text"
            ></div>
          </div>
        </div>
      </div>

      <div v-if="recording" class="info-panel">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ formatDate(recording.header.created_at) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Shell</span>
            <span class="info-value">{{ recording.header.shell }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">终端大小</span>
            <span class="info-value">{{ recording.header.cols }}x{{ recording.header.rows }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">事件数量</span>
            <span class="info-value">{{ recording.header.event_count }}</span>
          </div>
        </div>
      </div>

      <div v-if="showAnnotationPanel && recording" class="annotation-panel">
        <h3>注释管理</h3>
        <div class="annotation-input">
          <input 
            type="text" 
            v-model="newAnnotationText" 
            placeholder="在当前时间点添加注释..."
            @keyup.enter="addAnnotation"
          >
          <button class="btn btn-primary" @click="addAnnotation">添加</button>
        </div>
        <div class="annotation-list">
          <div 
            v-for="(ann, index) in annotations" 
            :key="index"
            class="annotation-item"
            @click="jumpToTimestamp(ann.timestamp)"
          >
            <span class="annotation-time">{{ formatTime(ann.timestamp) }}</span>
            <span class="annotation-content">{{ ann.text }}</span>
            <button class="delete-btn" @click.stop="deleteAnnotation(ann.id)">删除</button>
          </div>
          <div v-if="annotations.length === 0" class="empty-annotations">
            暂无注释
          </div>
        </div>
      </div>

      <div v-if="showTrimPanel && recording" class="trim-panel">
        <h3>录制裁剪</h3>
        <div class="trim-controls">
          <div class="trim-input">
            <label>开始时间: {{ formatTime(trimStartTime) }}</label>
            <button class="btn btn-secondary" @click="setTrimStartTime">设为当前时间</button>
          </div>
          <div class="trim-input">
            <label>结束时间: {{ formatTime(trimEndTime) }}</label>
            <button class="btn btn-secondary" @click="setTrimEndTime">设为当前时间</button>
          </div>
          <button class="btn btn-primary trim-btn" @click="trimRecording">开始裁剪</button>
        </div>
      </div>

      <div v-if="recording" class="search-panel">
        <input 
          type="text" 
          class="search-input" 
          placeholder="搜索命令或输出内容..." 
          v-model="searchQuery"
          @input="performSearch"
        >
        <div v-if="searchResults.length > 0" class="search-results">
          <div 
            v-for="(result, index) in searchResults" 
            :key="index"
            class="search-result-item"
            @click="jumpToTimestamp(result.timestamp)"
          >
            <span class="result-time">{{ formatTime(result.timestamp) }}</span>
            <div class="result-text">{{ result.text.substring(0, 100) }}...</div>
          </div>
        </div>
      </div>

      <div v-if="recording && commands.length > 0" class="command-list">
        <h3>命令列表</h3>
        <div 
          v-for="(cmd, index) in commands" 
          :key="index"
          class="command-item"
          @click="jumpToTimestamp(cmd.timestamp)"
        >
          <span class="command-text">{{ cmd.text }}</span>
          <span class="command-time">{{ formatTime(cmd.timestamp) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { invoke } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog'
import { readBinaryFile } from '@tauri-apps/api/fs'
import 'xterm/css/xterm.css'

const terminalRef = ref(null)
const recording = ref(null)
const terminal = ref(null)
const fitAddon = ref(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const currentEventIndex = ref(0)
const playbackSpeed = ref(1)
const searchQuery = ref('')
const searchResults = ref([])
const playbackInterval = ref(null)
const lastFrameTime = ref(0)
const animationFrameId = ref(null)

const isLoading = ref(false)
const loadProgress = ref(0)
const annotations = ref([])
const showAnnotationPanel = ref(false)
const showTrimPanel = ref(false)
const trimStartTime = ref(0)
const trimEndTime = ref(0)
const newAnnotationText = ref('')
const recordingId = ref('')
const isPublic = ref(false)
const serverUrl = ref('http://localhost:8080')

const progressPercent = computed(() => {
  if (!recording.value) return 0
  return (currentTime.value / recording.value.header.duration) * 100
})

const commands = computed(() => {
  if (!recording.value) return []
  return recording.value.events
    .filter(e => e.event_type.type === 'CommandStart' && e.data)
    .map(e => ({ timestamp: e.timestamp, text: e.data }))
})

const currentAnnotations = computed(() => {
  return annotations.value.filter(a => 
    Math.abs(a.timestamp - currentTime.value) < 0.5
  )
})

onMounted(() => {
  initTerminal()
})

onUnmounted(() => {
  if (playbackInterval.value) {
    clearInterval(playbackInterval.value)
  }
  if (terminal.value) {
    terminal.value.dispose()
  }
})

function initTerminal() {
  terminal.value = new Terminal({
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 14,
    theme: {
      background: '#0d0d0d',
      foreground: '#ffffff',
      cursor: '#e94560',
    },
    convertEol: true,
  })
  
  fitAddon.value = new FitAddon()
  terminal.value.loadAddon(fitAddon.value)
  
  terminal.value.open(terminalRef.value)
  fitAddon.value.fit()
}

async function loadRecording() {
  const selected = await open({
    filters: [{ name: '终端录制文件', extensions: ['tr'] }],
    multiple: false,
  })

  if (selected) {
    const data = await readBinaryFile(selected)
    await parseRecording(data)
  }
}

async function loadFromServer() {
  try {
    const id = prompt('请输入录制ID:')
    if (id) {
      await streamLoadRecording(id)
    }
  } catch (e) {
    alert('从服务器加载失败: ' + e)
  }
}

async function streamLoadRecording(id) {
  isLoading.value = true
  loadProgress.value = 0
  recordingId.value = id

  try {
    const headerResponse = await fetch(`${serverUrl.value}/api/header/${id}`)
    if (!headerResponse.ok) {
      throw new Error('获取元数据失败')
    }
    const headerData = await headerResponse.json()
    isPublic.value = headerData.is_public
    annotations.value = headerData.annotations || []

    const totalSize = headerData.size
    const chunkSize = 1024 * 256
    let loadedSize = 0
    let allChunks = []

    while (loadedSize < totalSize) {
      const end = Math.min(loadedSize + chunkSize - 1, totalSize - 1)
      const response = await fetch(`${serverUrl.value}/api/download-stream/${id}`, {
        headers: { 'Range': `bytes=${loadedSize}-${end}` }
      })
      
      if (!response.ok) {
        throw new Error('下载分片失败')
      }

      const chunk = await response.arrayBuffer()
      allChunks.push(new Uint8Array(chunk))
      loadedSize = end + 1
      loadProgress.value = Math.round((loadedSize / totalSize) * 100)

      if (loadedSize >= 1024 * 100 && !recording.value) {
        const partialData = concatenateChunks(allChunks)
        try {
          const decompressed = await invoke('decompress_data', { data: Array.from(partialData) })
          const jsonStr = new TextDecoder().decode(new Uint8Array(decompressed))
          const partialRecording = JSON.parse(jsonStr)
          
          if (partialRecording.header && partialRecording.events) {
            recording.value = {
              header: partialRecording.header,
              events: partialRecording.events.slice(0, Math.min(100, partialRecording.events.length))
            }
            resetPlayback()
          }
        } catch (e) {
        }
      }
    }

    const fullData = concatenateChunks(allChunks)
    await parseRecording(fullData)
    isLoading.value = false
  } catch (e) {
    isLoading.value = false
    throw e
  }
}

function concatenateChunks(chunks) {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

async function parseRecording(data) {
  try {
    const decompressed = await invoke('decompress_data', { data: Array.from(data) })
    const jsonStr = new TextDecoder().decode(new Uint8Array(decompressed))
    recording.value = JSON.parse(jsonStr)
    
    resetPlayback()
    extractCommands()
  } catch (e) {
    alert('解析录制文件失败: ' + e)
  }
}

function resetPlayback() {
  if (playbackInterval.value) {
    clearTimeout(playbackInterval.value)
    playbackInterval.value = null
  }
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value)
    animationFrameId.value = null
  }
  
  if (terminal.value) {
    terminal.value.reset()
    terminal.value.clear()
    if (recording.value) {
      terminal.value.resize(recording.value.header.cols, recording.value.header.rows)
    }
  }
  
  currentTime.value = 0
  currentEventIndex.value = 0
  isPlaying.value = false
  lastFrameTime.value = 0
}

function togglePlayback() {
  if (isPlaying.value) {
    pausePlayback()
  } else {
    startPlayback()
  }
}

function startPlayback() {
  if (currentEventIndex.value >= recording.value.events.length) {
    resetPlayback()
  }
  
  isPlaying.value = true
  lastFrameTime.value = performance.now()
  runPlaybackLoop()
}

function pausePlayback() {
  isPlaying.value = false
  if (playbackInterval.value) {
    clearTimeout(playbackInterval.value)
    playbackInterval.value = null
  }
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value)
    animationFrameId.value = null
  }
}

function stopPlayback() {
  pausePlayback()
  resetPlayback()
}

function runPlaybackLoop() {
  if (!isPlaying.value || !recording.value) return
  
  const now = performance.now()
  const deltaTime = (now - lastFrameTime.value) / 1000 * playbackSpeed.value
  lastFrameTime.value = now
  
  const targetTime = currentTime.value + deltaTime
  const events = recording.value.events
  
  while (currentEventIndex.value < events.length) {
    const event = events[currentEventIndex.value]
    
    if (event.timestamp > targetTime) {
      currentTime.value = targetTime
      break
    }
    
    processEvent(event)
    currentTime.value = event.timestamp
    currentEventIndex.value++
  }
  
  if (currentEventIndex.value >= events.length) {
    isPlaying.value = false
    return
  }
  
  animationFrameId.value = requestAnimationFrame(runPlaybackLoop)
}

function processEvent(event) {
  if (!terminal.value) return
  
  switch (event.event_type.type) {
    case 'Output':
    case 'Input':
      terminal.value.write(event.data)
      break
    case 'Resize':
      terminal.value.resize(event.event_type.cols, event.event_type.rows)
      break
  }
}

function restartPlayback() {
  resetPlayback()
  startPlayback()
}

function stepForward() {
  if (currentEventIndex.value < recording.value.events.length - 1) {
    pausePlayback()
    currentEventIndex.value++
    const event = recording.value.events[currentEventIndex.value]
    currentTime.value = event.timestamp
    processEvent(event)
  }
}

function stepBackward() {
  if (currentEventIndex.value > 0) {
    pausePlayback()
    currentEventIndex.value--
    
    terminal.value.reset()
    terminal.value.clear()
    terminal.value.resize(recording.value.header.cols, recording.value.header.rows)
    
    for (let i = 0; i <= currentEventIndex.value; i++) {
      processEvent(recording.value.events[i])
    }
    
    if (currentEventIndex.value > 0) {
      currentTime.value = recording.value.events[currentEventIndex.value].timestamp
    } else {
      currentTime.value = 0
    }
  }
}

function seekTo(event) {
  const rect = event.target.getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  const targetTime = percent * recording.value.header.duration
  
  jumpToTimestamp(targetTime)
}

function jumpToTimestamp(timestamp) {
  pausePlayback()
  
  terminal.value.reset()
  terminal.value.clear()
  
  const cols = recording.value.header.cols
  const rows = recording.value.header.rows
  terminal.value.resize(cols, rows)
  
  currentTime.value = 0
  currentEventIndex.value = 0
  
  const events = recording.value.events
  while (currentEventIndex.value < events.length && events[currentEventIndex.value].timestamp <= timestamp) {
    processEvent(events[currentEventIndex.value])
    currentTime.value = events[currentEventIndex.value].timestamp
    currentEventIndex.value++
  }
  
  lastFrameTime.value = performance.now()
}

function updateSpeed() {
  lastFrameTime.value = performance.now()
}

function extractCommands() {
}

function performSearch() {
  if (!searchQuery.value || !recording.value) {
    searchResults.value = []
    return
  }
  
  const query = searchQuery.value.toLowerCase()
  const results = []
  
  for (const event of recording.value.events) {
    if (event.data && event.data.toLowerCase().includes(query)) {
      results.push({
        timestamp: event.timestamp,
        text: event.data,
        type: event.event_type.type,
      })
    }
  }
  
  searchResults.value = results.slice(0, 20)
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}

async function addAnnotation() {
  if (!newAnnotationText.value.trim() || !recordingId.value) return

  try {
    const response = await fetch(`${serverUrl.value}/api/recordings/${recordingId.value}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: currentTime.value,
        text: newAnnotationText.value
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      annotations.value.push(result.annotation)
      newAnnotationText.value = ''
      alert('注释添加成功')
    }
  } catch (e) {
    alert('添加注释失败: ' + e)
  }
}

async function deleteAnnotation(annotationId) {
  if (!recordingId.value) return

  try {
    const response = await fetch(`${serverUrl.value}/api/recordings/${recordingId.value}/annotations/${annotationId}`, {
      method: 'DELETE'
    })
    
    if (response.ok) {
      annotations.value = annotations.value.filter(a => a.id !== annotationId)
      alert('注释删除成功')
    }
  } catch (e) {
    alert('删除注释失败: ' + e)
  }
}

function setTrimStartTime() {
  trimStartTime.value = currentTime.value
}

function setTrimEndTime() {
  trimEndTime.value = currentTime.value
}

async function trimRecording() {
  if (!recordingId.value) return

  if (trimEndTime.value <= trimStartTime.value) {
    alert('结束时间必须大于开始时间')
    return
  }

  try {
    const response = await fetch(`${serverUrl.value}/api/recordings/${recordingId.value}/trim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_time: trimStartTime.value,
        end_time: trimEndTime.value
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      alert(`裁剪成功！新录制ID: ${result.trimmed_id}`)
      recordingId.value = result.trimmed_id
      showTrimPanel.value = false
    }
  } catch (e) {
    alert('裁剪失败: ' + e)
  }
}

async function togglePermissions() {
  if (!recordingId.value) return

  try {
    const response = await fetch(`${serverUrl.value}/api/recordings/${recordingId.value}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: !isPublic.value })
    })
    
    if (response.ok) {
      isPublic.value = !isPublic.value
      alert(`权限设置成功: ${isPublic.value ? '公开' : '私有'}`)
    }
  } catch (e) {
    alert('权限设置失败: ' + e)
  }
}
</script>
