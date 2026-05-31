<template>
  <div class="map-container" ref="mapRef">
    <div class="map-controls">
      <button @click="zoomIn" class="control-btn" title="放大">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </button>
      <button @click="zoomOut" class="control-btn" title="缩小">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13H5v-2h14v2z"/>
        </svg>
      </button>
      <button @click="resetView" class="control-btn" title="重置视图">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 8V4l8 8-8 8v-4H4V8z"/>
        </svg>
      </button>
    </div>
    <div class="map-legend">
      <div class="legend-item">
        <div class="legend-dot active"></div>
        <span>选中船舶</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot normal"></div>
        <span>其他船舶</span>
      </div>
      <div class="legend-item">
        <div class="legend-line highlighted"></div>
        <span>高亮轨迹</span>
      </div>
      <div class="legend-item">
        <div class="legend-line normal"></div>
        <span>普通轨迹</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { ScatterplotLayer, PathLayer } from '@deck.gl/layers'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'

const props = defineProps({
  vessels: Object,
  trajectories: Object,
  highlightedMMSI: String,
  alarmMMSIs: Object,
  viewState: Object
})

const emit = defineEmits(['viewStateChange', 'vesselClick'])

const mapRef = ref(null)
let map = null
let deckOverlay = null
let animationTimer = null
const pulsePhase = ref(0)

const vesselData = computed(() => {
  const data = []
  for (const mmsi in props.vessels) {
    const vessel = props.vessels[mmsi]
    const isAlarm = props.alarmMMSIs && props.alarmMMSIs.has(mmsi)
    data.push({
      mmsi: vessel.mmsi,
      position: [vessel.lon, vessel.lat],
      speed: vessel.speed,
      highlighted: vessel.mmsi === props.highlightedMMSI,
      isAlarm
    })
  }
  return data
})

const normalTrajectoryData = computed(() => {
  const data = []
  for (const mmsi in props.trajectories) {
    if (mmsi === props.highlightedMMSI) continue
    const points = props.trajectories[mmsi]
    if (points.length >= 2) {
      data.push({
        mmsi,
        path: points.map(p => p.coordinates)
      })
    }
  }
  return data
})

const highlightedTrajectoryData = computed(() => {
  if (!props.highlightedMMSI) return []
  const points = props.trajectories[props.highlightedMMSI]
  if (!points || points.length < 2) return []
  return [{
    mmsi: props.highlightedMMSI,
    path: points.map(p => p.coordinates)
  }]
})

onMounted(() => {
  initMap()
  startPulseAnimation()
})

onUnmounted(() => {
  if (animationTimer) {
    clearInterval(animationTimer)
  }
  if (deckOverlay) {
    deckOverlay.finalize()
  }
  if (map) {
    map.remove()
  }
})

function startPulseAnimation() {
  animationTimer = setInterval(() => {
    pulsePhase.value = (pulsePhase.value + 0.08) % 1
    updateLayers()
  }, 50)
}

watch(vesselData, () => {
  updateLayers()
}, { deep: true })

watch(normalTrajectoryData, () => {
  updateLayers()
}, { deep: true })

watch(highlightedTrajectoryData, () => {
  updateLayers()
}, { deep: true })

watch(() => props.highlightedMMSI, (newMMSI, oldMMSI) => {
  if (newMMSI && newMMSI !== oldMMSI) {
    centerOnVessel(newMMSI)
  }
  nextTick(() => {
    updateLayers()
  })
})

function initMap() {
  map = new maplibregl.Map({
    container: mapRef.value,
    style: 'https://demotiles.maplibre.org/style.json',
    center: [props.viewState.longitude, props.viewState.latitude],
    zoom: props.viewState.zoom,
    pitch: props.viewState.pitch,
    bearing: props.viewState.bearing,
    antialias: true
  })

  map.on('move', () => {
    emit('viewStateChange', {
      longitude: map.getCenter().lng,
      latitude: map.getCenter().lat,
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing()
    })
  })

  deckOverlay = new MapboxOverlay({
    interleaved: true,
    layers: createLayers()
  })

  map.addControl(deckOverlay)
}

function createLayers() {
  const phase = pulsePhase.value
  const ring1Opacity = Math.max(0, 1 - phase * 1)
  const ring2Opacity = Math.max(0, 1 - (phase + 0.33) % 1)
  const ring3Opacity = Math.max(0, 1 - (phase + 0.66) % 1)

  const alarmVessels = vesselData.value.filter(v => v.isAlarm && !v.highlighted)
  const normalVessels = vesselData.value.filter(v => !v.highlighted && !v.isAlarm)
  const highlightedVessels = vesselData.value.filter(v => v.highlighted)

  return [
    new PathLayer({
      id: 'normal-trajectories',
      data: normalTrajectoryData.value,
      getPath: d => d.path,
      getColor: [100, 180, 255, 120],
      getWidth: 2,
      widthMinPixels: 1,
      widthMaxPixels: 4,
      jointRounded: true,
      capRounded: true,
      pickable: false
    }),
    new PathLayer({
      id: 'highlighted-trajectory',
      data: highlightedTrajectoryData.value,
      getPath: d => d.path,
      getColor: [100, 255, 155, 255],
      getWidth: 6,
      widthMinPixels: 4,
      widthMaxPixels: 10,
      jointRounded: true,
      capRounded: true,
      pickable: false
    }),
    new ScatterplotLayer({
      id: 'alarm-pulse-ring-1',
      data: alarmVessels,
      getPosition: d => d.position,
      getColor: [255, 100, 100, ring1Opacity * 200],
      getRadius: 150 + phase * 300,
      radiusMinPixels: 12,
      radiusMaxPixels: 60,
      pickable: false
    }),
    new ScatterplotLayer({
      id: 'alarm-pulse-ring-2',
      data: alarmVessels,
      getPosition: d => d.position,
      getColor: [255, 100, 100, ring2Opacity * 200],
      getRadius: 150 + ((phase + 0.33) % 1) * 300,
      radiusMinPixels: 12,
      radiusMaxPixels: 60,
      pickable: false
    }),
    new ScatterplotLayer({
      id: 'alarm-pulse-ring-3',
      data: alarmVessels,
      getPosition: d => d.position,
      getColor: [255, 100, 100, ring3Opacity * 200],
      getRadius: 150 + ((phase + 0.66) % 1) * 300,
      radiusMinPixels: 12,
      radiusMaxPixels: 60,
      pickable: false
    }),
    new ScatterplotLayer({
      id: 'normal-vessels',
      data: normalVessels,
      getPosition: d => d.position,
      getColor: [255, 150, 100, 220],
      getRadius: 80,
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
      onClick: (info) => {
        if (info.object) {
          emit('vesselClick', info.object.mmsi)
        }
      }
    }),
    new ScatterplotLayer({
      id: 'alarm-vessels',
      data: alarmVessels,
      getPosition: d => d.position,
      getColor: [255, 100, 100, 255],
      getRadius: 120,
      radiusMinPixels: 8,
      radiusMaxPixels: 14,
      pickable: true,
      onClick: (info) => {
        if (info.object) {
          emit('vesselClick', info.object.mmsi)
        }
      }
    }),
    new ScatterplotLayer({
      id: 'highlighted-vessel',
      data: highlightedVessels,
      getPosition: d => d.position,
      getColor: [100, 255, 155, 255],
      getRadius: 250,
      radiusMinPixels: 10,
      radiusMaxPixels: 18,
      pickable: true,
      onClick: (info) => {
        if (info.object) {
          emit('vesselClick', info.object.mmsi)
        }
      }
    })
  ]
}

function updateLayers() {
  if (deckOverlay) {
    deckOverlay.setProps({ layers: createLayers() })
  }
}

function centerOnVessel(mmsi) {
  const vessel = props.vessels[mmsi]
  if (vessel && map) {
    map.easeTo({
      center: [vessel.lon, vessel.lat],
      zoom: 14,
      duration: 800
    })
  }
}

function zoomIn() {
  if (map) map.zoomIn()
}

function zoomOut() {
  if (map) map.zoomOut()
}

function resetView() {
  if (map) {
    map.easeTo({
      center: [121.4737, 31.2304],
      zoom: 11,
      pitch: 0,
      bearing: 0,
      duration: 1000
    })
  }
}
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.map-container :deep(.maplibregl-map) {
  width: 100%;
  height: 100%;
  background: #0a0a1a;
}

.map-controls {
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}

.control-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 8px;
  background: rgba(20, 20, 50, 0.9);
  color: #64b4ff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  border: 1px solid rgba(100, 180, 255, 0.3);
}

.control-btn:hover {
  background: rgba(100, 180, 255, 0.2);
  border-color: rgba(100, 180, 255, 0.6);
}

.control-btn svg {
  width: 20px;
  height: 20px;
}

.map-legend {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(20, 20, 50, 0.9);
  border: 1px solid rgba(100, 180, 255, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  z-index: 10;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #a0a0a0;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-dot.active {
  background: #64ff9b;
  box-shadow: 0 0 6px #64ff9b;
}

.legend-dot.normal {
  background: #ff9664;
  box-shadow: 0 0 6px #ff9664;
}

.legend-line {
  width: 20px;
  height: 3px;
  border-radius: 2px;
}

.legend-line.highlighted {
  background: #64ff9b;
  height: 5px;
}

.legend-line.normal {
  background: #64b4ff;
  opacity: 0.7;
}
</style>
