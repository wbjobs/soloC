<template>
  <div class="app-container">
    <header class="app-header">
      <h1>
        <svg viewBox="0 0 24 24" class="header-icon" fill="currentColor">
          <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19z"/>
        </svg>
        船舶AIS轨迹实时压缩与可视化平台
      </h1>
      <div class="header-status">
        <span class="status-dot" :class="{ active: isConnected }"></span>
        <span>{{ isConnected ? '已连接' : '未连接' }}</span>
      </div>
    </header>

    <div class="app-content">
      <aside class="sidebar">
        <SearchPanel
          v-model:searchMMSI="searchMMSI"
          @search="handleSearch"
          @clear="handleClearSearch"
        />
        
        <StatsPanel :stats="currentStats" />
        
        <AnomalyPanel
          :events="anomalyEvents"
          @select="handleAnomalySelect"
          @export="handleExportCSV"
        />
        
        <VesselList
          :vessels="vesselList"
          :highlightedMMSI="highlightedMMSI"
          :alarmMMSIs="alarmMMSIs"
          @select="handleVesselSelect"
        />
      </aside>

      <main class="main-content">
        <MapComponent
          :vessels="vesselMap"
          :trajectories="trajectoryMap"
          :highlightedMMSI="highlightedMMSI"
          :alarmMMSIs="alarmMMSIs"
          :viewState="viewState"
          @viewStateChange="viewState = $event"
          @vesselClick="handleMapVesselClick"
        />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import MapComponent from './components/MapComponent.vue'
import SearchPanel from './components/SearchPanel.vue'
import StatsPanel from './components/StatsPanel.vue'
import VesselList from './components/VesselList.vue'
import AnomalyPanel from './components/AnomalyPanel.vue'
import { useWebSocket } from './composables/useWebSocket'

const { isConnected, stats, trajectoryUpdates, vesselPositions, anomalyEvents } = useWebSocket('ws://localhost:8080/ws')

const searchMMSI = ref('')
const highlightedMMSI = ref('')
const vesselMap = reactive({})
const trajectoryMap = reactive({})
const currentStats = reactive({
  totalOriginalPoints: 0,
  totalCompressedPoints: 0,
  compressionRate: 0,
  averageDeviation: 0,
  vesselsCount: 0
})

const viewState = reactive({
  longitude: 121.4737,
  latitude: 31.2304,
  zoom: 11,
  pitch: 0,
  bearing: 0
})

const vesselList = computed(() => {
  return Object.values(vesselMap).sort((a, b) => b.time - a.time)
})

const alarmMMSIs = computed(() => {
  const cutoffTime = Date.now() - 2 * 60 * 1000
  const alarms = new Set()
  anomalyEvents.value.forEach(event => {
    if (new Date(event.time).getTime() > cutoffTime) {
      alarms.add(event.mmsi)
    }
  })
  return alarms
})

let statsUnwatch = null

onMounted(() => {
  vesselPositions.value.forEach(updateVessel)
  
  trajectoryUpdates.value.forEach(update => {
    updateTrajectory(update)
  })

  statsUnwatch = stats.subscribe((newStats) => {
    if (newStats) {
      Object.assign(currentStats, newStats)
    }
  })
})

onUnmounted(() => {
  if (statsUnwatch) {
    statsUnwatch()
  }
})

function updateVessel(vessel) {
  if (!vessel) return
  vesselMap[vessel.mmsi] = {
    ...vessel,
    time: new Date(vessel.time).getTime()
  }
}

function updateTrajectory(update) {
  if (!update || !update.points) return
  
  trajectoryMap[update.mmsi] = update.points.map(p => ({
    mmsi: p.mmsi,
    coordinates: [p.lon, p.lat],
    speed: p.speed,
    time: new Date(p.time).getTime()
  }))
}

function handleSearch(mmsi) {
  searchMMSI.value = mmsi
  highlightedMMSI.value = mmsi
}

function handleClearSearch() {
  highlightedMMSI.value = ''
  searchMMSI.value = ''
}

function handleVesselSelect(mmsi) {
  searchMMSI.value = mmsi
  highlightedMMSI.value = mmsi
}

function handleMapVesselClick(mmsi) {
  searchMMSI.value = mmsi
  highlightedMMSI.value = mmsi
}

function handleAnomalySelect(event) {
  searchMMSI.value = event.mmsi
  highlightedMMSI.value = event.mmsi
}

function handleExportCSV() {
  if (anomalyEvents.value.length === 0) return

  const headers = ['ID', 'MMSI', '事件类型', '描述', '经度', '纬度', '速度', '检测值', '阈值', '时间']
  const rows = anomalyEvents.value.map(event => [
    event.id,
    event.mmsi,
    event.typeLabel,
    event.description,
    event.lon.toFixed(6),
    event.lat.toFixed(6),
    event.speed.toFixed(1),
    event.value.toFixed(2),
    event.threshold.toFixed(2),
    formatDateTime(event.time)
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `异常事件_${formatDate(new Date())}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function formatDateTime(time) {
  const d = new Date(time)
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatDate(d) {
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function pad(n) {
  return n.toString().padStart(2, '0')
}
</script>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 100%);
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: rgba(10, 10, 30, 0.95);
  border-bottom: 1px solid rgba(100, 180, 255, 0.2);
  backdrop-filter: blur(10px);
  z-index: 100;
}

.app-header h1 {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 20px;
  font-weight: 600;
  color: #e0e0e0;
}

.header-icon {
  width: 28px;
  height: 28px;
  color: #64b4ff;
}

.header-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #a0a0a0;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff6464;
  transition: all 0.3s ease;
}

.status-dot.active {
  background: #64ff9b;
  box-shadow: 0 0 10px #64ff9b;
}

.app-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: rgba(15, 15, 40, 0.85);
  border-right: 1px solid rgba(100, 180, 255, 0.15);
  overflow-y: auto;
}

.main-content {
  flex: 1;
  position: relative;
}
</style>
