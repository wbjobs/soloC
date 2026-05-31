import { io } from 'socket.io-client'

class SocketService {
  constructor() {
    this.socket = null
    this.listeners = new Map()
  }

  connect() {
    if (this.socket?.connected) return

    this.socket = io('http://localhost:3001')
    
    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id)
    })

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected')
    })

    this.socket.on('error', (error) => {
      console.error('Socket error:', error)
    })
  }

  on(event, callback) {
    if (!this.socket) this.connect()
    this.socket.on(event, callback)
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(callback)
  }

  off(event, callback) {
    if (!this.socket) return
    
    if (callback) {
      this.socket.off(event, callback)
      const listeners = this.listeners.get(event)
      if (listeners) {
        const index = listeners.indexOf(callback)
        if (index > -1) listeners.splice(index, 1)
      }
    } else {
      this.socket.off(event)
      this.listeners.delete(event)
    }
  }

  emit(event, data) {
    if (!this.socket) this.connect()
    this.socket.emit(event, data)
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.listeners.clear()
  }
}

export default new SocketService()
