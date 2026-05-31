import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { nodeAPI, createMetricsStream } from '@/api'
import type { NodeInfo, NodeMetrics, DashboardStats } from '@/types'

export const useNodeStore = defineStore('node', () => {
  const nodes = ref<NodeInfo[]>([])
  const metricsMap = ref<Map<string, NodeMetrics[]>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)
  const eventSource = ref<EventSource | null>(null)

  const stats = computed<DashboardStats>(() => {
    const totalNodes = nodes.value.length
    const onlineNodes = nodes.value.filter(n => n.status === 'ONLINE').length
    const offlineNodes = nodes.value.filter(n => n.status === 'OFFLINE' || n.status === 'ERROR').length
    const syncingNodes = nodes.value.filter(n => n.status === 'SYNCING').length
    
    const txRates = nodes.value
      .filter(n => n.tx_rate > 0)
      .map(n => n.tx_rate)
    
    const averageTxRate = txRates.length > 0 
      ? txRates.reduce((a, b) => a + b, 0) / txRates.length 
      : 0
    
    const totalBlockHeight = nodes.value
      .map(n => n.block_height)
      .reduce((a, b) => a + b, 0)

    return {
      totalNodes,
      onlineNodes,
      offlineNodes,
      syncingNodes,
      averageTxRate,
      totalBlockHeight
    }
  })

  async function fetchNodes() {
    loading.value = true
    error.value = null
    try {
      const response = await nodeAPI.listNodes()
      if (response.success && response.data) {
        nodes.value = response.data
      } else {
        error.value = response.error || 'Failed to fetch nodes'
      }
    } catch (err) {
      error.value = 'Network error'
      console.error(err)
    } finally {
      loading.value = false
    }
  }

  async function registerNode(data: { type: string; name: string; endpoint: string; username?: string; password?: string }) {
    try {
      const response = await nodeAPI.registerNode(data)
      if (response.success) {
        await fetchNodes()
        return true
      }
      return false
    } catch (err) {
      console.error(err)
      return false
    }
  }

  async function removeNode(id: string) {
    try {
      const response = await nodeAPI.unregisterNode(id)
      if (response.success) {
        await fetchNodes()
        return true
      }
      return false
    } catch (err) {
      console.error(err)
      return false
    }
  }

  function startMetricsStream() {
    if (eventSource.value) {
      return
    }

    const es = createMetricsStream()
    
    es.onmessage = (event) => {
      try {
        const metrics: NodeMetrics[] = JSON.parse(event.data)
        updateMetrics(metrics)
      } catch (err) {
        console.error('Failed to parse metrics:', err)
      }
    }

    es.onerror = () => {
      console.warn('Metrics stream error, reconnecting in 5 seconds...')
      es.close()
      eventSource.value = null
      setTimeout(startMetricsStream, 5000)
    }

    eventSource.value = es
  }

  function stopMetricsStream() {
    if (eventSource.value) {
      eventSource.value.close()
      eventSource.value = null
    }
  }

  function updateMetrics(newMetrics: NodeMetrics[]) {
    for (const metric of newMetrics) {
      const existing = metricsMap.value.get(metric.node_id) || []
      const updated = [...existing, metric].slice(-100)
      metricsMap.value.set(metric.node_id, updated)
      
      const nodeIndex = nodes.value.findIndex(n => n.id === metric.node_id)
      if (nodeIndex !== -1) {
        nodes.value[nodeIndex].block_height = metric.block_height
        nodes.value[nodeIndex].tx_rate = metric.tx_rate
        nodes.value[nodeIndex].peer_count = metric.peer_count
        nodes.value[nodeIndex].sync_progress = metric.sync_progress
        nodes.value[nodeIndex].latency_ms = metric.latency_ms
      }
    }
  }

  function getNodeMetrics(nodeId: string): NodeMetrics[] {
    return metricsMap.value.get(nodeId) || []
  }

  return {
    nodes,
    metricsMap,
    loading,
    error,
    stats,
    fetchNodes,
    registerNode,
    removeNode,
    startMetricsStream,
    stopMetricsStream,
    getNodeMetrics
  }
})
