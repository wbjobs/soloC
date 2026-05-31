export type NodeType = 'ETHEREUM' | 'BITCOIN'

export type NodeStatus = 'OFFLINE' | 'ONLINE' | 'SYNCING' | 'ERROR'

export interface NodeInfo {
  id: string
  type: NodeType
  name: string
  endpoint: string
  status: NodeStatus
  block_height: number
  tx_rate: number
  peer_count?: number
  sync_progress?: number
  latency_ms?: number
  last_checked?: number
}

export interface NodeMetrics {
  node_id: string
  timestamp: number
  block_height: number
  tx_rate: number
  peer_count: number
  sync_progress: number
  latency_ms: number
}

export interface MetricsHistory {
  timestamp: number
  block_height: number
  tx_rate: number
  peer_count: number
  latency_ms: number
}

export interface RegisterNodeRequest {
  type: string
  name: string
  endpoint: string
  username?: string
  password?: string
}

export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

export interface DashboardStats {
  totalNodes: number
  onlineNodes: number
  offlineNodes: number
  syncingNodes: number
  averageTxRate: number
  totalBlockHeight: number
}

export interface HistoricalDataPoint {
  time: string
  block_height: number
  block_generation_rate: number
  tx_rate: number
}

export interface PredictionPoint {
  time: string
  block_height: number
  block_generation_rate: number
  tx_rate: number
  confidence: number
}

export interface PredictionSummary {
  average_block_rate_24h: number
  predicted_blocks_next_24h: number
  confidence: number
  trend: 'stable' | 'increasing' | 'decreasing' | 'insufficient_data'
}

export interface PredictionResult {
  node_id: string
  historical_points: HistoricalDataPoint[]
  predicted_points: PredictionPoint[]
  summary: PredictionSummary
}
