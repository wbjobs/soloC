import axios from 'axios'

const API_BASE_URL = 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
})

export interface Node {
  id: string
  name: string
  type: 'metabolite' | 'reaction' | 'gene' | string
  flux?: number
}

export interface Edge {
  source: string
  target: string
  type: string
}

export interface NetworkData {
  nodes: Node[]
  edges: Edge[]
}

export interface PathDetail {
  from: Node
  to: Node
  edge_type: string
}

export interface Reaction {
  id: string
  name: string
  equation: string
}

export interface PathResult {
  success: boolean
  path: string[]
  path_details: PathDetail[]
  reactions: Reaction[]
  path_length: number
}

export interface Gene {
  id: string
  name: string
}

export interface AffectedReaction {
  id: string
  name: string
  flux: number
}

export interface FBAResult {
  success: boolean
  status: string
  objective_value: number
  flux_distribution: Record<string, number>
  knocked_out_genes: string[]
  affected_reactions: AffectedReaction[]
}

export const getNetwork = async (): Promise<NetworkData> => {
  const response = await api.get('/network')
  return response.data
}

export const getMetabolites = async () => {
  const response = await api.get('/metabolites')
  return response.data
}

export const getGenes = async (): Promise<{ genes: Gene[] }> => {
  const response = await api.get('/genes')
  return response.data
}

export const findPath = async (source: string, target: string): Promise<PathResult> => {
  const response = await api.post('/find-path', { source, target })
  return response.data
}

export const runFBA = async (knockoutGenes: string[]): Promise<FBAResult> => {
  const response = await api.post('/run-fba', { knockout_genes: knockoutGenes })
  return response.data
}

export const getStats = async () => {
  const response = await api.get('/stats')
  return response.data
}
