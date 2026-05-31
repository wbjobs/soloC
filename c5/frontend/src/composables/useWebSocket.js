import { ref } from 'vue'
import { decode } from '@msgpack/msgpack'

export function useWebSocket(url) {
  const isConnected = ref(false)
  const stats = ref(null)
  const trajectoryUpdates = ref([])
  const vesselPositions = ref([])
  const anomalyEvents = ref([])
  
  let ws = null
  let reconnectTimer = null
  const statsListeners = []
  const anomalyListeners = []

  function connect() {
    try {
      ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      
      ws.onopen = () => {
        console.log('WebSocket connected')
        isConnected.value = true
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
      }

      ws.onmessage = async (event) => {
        try {
          let data
          if (event.data instanceof ArrayBuffer) {
            data = decode(new Uint8Array(event.data))
          } else {
            data = JSON.parse(event.data)
          }
          handleMessage(data)
        } catch (e) {
          console.error('Failed to parse message:', e)
        }
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
        isConnected.value = false
        scheduleReconnect()
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    } catch (e) {
      console.error('Failed to connect:', e)
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, 3000)
  }

  function handleMessage(data) {
    if (data.type === 'stats' && data.stats) {
      stats.value = data.stats
      statsListeners.forEach(fn => fn(data.stats))
    } else if (data.type === 'anomaly' && data.events) {
      data.events.forEach(event => {
        anomalyEvents.value.unshift(event)
        if (anomalyEvents.value.length > 500) {
          anomalyEvents.value.pop()
        }
      })
      anomalyListeners.forEach(fn => fn(data.events))
    } else if (data.mmsi && data.points) {
      trajectoryUpdates.value.push(data)
      if (trajectoryUpdates.value.length > 100) {
        trajectoryUpdates.value.shift()
      }
      
      if (data.points && data.points.length > 0) {
        const lastPoint = data.points[data.points.length - 1]
        const existing = vesselPositions.value.findIndex(v => v.mmsi === data.mmsi)
        const vesselData = {
          mmsi: data.mmsi,
          lon: lastPoint.lon,
          lat: lastPoint.lat,
          speed: lastPoint.speed,
          time: lastPoint.time
        }
        
        if (existing >= 0) {
          vesselPositions.value[existing] = vesselData
        } else {
          vesselPositions.value.push(vesselData)
        }
      }
    }
  }

  connect()

  return {
    isConnected,
    stats,
    trajectoryUpdates,
    vesselPositions,
    anomalyEvents,
    subscribe: (callback) => {
      statsListeners.push(callback)
      return () => {
        const idx = statsListeners.indexOf(callback)
        if (idx >= 0) statsListeners.splice(idx, 1)
      }
    },
    onAnomaly: (callback) => {
      anomalyListeners.push(callback)
      return () => {
        const idx = anomalyListeners.indexOf(callback)
        if (idx >= 0) anomalyListeners.splice(idx, 1)
      }
    }
  }
}
