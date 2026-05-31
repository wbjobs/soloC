import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import type { RobotStatus, LaserData, PathStatus, ConnectionState, Waypoint } from '../types'

export function useWebSocket() {
  const robotStatus = ref<RobotStatus | null>(null)
  const laserData = ref<LaserData | null>(null)
  const pathStatus = ref<PathStatus | null>(null)
  const connectionState = ref<ConnectionState>({
    connected: false,
    lastHeartbeat: null,
    reconnectAttempts: 0
  })

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  const MAX_RECONNECT_DELAY = 10000

  const getWebSocketUrl = (): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    return `${protocol}//${host}/ws`
  }

  const connect = () => {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    try {
      ws = new WebSocket(getWebSocketUrl())

      ws.onopen = () => {
        connectionState.value = {
          connected: true,
          lastHeartbeat: Date.now(),
          reconnectAttempts: 0
        }
        console.log('WebSocket connected')
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          handleMessage(message)
        } catch (e) {
          console.error('Failed to parse message:', e)
        }
      }

      ws.onclose = () => {
        connectionState.value = {
          ...connectionState.value,
          connected: false
        }
        console.log('WebSocket disconnected')
        scheduleReconnect()
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    } catch (e) {
      console.error('Failed to connect WebSocket:', e)
      scheduleReconnect()
    }
  }

  const scheduleReconnect = () => {
    if (reconnectTimer) return
    
    const delay = Math.min(
      1000 * Math.pow(1.5, connectionState.value.reconnectAttempts),
      MAX_RECONNECT_DELAY
    )
    
    reconnectTimer = setTimeout(() => {
      connectionState.value.reconnectAttempts++
      reconnectTimer = null
      connect()
    }, delay)
  }

  const handleMessage = (message: any) => {
    switch (message.type) {
      case 'status':
        robotStatus.value = message.data
        break
      case 'laser':
        laserData.value = message.data
        break
      case 'heartbeat':
        connectionState.value.lastHeartbeat = Date.now()
        break
      case 'battery':
        if (robotStatus.value) {
          robotStatus.value = {
            ...robotStatus.value,
            battery: { level: message.data.level, charging: false }
          }
        }
        break
      case 'path_status':
        pathStatus.value = message.data
        break
    }
  }

  const sendJoystick = (x: number, y: number) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'joystick',
        x,
        y
      }))
    }
  }

  const sendPathPlan = (waypoints: Waypoint[]) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'path_plan',
        waypoints
      }))
    }
  }

  const sendPathControl = (action: 'start' | 'pause' | 'resume' | 'stop' | 'clear') => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'path_control',
        action
      }))
    }
  }

  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    robotStatus,
    laserData,
    pathStatus,
    connectionState,
    sendJoystick,
    sendPathPlan,
    sendPathControl,
    connect,
    disconnect
  }
}
