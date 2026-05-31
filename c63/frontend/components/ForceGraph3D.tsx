'use client'

import { useEffect, useRef, useMemo, useCallback } from 'react'

import ForceGraph3D from '3d-force-graph'
import * as THREE from 'three'
import { Node, Edge, PathResult, FBAResult } from '@/services/api'

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

interface GraphNode {
  id: string
  name: string
  type: string
  flux?: number
  __threeObject?: THREE.Mesh
}

interface GraphLink {
  source: string
  target: string
  type: string
  __threeObject?: THREE.Line
}

interface ForceGraph3DProps {
  nodes: Node[]
  edges: Edge[]
  selectedNodes: Set<string>
  onNodeClick: (node: Node) => void
  pathResult: PathResult | null
  fbaResult: FBAResult | null
}

const COLORS = {
  metabolite: '#4a90d9',
  reaction: '#e74c3c',
  gene: '#2ecc71',
  selected: '#ff0000',
  path: '#00ff00',
  pathEdge: '#ffff00',
  default: '#95a5a6',
  highFlux: '#ff6b6b',
  midFlux: '#feca57',
  lowFlux: '#48dbfb',
}

function getFluxColor(flux: number, maxFlux: number): string {
  if (maxFlux === 0) return COLORS.lowFlux
  const ratio = flux / maxFlux
  if (ratio > 0.66) return COLORS.highFlux
  if (ratio > 0.33) return COLORS.midFlux
  return COLORS.lowFlux
}

function getFluxSize(flux: number, maxFlux: number, baseSize: number): number {
  if (maxFlux === 0) return baseSize
  const ratio = flux / maxFlux
  return baseSize + ratio * baseSize * 3
}

export default function ForceGraph3DComponent({
  nodes,
  edges,
  selectedNodes,
  onNodeClick,
  pathResult,
  fbaResult,
}: ForceGraph3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const pathSetRef = useRef<Set<string>>(new Set())
  const pathEdgesSetRef = useRef<Set<string>>(new Set())

  const maxFlux = useMemo(() => {
    if (!fbaResult?.flux_distribution) return 0
    return Math.max(...Object.values(fbaResult.flux_distribution))
  }, [fbaResult])

  useEffect(() => {
    if (pathResult?.path) {
      pathSetRef.current = new Set(pathResult.path)
      
      const edgeSet = new Set<string>()
      for (let i = 0; i < pathResult.path.length - 1; i++) {
        const key1 = `${pathResult.path[i]}-${pathResult.path[i+1]}`
        const key2 = `${pathResult.path[i+1]}-${pathResult.path[i]}`
        edgeSet.add(key1)
        edgeSet.add(key2)
      }
      pathEdgesSetRef.current = edgeSet
    } else {
      pathSetRef.current = new Set()
      pathEdgesSetRef.current = new Set()
    }
  }, [pathResult])

  const getNodeColor = useCallback((node: any) => {
    if (selectedNodes.has(node.id)) return COLORS.selected
    if (pathSetRef.current.has(node.id)) return COLORS.path
    if (fbaResult && node.flux !== undefined) {
      return getFluxColor(node.flux, maxFlux)
    }
    switch (node.type) {
      case 'metabolite': return COLORS.metabolite
      case 'reaction': return COLORS.reaction
      case 'gene': return COLORS.gene
      default: return COLORS.default
    }
  }, [selectedNodes, fbaResult, maxFlux])

  const getNodeSize = useCallback((node: any) => {
    if (selectedNodes.has(node.id)) return 8
    if (pathSetRef.current.has(node.id)) return 6
    if (fbaResult && node.flux !== undefined) {
      return getFluxSize(node.flux, maxFlux, 4)
    }
    return 4
  }, [selectedNodes, fbaResult, maxFlux])

  const getLinkColor = useCallback((link: any) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    const targetId = typeof link.target === 'object' ? link.target.id : link.target
    const key = `${sourceId}-${targetId}`
    
    if (pathEdgesSetRef.current.has(key)) return COLORS.pathEdge
    return 'rgba(200, 200, 200, 0.3)'
  }, [])

  const getLinkWidth = useCallback((link: any) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    const targetId = typeof link.target === 'object' ? link.target.id : link.target
    const key = `${sourceId}-${targetId}`
    
    if (pathEdgesSetRef.current.has(key)) return 2
    return 0.5
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const graphData: GraphData = {
      nodes: nodes.map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        flux: n.flux,
      })),
      links: edges.map(e => ({
        source: e.source,
        target: e.target,
        type: e.type,
      })),
    }

    const Graph = ForceGraph3D({
      extraRenderers: [new THREE.CSS2DRenderer()],
    })(containerRef.current!)
      .graphData(graphData)
      .nodeId('id')
      .nodeLabel((node: any) => {
        let label = `${node.name} (${node.type})`
        if (node.flux !== undefined) {
          label += `\nFlux: ${node.flux.toFixed(3)}`
        }
        return label
      })
      .nodeColor(getNodeColor)
      .nodeVal(getNodeSize)
      .nodeOpacity(0.8)
      .nodeThreeObject((node: any) => {
        const geometry = new THREE.SphereGeometry(1, 8, 8)
        const material = new THREE.MeshLambertMaterial({
          color: getNodeColor(node),
          transparent: true,
          opacity: 0.9,
        })
        return new THREE.Mesh(geometry, material)
      })
      .linkColor(getLinkColor)
      .linkWidth(getLinkWidth)
      .linkOpacity(0.5)
      .linkResolution(4)
      .onNodeClick((node: any) => {
        onNodeClick({
          id: node.id,
          name: node.name,
          type: node.type,
          flux: node.flux,
        })
      })
      .showNavInfo(false)
      .width(containerRef.current.clientWidth)
      .height(containerRef.current.clientHeight)
      .d3AlphaDecay(0.05)
      .d3VelocityDecay(0.4)
      .warmupTicks(50)
      .cooldownTicks(100)
      .enablePointerInteraction(true)

    graphRef.current = Graph

    const controls = Graph.controls()
    controls.autoRotate = false
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    const camera = Graph.camera()
    camera.position.z = 500
    camera.far = 5000

    const renderer = Graph.renderer()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.shadowMap.enabled = false
    renderer.shadowMap.type = THREE.PCFShadowMap

    const scene = Graph.scene()
    scene.fog = new THREE.FogExp2(0x000000, 0.0008)

    const ambientLight = scene.children.find(
      (child: any) => child instanceof THREE.AmbientLight
    ) as THREE.AmbientLight
    if (ambientLight) {
      ambientLight.intensity = 0.6
    }

    const directionalLight = scene.children.find(
      (child: any) => child instanceof THREE.DirectionalLight
    ) as THREE.DirectionalLight
    if (directionalLight) {
      directionalLight.intensity = 0.8
      directionalLight.castShadow = false
    }

    return () => {
      if (graphRef.current) {
        try {
          const scene = graphRef.current.scene()
          scene.traverse((object: any) => {
            if (object.geometry) object.geometry.dispose()
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach((m: any) => m.dispose())
              } else {
                object.material.dispose()
              }
            }
          })
          
          const renderer = graphRef.current.renderer()
          renderer.dispose()
          renderer.forceContextLoss()
        } catch (e) {
          console.log('Cleanup error:', e)
        }
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [nodes.length])

  useEffect(() => {
    if (!graphRef.current) return

    graphRef.current.nodeColor(getNodeColor)
    graphRef.current.nodeVal(getNodeSize)
    graphRef.current.linkColor(getLinkColor)
    graphRef.current.linkWidth(getLinkWidth)
  }, [selectedNodes, pathResult, fbaResult, getNodeColor, getNodeSize, getLinkColor, getLinkWidth])

  useEffect(() => {
    if (!graphRef.current || !fbaResult) return

    const graphData = graphRef.current.graphData()
    graphData.nodes.forEach((node: any) => {
      if (fbaResult.flux_distribution[node.id] !== undefined) {
        node.flux = fbaResult.flux_distribution[node.id]
      }
    })

    graphRef.current.refresh()
  }, [fbaResult])

  useEffect(() => {
    const handleResize = () => {
      if (graphRef.current && containerRef.current) {
        graphRef.current
          .width(containerRef.current.clientWidth)
          .height(containerRef.current.clientHeight)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#000' }}
    />
  )
}
