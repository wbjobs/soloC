<template>
  <div class="anomaly-panel">
    <div class="panel-header">
      <h3>
        <svg viewBox="0 0 24 24" fill="currentColor" class="warning-icon">
          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
        </svg>
        异常事件
        <span v-if="events.length > 0" class="event-count">{{ events.length }}</span>
      </h3>
      <button
        v-if="events.length > 0"
        @click="$emit('export')"
        class="export-btn"
        title="导出CSV"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/>
        </svg>
      </button>
    </div>
    <div class="event-scroll">
      <div
        v-for="event in events.slice(0, 30)"
        :key="event.id"
        class="event-item"
        :class="getEventClass(event.type)"
        @click="$emit('select', event)"
      >
        <div class="event-icon" :class="getEventClass(event.type)">
          <svg v-if="event.type === 'sudden_stop'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2v4c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm-1 11.17l-2.59-2.58L7 11.59l5 5 5-5-1.41-1.42L13 13.17V8h-2z"/>
          </svg>
        </div>
        <div class="event-content">
          <div class="event-header">
            <span class="event-type">{{ event.typeLabel }}</span>
            <span class="event-mmsi">{{ event.mmsi }}</span>
          </div>
          <div class="event-desc">{{ event.description }}</div>
          <div class="event-meta">
            <span class="event-time">{{ formatTime(event.time) }}</span>
            <span class="event-value">{{ event.type === 'sudden_stop' ? '下降' : '转向' }}: {{ event.value.toFixed(1) }}{{ event.type === 'sudden_stop' ? '%' : '°' }}</span>
          </div>
        </div>
        <div class="event-indicator" :class="getEventClass(event.type)"></div>
      </div>
      <div v-if="events.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span>暂无异常事件</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  events: {
    type: Array,
    default: () => []
  }
})

defineEmits(['select', 'export'])

function getEventClass(type) {
  return type === 'sudden_stop' ? 'stop' : 'turn'
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  const hours = d.getHours().toString().padStart(2, '0')
  const minutes = d.getMinutes().toString().padStart(2, '0')
  const seconds = d.getSeconds().toString().padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}
</script>

<style scoped>
.anomaly-panel {
  background: rgba(20, 20, 50, 0.8);
  border: 1px solid rgba(255, 100, 100, 0.2);
  border-radius: 12px;
  padding: 16px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.anomaly-panel h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #ff6464;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0;
}

.warning-icon {
  width: 18px;
  height: 18px;
}

.event-count {
  background: rgba(255, 100, 100, 0.2);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.export-btn {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(100, 180, 255, 0.3);
  border-radius: 6px;
  background: transparent;
  color: #64b4ff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.export-btn:hover {
  background: rgba(100, 180, 255, 0.15);
}

.export-btn svg {
  width: 16px;
  height: 16px;
}

.event-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(10, 10, 30, 0.6);
  border: 1px solid rgba(100, 180, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.event-item:hover {
  background: rgba(100, 180, 255, 0.08);
  border-color: rgba(100, 180, 255, 0.25);
}

.event-item.stop {
  border-left: 3px solid #ff6464;
}

.event-item.turn {
  border-left: 3px solid #ffaa64;
}

.event-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.event-icon.stop {
  background: rgba(255, 100, 100, 0.15);
  color: #ff6464;
}

.event-icon.turn {
  background: rgba(255, 170, 100, 0.15);
  color: #ffaa64;
}

.event-icon svg {
  width: 20px;
  height: 20px;
}

.event-content {
  flex: 1;
  min-width: 0;
}

.event-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.event-type {
  font-size: 13px;
  font-weight: 600;
  color: #e0e0e0;
}

.event-mmsi {
  font-size: 11px;
  color: #8080a0;
}

.event-desc {
  font-size: 12px;
  color: #a0a0c0;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #606080;
}

.event-value {
  font-weight: 600;
}

.event-item.stop .event-value {
  color: #ff6464;
}

.event-item.turn .event-value {
  color: #ffaa64;
}

.event-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.event-indicator.stop {
  background: #ff6464;
  box-shadow: 0 0 6px #ff6464;
  animation: pulse-stop 2s infinite;
}

.event-indicator.turn {
  background: #ffaa64;
  box-shadow: 0 0 6px #ffaa64;
  animation: pulse-turn 2s infinite;
}

@keyframes pulse-stop {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

@keyframes pulse-turn {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  color: #606080;
}

.empty-state svg {
  width: 40px;
  height: 40px;
  opacity: 0.5;
}
</style>
