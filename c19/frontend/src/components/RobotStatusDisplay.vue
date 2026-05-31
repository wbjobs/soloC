<script setup lang="ts">
import { computed } from 'vue'
import type { RobotStatus } from '../types'

const props = defineProps<{
  robotStatus: RobotStatus | null
}>()

const formatUptime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

const batteryClass = computed(() => {
  const level = props.robotStatus?.battery?.level ?? 100
  if (level < 20) return 'low'
  if (level < 50) return 'medium'
  return ''
})

const linearHeight = computed(() => {
  const v = props.robotStatus?.cmd_vel?.linear_x ?? 0
  const maxV = 1.0
  const normalized = Math.min(Math.max(v / maxV, -1), 1)
  return {
    height: `${Math.abs(normalized) * 50}%`,
    bottom: normalized >= 0 ? '50%' : '0%',
    background: normalized >= 0 ? '#10b981' : '#ef4444'
  }
})

const angularHeight = computed(() => {
  const v = props.robotStatus?.cmd_vel?.angular_z ?? 0
  const maxV = 1.5
  const normalized = Math.min(Math.max(v / maxV, -1), 1)
  return {
    height: `${Math.abs(normalized) * 50}%`,
    bottom: normalized >= 0 ? '50%' : '0%',
    background: normalized >= 0 ? '#10b981' : '#ef4444'
  }
})
</script>

<template>
  <div class="card">
    <h3 class="card-title">📊 机器人状态</h3>
    
    <div v-if="robotStatus" class="status-content">
      <div class="status-grid">
        <div class="status-item">
          <div class="status-label">电池电量</div>
          <div class="status-value">{{ robotStatus.battery?.level?.toFixed(1) ?? '--' }}%</div>
          <div class="battery-bar">
            <div 
              class="battery-fill" 
              :class="batteryClass"
              :style="{ width: `${robotStatus.battery?.level ?? 0}%` }"
            ></div>
          </div>
        </div>
        
        <div class="status-item">
          <div class="status-label">运行时间</div>
          <div class="status-value">{{ formatUptime(robotStatus.uptime ?? 0) }}</div>
        </div>
        
        <div class="status-item">
          <div class="status-label">X 位置</div>
          <div class="status-value">{{ robotStatus.odometry?.position?.x?.toFixed(2) ?? '--' }}</div>
        </div>
        
        <div class="status-item">
          <div class="status-label">Y 位置</div>
          <div class="status-value">{{ robotStatus.odometry?.position?.y?.toFixed(2) ?? '--' }}</div>
        </div>
      </div>
      
      <div class="velocity-section">
        <div class="status-label" style="margin-bottom: 12px;">速度输出</div>
        <div class="velocity-display">
          <div class="velocity-item">
            <div class="velocity-bar">
              <div class="velocity-fill linear" :style="linearHeight"></div>
            </div>
            <div class="status-label">线速度</div>
            <div class="status-value" style="font-size: 14px;">
              {{ robotStatus.cmd_vel?.linear_x?.toFixed(2) ?? '0.00' }}
            </div>
          </div>
          
          <div class="velocity-item">
            <div class="velocity-bar">
              <div class="velocity-fill angular" :style="angularHeight"></div>
            </div>
            <div class="status-label">角速度</div>
            <div class="status-value" style="font-size: 14px;">
              {{ robotStatus.cmd_vel?.angular_z?.toFixed(2) ?? '0.00' }}
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div v-else class="empty-state">
      <div class="empty-state-icon">⏳</div>
      <div>等待机器人状态数据...</div>
    </div>
  </div>
</template>

<style scoped>
.status-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.velocity-section {
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}
</style>
