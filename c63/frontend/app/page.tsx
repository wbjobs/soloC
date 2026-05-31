'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Node, Edge, PathResult, Gene, getNetwork, getGenes, findPath, runFBA } from '@/services/api'

const ForceGraph3DComponent = dynamic(
  () => import('@/components/ForceGraph3D'),
  { ssr: false }
)

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [genes, setGenes] = useState<Gene[]>([])
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set())
  const [selectedNodeList, setSelectedNodeList] = useState<Node[]>([])
  const [pathResult, setPathResult] = useState<PathResult | null>(null)
  const [fbaResult, setFbaResult] = useState<any>(null)
  const [selectedKnockoutGenes, setSelectedKnockoutGenes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [fbaLoading, setFbaLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showGeneSelector, setShowGeneSelector] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [networkData, genesData] = await Promise.all([
          getNetwork(),
          getGenes(),
        ])
        setNodes(networkData.nodes)
        setEdges(networkData.edges)
        setGenes(genesData.genes)
      } catch (err) {
        setError('Failed to load network data. Please ensure the backend server is running.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleNodeClick = useCallback((node: Node) => {
    setSelectedNodes(prev => {
      const newSelected = new Set(prev)
      
      if (newSelected.has(node.id)) {
        newSelected.delete(node.id)
        setSelectedNodeList(prevList => prevList.filter(n => n.id !== node.id))
      } else {
        if (newSelected.size >= 2) {
          const firstNode = Array.from(newSelected)[0]
          newSelected.delete(firstNode)
          setSelectedNodeList(prevList => [...prevList.slice(1), node])
        } else {
          setSelectedNodeList(prevList => [...prevList, node])
        }
        newSelected.add(node.id)
      }
      
      setPathResult(null)
      return newSelected
    })
  }, [])

  const handleFindPath = useCallback(async () => {
    if (selectedNodeList.length !== 2) {
      alert('Please select exactly two nodes')
      return
    }
    
    try {
      setLoading(true)
      const result = await findPath(selectedNodeList[0].id, selectedNodeList[1].id)
      setPathResult(result)
    } catch (err) {
      setError('Failed to find path.')
    } finally {
      setLoading(false)
    }
  }, [selectedNodeList])

  const handleRunFBA = useCallback(async () => {
    try {
      setFbaLoading(true)
      const result = await runFBA(Array.from(selectedKnockoutGenes))
      setFbaResult(result)
      
      setNodes(prevNodes => 
        prevNodes.map(node => ({
          ...node,
          flux: result.flux_distribution[node.id] ?? node.flux,
        }))
      )
    } catch (err) {
      setError('Failed to run FBA.')
    } finally {
      setFbaLoading(false)
    }
  }, [selectedKnockoutGenes])

  const toggleKnockoutGene = useCallback((geneId: string) => {
    setSelectedKnockoutGenes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(geneId)) {
        newSet.delete(geneId)
      } else {
        newSet.add(geneId)
      }
      return newSet
    })
  }, [])

  const resetSelection = useCallback(() => {
    setSelectedNodes(new Set())
    setSelectedNodeList([])
    setPathResult(null)
  }, [])

  const resetFBA = useCallback(() => {
    setFbaResult(null)
    setSelectedKnockoutGenes(new Set())
    setNodes(prevNodes => 
      prevNodes.map(node => {
        const { flux, ...rest } = node
        return rest as Node
      })
    )
  }, [])

  const stats = useMemo(() => {
    const metaboliteCount = nodes.filter(n => n.type === 'metabolite').length
    const reactionCount = nodes.filter(n => n.type === 'reaction').length
    const geneCount = nodes.filter(n => n.type === 'gene').length
    
    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      metaboliteCount,
      reactionCount,
      geneCount,
    }
  }, [nodes, edges])

  const maxFlux = useMemo(() => {
    if (!fbaResult?.flux_distribution) return 0
    return Math.max(...Object.values(fbaResult.flux_distribution))
  }, [fbaResult])

  if (loading && nodes.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-xl">Loading metabolic network...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="flex h-screen">
        <div className="w-80 bg-gray-800 p-4 overflow-y-auto flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">Metabolic Network</h1>
            <p className="text-sm text-gray-400">
              E. coli core metabolism visualization
            </p>
          </div>

          <div className="bg-gray-700 p-3 rounded-lg">
            <h2 className="text-sm font-semibold mb-2">Network Stats</h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Nodes: {stats.totalNodes}</div>
              <div>Edges: {stats.totalEdges}</div>
              <div className="text-blue-400">Metabolites: {stats.metaboliteCount}</div>
              <div className="text-red-400">Reactions: {stats.reactionCount}</div>
              <div className="text-green-400 col-span-2">Genes: {stats.geneCount}</div>
            </div>
          </div>

          <div className="bg-gray-700 p-3 rounded-lg">
            <h2 className="text-sm font-semibold mb-2">Legend</h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span>Metabolites</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span>Reactions</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>Genes</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-600"></div>
                <span>Selected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-lime-500"></div>
                <span>Path</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-yellow-400"></div>
                <span>Path Edges</span>
              </div>
              {fbaResult && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ff6b6b]"></div>
                    <span>High Flux</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#feca57]"></div>
                    <span>Mid Flux</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#48dbfb]"></div>
                    <span>Low Flux</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-gray-700 p-3 rounded-lg">
            <h2 className="text-sm font-semibold mb-2">Selected ({selectedNodeList.length}/2)</h2>
            <div className="space-y-2 max-h-24 overflow-y-auto">
              {selectedNodeList.map((node, index) => (
                <div key={node.id} className="bg-gray-600 p-2 rounded text-xs">
                  <div className="font-medium truncate">{node.name}</div>
                  <div className="text-gray-400 truncate">{node.id}</div>
                  {node.flux !== undefined && (
                    <div className="text-yellow-400">Flux: {node.flux.toFixed(3)}</div>
                  )}
                </div>
              ))}
              {selectedNodeList.length === 0 && (
                <div className="text-gray-400 text-xs italic">Click nodes to select</div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleFindPath}
              disabled={selectedNodeList.length !== 2 || loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded font-semibold transition text-sm"
            >
              Find Shortest Path
            </button>
            <button
              onClick={resetSelection}
              className="w-full bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded font-semibold transition text-sm"
            >
              Reset Selection
            </button>
          </div>

          <div className="border-t border-gray-600 pt-4">
            <button
              onClick={() => setShowGeneSelector(!showGeneSelector)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded font-semibold transition text-sm mb-2"
            >
              {showGeneSelector ? 'Hide FBA Controls' : 'Flux Balance Analysis (FBA)'}
            </button>

            {showGeneSelector && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-xs font-semibold mb-1">Select Genes to Knockout</h3>
                  <div className="max-h-32 overflow-y-auto bg-gray-600 rounded p-2 space-y-1">
                    {genes.map(gene => (
                      <label key={gene.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-500 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedKnockoutGenes.has(gene.id)}
                          onChange={() => toggleKnockoutGene(gene.id)}
                          className="rounded"
                        />
                        <span className="truncate">{gene.name || gene.id}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Selected: {selectedKnockoutGenes.size} gene(s)
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleRunFBA}
                    disabled={fbaLoading}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-2 rounded font-semibold transition text-xs"
                  >
                    {fbaLoading ? 'Running...' : 'Run FBA'}
                  </button>
                  <button
                    onClick={resetFBA}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 px-3 py-2 rounded font-semibold transition text-xs"
                  >
                    Reset FBA
                  </button>
                </div>
              </div>
            )}
          </div>

          {fbaResult && (
            <div className="bg-gray-700 p-3 rounded-lg flex-1 overflow-hidden flex flex-col">
              <h2 className="text-sm font-semibold mb-2">FBA Result</h2>
              <div className="text-xs mb-2 space-y-1">
                <div>Status: <span className="text-green-400">{fbaResult.status}</span></div>
                <div>Objective Value: <span className="text-yellow-400">{fbaResult.objective_value.toFixed(4)}</span></div>
                <div>Knocked out: {fbaResult.knocked_out_genes.length > 0 ? fbaResult.knocked_out_genes.join(', ') : 'None'}</div>
              </div>
              
              {fbaResult.affected_reactions.length > 0 && (
                <>
                  <h3 className="font-semibold text-xs mb-1">Affected Reactions ({fbaResult.affected_reactions.length})</h3>
                  <div className="text-xs space-y-1 overflow-y-auto max-h-32">
                    {fbaResult.affected_reactions.slice(0, 10).map((rxn: any) => (
                      <div key={rxn.id} className="bg-gray-600 p-1 rounded">
                        <span className="truncate">{rxn.name}</span>
                        <span className="text-yellow-400 ml-1">f={rxn.flux.toFixed(3)}</span>
                      </div>
                    ))}
                    {fbaResult.affected_reactions.length > 10 && (
                      <div className="text-gray-400">...and {fbaResult.affected_reactions.length - 10} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {pathResult && (
            <div className="bg-gray-700 p-3 rounded-lg flex-1 overflow-hidden flex flex-col">
              <h2 className="text-sm font-semibold mb-2">Path Result</h2>
              <div className="text-xs mb-2">
                <div>Steps: {pathResult.path_length}</div>
                <div>Reactions: {pathResult.reactions.length}</div>
              </div>
              
              <h3 className="font-semibold text-xs mb-1">Path</h3>
              <div className="text-xs space-y-1 mb-3 max-h-24 overflow-y-auto bg-gray-600 p-2 rounded">
                {pathResult.path_details.map((detail: any, index: number) => (
                  <div key={index} className="flex items-center gap-1">
                    <span className="text-blue-400 truncate">{detail.from.name}</span>
                    <span className="text-gray-500">→</span>
                    <span className="text-green-400 truncate">{detail.to.name}</span>
                  </div>
                ))}
              </div>

              <h3 className="font-semibold text-xs mb-1">Reactions</h3>
              <div className="text-xs space-y-2 overflow-y-auto flex-1">
                {pathResult.reactions.map((reaction: any) => (
                  <div key={reaction.id} className="bg-gray-600 p-2 rounded">
                    <div className="font-medium truncate">{reaction.name}</div>
                    <div className="text-gray-400 mt-1 break-all text-[10px]">{reaction.equation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-900 rounded text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          <ForceGraph3DComponent
            nodes={nodes}
            edges={edges}
            selectedNodes={selectedNodes}
            onNodeClick={handleNodeClick}
            pathResult={pathResult}
            fbaResult={fbaResult}
          />
          
          <div className="absolute top-4 right-4 bg-gray-800 bg-opacity-90 p-3 rounded text-xs">
            <div className="font-semibold mb-1">Controls</div>
            <div className="text-gray-400 space-y-1">
              <div>Left click + drag: Rotate</div>
              <div>Right click + drag: Pan</div>
              <div>Scroll: Zoom</div>
              <div>Click node: Select</div>
            </div>
          </div>

          {fbaResult && (
            <div className="absolute bottom-4 left-4 bg-gray-800 bg-opacity-90 p-3 rounded text-xs">
              <div className="font-semibold mb-1">Flux Distribution</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff6b6b]"></div>
                  <span>High: {(maxFlux * 0.66).toFixed(2)} - {maxFlux.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#feca57]"></div>
                  <span>Medium: {(maxFlux * 0.33).toFixed(2)} - {(maxFlux * 0.66).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#48dbfb]"></div>
                  <span>Low: 0 - {(maxFlux * 0.33).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
