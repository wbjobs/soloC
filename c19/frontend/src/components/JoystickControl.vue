<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'joystick-change', x: number, y: number): void
}>()

const padRef = ref<HTMLDivElement | null>(null)
const knobOffsetX = ref(0)
const knobOffsetY = ref(0)
const isDragging = ref(false)

let animationFrame: number | null = null
let lastSentX = 0
let lastSentY = 0
const THROTTLE_MS = 50
let lastSendTime = 0

const JOYSTICK_RADIUS = 100
const KNOB_RADIUS = 30
const MAX_OFFSET = JOYSTICK_RADIUS - KNOB_RADIUS

const getPadCenter = () => {
  if (!padRef.value) return { x: 0, y: 0 }
  const rect = padRef.value.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  }
}

const calculateOffset = (clientX: number, clientY: number) => {
  const center = getPadCenter()
  let dx = clientX - center.x
  let dy = clientY - center.y
  
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  if (distance > MAX_OFFSET) {
    const ratio = MAX_OFFSET / distance
    dx *= ratio
    dy *= ratio
  }
  
  return { x: dx, y: dy }
}

const offsetToJoystick = (offsetX: number, offsetY: number) => {
  const x = Math.max(-1, Math.min(1, offsetX / MAX_OFFSET))
  const y = Math.max(-1, Math.min(1, -offsetY / MAX_OFFSET))
  return { x, y }
}

const updateJoystick = (clientX: number, clientY: number) => {
  const offset = calculateOffset(clientX, clientY)
  knobOffsetX.value = offset.x
  knobOffsetY.value = offset.y
  
  const now = Date.now()
  if (now - lastSendTime >= THROTTLE_MS) {
    const joystick = offsetToJoystick(offset.x, offset.y)
    if (Math.abs(joystick.x - lastSentX) > 0.01 || Math.abs(joystick.y - lastSentY) > 0.01) {
      emit('joystick-change', joystick.x, joystick.y)
      lastSentX = joystick.x
      lastSentY = joystick.y
    }
    lastSendTime = now
  }
}

const resetJoystick = () => {
  knobOffsetX.value = 0
  knobOffsetY.value = 0
  emit('joystick-change', 0, 0)
  lastSentX = 0
  lastSentY = 0
}

const handleMouseDown = (e: MouseEvent) => {
  if (props.disabled) return
  isDragging.value = true
  updateJoystick(e.clientX, e.clientY)
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return
  updateJoystick(e.clientX, e.clientY)
}

const handleMouseUp = () => {
  if (isDragging.value) {
    isDragging.value = false
    resetJoystick()
  }
}

const handleTouchStart = (e: TouchEvent) => {
  if (props.disabled) return
  e.preventDefault()
  isDragging.value = true
  const touch = e.touches[0]
  updateJoystick(touch.clientX, touch.clientY)
}

const handleTouchMove = (e: TouchEvent) => {
  if (props.disabled) return
  e.preventDefault()
  if (!isDragging.value) return
  const touch = e.touches[0]
  updateJoystick(touch.clientX, touch.clientY)
}

const handleTouchEnd = () => {
  handleMouseUp()
}

const listenerOptions = { passive: false, capture: false }

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
  window.addEventListener('touchmove', handleTouchMove, listenerOptions)
  window.addEventListener('touchend', handleTouchEnd)
  window.addEventListener('touchcancel', handleTouchEnd)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
  window.removeEventListener('touchmove', handleTouchMove, listenerOptions)
  window.removeEventListener('touchend', handleTouchEnd)
  window.removeEventListener('touchcancel', handleTouchEnd)
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
})

const knobStyle = () => ({
  transform: `translate(calc(-50% + ${knobOffsetX.value}px), calc(-50% + ${knobOffsetY.value}px))`
})

const currentX = () => offsetToJoystick(knobOffsetX.value, knobOffsetY.value).x.toFixed(2)
const currentY = () => offsetToJoystick(knobOffsetX.value, knobOffsetY.value).y.toFixed(2)
</script>

<template>
  <div class="card">
    <h3 class="card-title">🎮 摇杆控制</h3>
    
    <div class="joystick-container">
      <div 
        ref="padRef"
        class="joystick-pad"
        :class="{ disabled: disabled }"
        @mousedown="handleMouseDown"
        @touchstart="handleTouchStart"
      >
        <div class="joystick-knob" :style="knobStyle()"></div>
        <div class="joystick-labels">
          <span class="joystick-label top">前</span>
          <span class="joystick-label bottom">后</span>
          <span class="joystick-label left">左</span>
          <span class="joystick-label right">右</span>
        </div>
        
        <div v-if="disabled" class="disabled-overlay">
          <span>路径执行中</span>
        </div>
      </div>
    </div>
    
    <div class="joystick-values">
      <div class="joystick-value">X: {{ currentX() }}</div>
      <div class="joystick-value">Y: {{ currentY() }}</div>
    </div>
    
    <div class="joystick-hint">
      <span>拖动摇杆控制机器人运动</span>
      <br/>
      <small>上下: 前进/后退 | 左右: 左转/右转</small>
    </div>
  </div>
</template>

<style scoped>
.joystick-pad.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.joystick-pad.disabled .joystick-knob {
  background: #64748b;
  box-shadow: none;
}

.disabled-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.7);
  border-radius: 50%;
  pointer-events: none;
}

.disabled-overlay span {
  color: var(--warning-color);
  font-size: 14px;
  font-weight: 600;
}

.joystick-hint {
  text-align: center;
  margin-top: 16px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.joystick-hint small {
  font-size: 12px;
}
</style>
