import axios from 'axios'
import type { NodeInfo, RegisterNodeRequest, APIResponse, PredictionResult } from '@/types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const nodeAPI = {
  async listNodes(): Promise<APIResponse<NodeInfo[]>> {
    const response = await api.get('/nodes')
    return response.data
  },

  async getNode(id: string): Promise<APIResponse<NodeInfo>> {
    const response = await api.get(`/nodes/${id}`)
    return response.data
  },

  async registerNode(data: RegisterNodeRequest): Promise<APIResponse<{ node_id: string }>> {
    const response = await api.post('/nodes', data)
    return response.data
  },

  async unregisterNode(id: string): Promise<APIResponse> {
    const response = await api.delete(`/nodes/${id}`)
    return response.data
  },

  async getNodeStatus(id: string): Promise<APIResponse<any>> {
    const response = await api.get(`/nodes/${id}/status`)
    return response.data
  },

  async getNodePrediction(id: string, hours: number = 24): Promise<APIResponse<PredictionResult>> {
    const response = await api.get(`/nodes/${id}/prediction`, {
      params: { hours }
    })
    return response.data
  },

  async healthCheck(): Promise<APIResponse> {
    const response = await api.get('/health')
    return response.data
  }
}

export function createMetricsStream(): EventSource {
  return new EventSource('/api/metrics')
}

export default api
