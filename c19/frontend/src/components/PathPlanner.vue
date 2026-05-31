<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { PathStatus, Waypoint, RobotStatus } from '../types'

const props = defineProps<{
  pathStatus: PathStatus | null
  robotStatus: RobotStatus | null
}>()

const emit = defineEmits<{
  (e: 'send-path-plan', waypoints: Waypoint[]): void
  (e: 'send-path-control', action: 'start' | 'pause' | 'resume' | 'stop' | 'clear'): void
  (e: 'waypoints-changed', waypoints: Waypoint[]): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const waypoints = ref<Waypoint[]>([])
const isPlacingWaypoints = ref(false)
let animationId: number | null = null

const canStart = computed(() => waypoints.value.length >= 2 && !isExecuting)
const isExecuting = computed(() => 
  props.pathStatus?.status === 'executing' || props.pathStatus?.status === 'paused'
)
const isPaused = computed(() => props.pathStatus?.status === 'paused')

const progress = computed(() => {
  if (!props.pathStatus?.data) return 0
  const current = props.pathStatus.data.current_index ?? 0
  const total = props.pathStatus.data.total ?? 1
  return total > 0 ? (current / total) * 100 : 0
})

const currentPose = computed(() => {
  if (props.robotStatus?.odometry?.position) {
    return {
      x: props.robotStatus.odometry.position.x,
      y: props.robotStatus.odometry.position.y
    }
  }
  return props.pathStatus?.current_pose ? {
    x: props.pathStatus.current_pose.x,
    y: props.pathStatus.current_pose.y
  } : null
})

const togglePlacingWaypoints = () => {
  isPlacingWaypoints.value = !isPlacingWaypoints.value
  if (!isPlacingWaypoints.value && waypoints.value.length > 0) {
    emit('send-path-plan', waypoints.value)
    emit('waypoints-changed', waypoints.value)
  }
}

const clearWaypoints = () => {
  waypoints.value = []
  emit('send-path-control', 'clear')
  emit('waypoints-changed', [])
}

const undoLastWaypoint = () => {
  if (waypoints.value.length > 0) {
    waypoints.value.pop()
    if (waypoints.value.length > 0) {
      emit('send-path-plan', waypoints.value)
    }
    emit('waypoints-changed', waypoints.value)
  }
}

const addWaypointAtCurrentPose = () => {
  if (currentPose.value) {
    waypoints.value.push({ ...currentPose.value })
    emit('send-path-plan', waypoints.value)
    emit('waypoints-changed', waypoints.value)
  }
}

const handleCanvasClick = (e: MouseEvent) => {
  if (!isPlacingWaypoints.value) return
  if (!canvasRef.value) return
  
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const rect = canvas.getBoundingClientRect()
  const centerX = rect.width / 2
  const centerY = rect.height / 2
  
  const clickX = e.clientX - rect.left - centerX
  const clickY = e.clientY - rect.top - centerY
  
  const scale = 100 / 5
  const worldX = clickX / scale
  const worldY = -clickY / scale
  
  waypoints.value.push({ x: worldX, y: worldY })
  emit('send-path-plan', waypoints.value)
  emit('waypoints-changed', waypoints.value)
}

const draw = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const container = canvas.parentElement
  if (!container) return
  
  const dpr = window.devicePixelRatio || 1
  const rect = container.getBoundingClientRect()
  
  if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx.scale(dpr, dpr)
  }
  
  const width = rect.width
  const height = rect.height
  const centerX = width / 2
  const centerY = height / 2
  const scale = 100 / 5
  
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, width, height)
  
  ctx.strokeStyle = '#1e3a5f'
  ctx.lineWidth = 0.5
  for (let x = centerX % scale; x < width; x += scale) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = centerY % scale; y < height; y += scale) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(centerX, 0)
  ctx.lineTo(centerX, height)
  ctx.moveTo(0, centerY)
  ctx.lineTo(width, centerY)
  ctx.stroke()
  
  if (waypoints.value.length > 1) {
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    for (let i = 0; i < waypoints.value.length; i++) {
      const wp = waypoints.value[i]
      const x = centerX + wp.x * scale
      const y = centerY - wp.y * scale
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
    ctx.setLineDash([])
  }
  
  waypoints.value.forEach((wp, index) => {
    const x = centerX + wp.x * scale
    const y = centerY - wp.y * scale
    const isCurrent = props.pathStatus?.data?.current_index === index && isExecuting.value
    
    ctx.beginPath()
    ctx.arc(x, y, isCurrent ? 12 : 8, 0, Math.PI * 2)
    ctx.fillStyle = isCurrent ? '#10b981' : (index === 0 ? '#f59e0b' : '#ef4444')
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${index + 1}`, x, y)
  })
  
  if (currentPose.value) {
    const x = centerX + currentPose.value.x * scale
    const y = centerY - currentPose.value.y * scale
    
    ctx.beginPath()
    ctx.arc(x, y, 15, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'
    ctx.fill()
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2
    ctx.stroke()
    
    if (props.pathStatus?.current_pose) {
      const theta = props.pathStatus.current_pose.theta
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(theta) * 20, y - Math.sin(theta) * 20)
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 3
      ctx.stroke()
    }
  }
  
  animationId = requestAnimationFrame(draw)
}

onMounted(() => {
  animationId = requestAnimationFrame(draw)
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
})
</script>

<template>
  <div class="card">
    <h3 class="card-title">
      🗺️ 路径规划
      <span v-if="pathStatus" class="status-badge" :class="pathStatus.status">
        {{ pathStatus.status === 'idle' ? '空闲' : 
           pathStatus.status === 'ready' ? '就绪' :
           pathStatus.status === 'executing' ? '执行中' :
           pathStatus.status === 'paused' ? '已暂停' :
           pathStatus.status === 'completed' ? '已完成' :
           pathStatus.status === 'stopped' ? '已停止' : '错误' }}
      </span>
    </h3>
    
    <div class="path-canvas-container" @click="handleCanvasClick">
      <canvas ref="canvasRef" :class="{ 'placing-mode': isPlacingWaypoints }"></canvas>
      
      <div v-if="isPlacingWaypoints" class="placing-hint">
        点击画布添加路径点
      </div>
    </div>
    
    <div class="waypoint-info">
      <span>路径点: {{ waypoints.length }}</span>
      <span v-if="progress > 0">进度: {{ progress.toFixed(0) }}%</span>
    </div>
    
    <div class="control-buttons">
      <button 
        class="btn" 
        :class="{ active: isPlacingWaypoints }"
        @click="togglePlacingWaypoints"
      >
        {{ isPlacingWaypoints ? '完成编辑' : '编辑路径' }}
      </button>
      
      <button 
        class="btn btn-secondary"
        @click="addWaypointAtCurrentPose"
        :disabled="!currentPose"
      >
        + 当前位置
      </button>
      
      <button 
        class="btn btn-secondary"
        @click="undoLastWaypoint"
        :disabled="waypoints.length === 0"
      >
        撤销
      </button>
      
      <button 
        class="btn btn-danger"
        @click="clearWaypoints"
      >
        清除
      </button>
    </div>
    
    <div class="execution-buttons">
      <button 
        v-if="!isExecuting"
        class="btn btn-primary"
        @click="emit('send-path-control', 'start')"
        :disabled="!canStart"
      >
        ▶️ 开始执行
      </button>
      
      <template v-else>
        <button 
          v-if="isPaused"
          class="btn btn-primary"
          @click="emit('send-path-control', 'resume')"
        >
          ▶️ 继续
        </button>
        <button 
          v-else
          class="btn btn-warning"
          @click="emit('send-path-control', 'pause')"
        >
          ⏸️ 暂停
        </button>
        
        <button 
          class="btn btn-danger"
          @click="emit('send-path-control', 'stop')"
        >
          ⏹️ 停止
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
}

.status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: auto;
  background: var(--bg-dark);
}

.status-badge.idle { color: var(--text-secondary); }
.status-badge.ready { color: var(--primary-color); }
.status-badge.executing { color: var(--success-color); }
.status-badge.paused { color: var(--warning-color); }
.status-badge.completed { color: var(--success-color); }
.status-badge.stopped { color: var(--text-secondary); }
.status-badge.error { color: var(--danger-color); }

.path-canvas-container {
  position: relative;
  height: 280px;
  background: var(--bg-dark);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
}

.path-canvas-container canvas {
  width: 100%;
  height: 100%;
}

.path-canvas-container canvas.placing-mode {
  cursor: crosshair;
}

.placing-hint {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(59, 130, 246, 0.9);
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
}

.waypoint-info {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.control-buttons,
.execution-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.execution-buttons {
  margin-top: 8px;
}

.btn {
  flex: 1;
  min-width: 80px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: var(--bg-dark);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn:hover:not(:disabled) {
  background: var(--bg-card-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.active {
  background: var(--primary-color);
  color: white;
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-dark);
}

.btn-secondary {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.btn-warning {
  background: var(--warning-color);
  color: #000;
}

.btn-danger {
  background: var(--danger-color);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}
</style>
