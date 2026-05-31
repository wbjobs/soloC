<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { LaserData, RobotStatus } from '../types'

const props = defineProps<{
  laserData: LaserData | null
  robotStatus: RobotStatus | null
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const offscreenCanvas = document.createElement('canvas')
let animationId: number | null = null
let needsRedraw = true
let lastFrameTime = 0
const MIN_FRAME_INTERVAL = 1000 / 30

const colorCache: string[] = []
for (let i = 0; i <= 100; i++) {
  const normalized = i / 100
  if (normalized < 0.2) {
    colorCache[i] = 'rgb(239, 68, 68)'
  } else if (normalized < 0.5) {
    const t = (normalized - 0.2) / 0.3
    const r = 239 + (245 - 239) * t
    const g = 68 + (158 - 68) * t
    const b = 68 + (11 - 68) * t
    colorCache[i] = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
  } else {
    const t = (normalized - 0.5) / 0.5
    const r = 245 + (59 - 245) * t
    const g = 158 + (130 - 158) * t
    const b = 11 + (246 - 11) * t
    colorCache[i] = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
  }
}

const getColorForRange = (normalized: number): string => {
  const index = Math.max(0, Math.min(100, Math.round(normalized * 100)))
  return colorCache[index]
}

const drawStaticBackground = (width: number, height: number) => {
  const ctx = offscreenCanvas.getContext('2d')
  if (!ctx) return
  
  offscreenCanvas.width = width
  offscreenCanvas.height = height
  
  const centerX = width / 2
  const centerY = height / 2
  
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, width, height)
  
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1
  
  const maxRadius = Math.min(centerX, centerY)
  for (let r = 50; r <= maxRadius; r += 50) {
    ctx.beginPath()
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  
  ctx.beginPath()
  ctx.moveTo(centerX, 0)
  ctx.lineTo(centerX, height)
  ctx.moveTo(0, centerY)
  ctx.lineTo(width, centerY)
  ctx.stroke()
}

const drawRobot = (
  ctx: CanvasRenderingContext2D, 
  centerX: number, 
  centerY: number,
  status: RobotStatus | null
) => {
  const robotSize = 15
  
  ctx.save()
  ctx.translate(centerX, centerY)
  
  if (status?.odometry?.orientation) {
    const { x, y, z, w } = status.odometry.orientation
    const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
    ctx.rotate(yaw)
  }
  
  ctx.fillStyle = '#10b981'
  ctx.beginPath()
  ctx.arc(0, 0, robotSize, 0, Math.PI * 2)
  ctx.fill()
  
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(robotSize, 0)
  ctx.lineTo(robotSize - 8, -6)
  ctx.lineTo(robotSize - 8, 6)
  ctx.closePath()
  ctx.fill()
  
  ctx.strokeStyle = '#059669'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, robotSize, 0, Math.PI * 2)
  ctx.stroke()
  
  ctx.restore()
}

const draw = (timestamp: number) => {
  if (timestamp - lastFrameTime < MIN_FRAME_INTERVAL) {
    animationId = requestAnimationFrame(draw)
    return
  }
  
  if (!needsRedraw) {
    animationId = requestAnimationFrame(draw)
    return
  }
  
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const width = canvas.width
  const height = canvas.height
  const centerX = width / 2
  const centerY = height / 2
  
  ctx.drawImage(offscreenCanvas, 0, 0)
  
  if (props.laserData && props.laserData.ranges && props.laserData.angles) {
    const maxRange = props.laserData.range_max ?? 30
    const scale = Math.min(centerX, centerY) / maxRange * 0.8
    const { ranges, angles } = props.laserData
    
    const pointsPath = new Path2D()
    const outlinePath = new Path2D()
    let hasOutline = false
    
    const maxI = ranges.length
    for (let i = 0; i < maxI; i++) {
      const r = ranges[i]
      if (!isFinite(r) || r <= 0) continue
      
      const angle = angles[i]
      const x = centerX + r * scale * Math.cos(angle - Math.PI / 2)
      const y = centerY + r * scale * Math.sin(angle - Math.PI / 2)
      
      const normalizedRange = Math.min(1, r / maxRange)
      const color = getColorForRange(normalizedRange)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fill()
      
      if (!hasOutline) {
        outlinePath.moveTo(x, y)
        hasOutline = true
      } else {
        outlinePath.lineTo(x, y)
      }
    }
    
    if (hasOutline) {
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)'
      ctx.lineWidth = 1
      ctx.stroke(outlinePath)
    }
  }
  
  drawRobot(ctx, centerX, centerY, props.robotStatus)
  
  lastFrameTime = timestamp
  needsRedraw = false
  animationId = requestAnimationFrame(draw)
}

const resizeCanvas = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const container = canvas.parentElement
  if (!container) return
  
  const dpr = window.devicePixelRatio || 1
  const rect = container.getBoundingClientRect()
  
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`
  
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.scale(dpr, dpr)
  }
  
  drawStaticBackground(rect.width * dpr, rect.height * dpr)
  needsRedraw = true
}

watch(() => props.laserData, () => {
  needsRedraw = true
})

watch(() => props.robotStatus, () => {
  needsRedraw = true
})

onMounted(() => {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  animationId = requestAnimationFrame(draw)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
})
</script>

<template>
  <div class="card">
    <h3 class="card-title">🔴 激光雷达数据</h3>
    
    <div class="laser-visualization">
      <canvas ref="canvasRef"></canvas>
    </div>
    
    <div class="laser-legend">
      <div class="legend-item">
        <span class="legend-color robot"></span>
        <span>机器人</span>
      </div>
      <div class="legend-item">
        <span class="legend-color near"></span>
        <span>近处障碍物</span>
      </div>
      <div class="legend-item">
        <span class="legend-color far"></span>
        <span>远处障碍物</span>
      </div>
    </div>
    
    <div v-if="!laserData" class="empty-state" style="position: absolute; inset: 0;">
      <div class="empty-state-icon">📡</div>
      <div>等待激光雷达数据...</div>
    </div>
  </div>
</template>

<style scoped>
.card {
  position: relative;
}
</style>
