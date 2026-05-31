<template>
  <div class="vessel-list">
    <h3>活跃船舶 ({{ vessels.length }})</h3>
    <div class="vessel-scroll">
      <div
        v-for="vessel in vessels"
        :key="vessel.mmsi"
        class="vessel-item"
        :class="{
          active: vessel.mmsi === highlightedMMSI,
          alarm: alarmMMSIs && alarmMMSIs.has(vessel.mmsi)
        }"
        @click="$emit('select', vessel.mmsi)"
      >
        <div class="vessel-info">
          <div class="vessel-mmsi">
            {{ vessel.mmsi }}
            <span v-if="alarmMMSIs && alarmMMSIs.has(vessel.mmsi)" class="alarm-badge">⚠</span>
          </div>
          <div class="vessel-details">
            <span class="speed">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
              {{ formatSpeed(vessel.speed) }} 节
            </span>
            <span class="time">{{ formatTime(vessel.time) }}</span>
          </div>
        </div>
        <div class="vessel-indicator" :class="{ alarm: alarmMMSIs && alarmMMSIs.has(vessel.mmsi) }"></div>
      </div>
      <div v-if="vessels.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
        </svg>
        <span>暂无船舶数据</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  vessels: {
    type: Array,
    default: () => []
  },
  highlightedMMSI: String,
  alarmMMSIs: Object
})

defineEmits(['select'])

function formatSpeed(speed) {
  if (speed === undefined || speed === null) return '0.0'
  return speed.toFixed(1)
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}
</script>

<style scoped>
.vessel-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(20, 20, 50, 0.8);
  border: 1px solid rgba(100, 180, 255, 0.2);
  border-radius: 12px;
  padding: 16px;
  min-height: 200px;
}

.vessel-list h3 {
  font-size: 14px;
  font-weight: 600;
  color: #64b4ff;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.vessel-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vessel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: rgba(10, 10, 30, 0.4);
  border: 1px solid rgba(100, 180, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.vessel-item:hover {
  background: rgba(100, 180, 255, 0.1);
  border-color: rgba(100, 180, 255, 0.3);
}

.vessel-item.active {
  background: linear-gradient(135deg, rgba(100, 255, 155, 0.15), rgba(100, 180, 255, 0.15));
  border-color: rgba(100, 255, 155, 0.4);
}

.vessel-item.alarm {
  border-left: 3px solid #ff6464;
  background: rgba(255, 100, 100, 0.08);
}

.vessel-info {
  flex: 1;
}

.vessel-mmsi {
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.alarm-badge {
  font-size: 12px;
  animation: pulse-badge 1.5s infinite;
}

@keyframes pulse-badge {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
}

.vessel-details {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #8080a0;
}

.vessel-details .speed {
  display: flex;
  align-items: center;
  gap: 4px;
}

.vessel-details .speed svg {
  width: 12px;
  height: 12px;
  color: #64ff9b;
}

.vessel-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #606080;
}

.vessel-item.active .vessel-indicator {
  background: #64ff9b;
  box-shadow: 0 0 8px #64ff9b;
}

.vessel-indicator.alarm {
  background: #ff6464;
  box-shadow: 0 0 8px #ff6464;
  animation: pulse-indicator 2s infinite;
}

@keyframes pulse-indicator {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #606080;
}

.empty-state svg {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}
</style>
