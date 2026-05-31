'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

interface Node {
  id: string;
  name: string;
  type: string;
  isMain?: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface Link {
  source: string | Node;
  target: string | Node;
}

interface ForceGraphProps {
  nodes: Node[];
  links: Link[];
}

const MAX_NODES = 100;
const MAX_DISPLAYED_LABELS = 30;

export default function ForceGraph({ nodes, links }: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const nodeMapRef = useRef<Map<string, Node>>(new Map());
  const [showLoading, setShowLoading] = useState(false);

  const limitNodes = useCallback((nodes: Node[], links: Link[]) => {
    if (nodes.length <= MAX_NODES) {
      return { limitedNodes: nodes, limitedLinks: links, wasLimited: false };
    }

    const mainNode = nodes.find(n => n.isMain);
    const otherNodes = nodes.filter(n => !n.isMain);

    const connectedCounts = new Map<string, number>();
    otherNodes.forEach(n => connectedCounts.set(n.id, 0));
    
    links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      if (mainNode && (sourceId === mainNode.id || targetId === mainNode.id)) {
        const otherId = sourceId === mainNode.id ? targetId : sourceId;
        connectedCounts.set(otherId, (connectedCounts.get(otherId) || 0) + 1);
      }
    });

    const sortedNodes = otherNodes.sort((a, b) => 
      (connectedCounts.get(b.id) || 0) - (connectedCounts.get(a.id) || 0)
    );

    const selectedNodes = sortedNodes.slice(0, MAX_NODES - 1);
    if (mainNode) {
      selectedNodes.unshift(mainNode);
    }

    const nodeIds = new Set(selectedNodes.map(n => n.id));
    const limitedLinks = links.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });

    return { limitedNodes: selectedNodes, limitedLinks, wasLimited: true };
  }, []);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const { limitedNodes, limitedLinks, wasLimited } = limitNodes(nodes, links);
    
    if (wasLimited) {
      console.log(`Graph limited to ${MAX_NODES} nodes (original: ${nodes.length})`);
    }

    setShowLoading(true);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const container = svg.append('g');
    const g = container.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    if (wasLimited) {
      container.append('text')
        .attr('x', 10)
        .attr('y', 25)
        .attr('fill', '#666')
        .attr('font-size', '12px')
        .text(`Showing top ${MAX_NODES} nodes (total: ${nodes.length})`);
    }

    const initialPositions = limitedNodes.map((n, i) => ({
      ...n,
      x: width / 2 + Math.cos(i * 2 * Math.PI / limitedNodes.length) * 100,
      y: height / 2 + Math.sin(i * 2 * Math.PI / limitedNodes.length) * 100
    }));

    initialPositions.forEach(n => nodeMapRef.current.set(n.id, n));

    const link = g.append('g')
      .selectAll('line')
      .data(limitedLinks)
      .join('line')
      .attr('class', 'link')
      .attr('x1', d => {
        const source = typeof d.source === 'string' ? nodeMapRef.current.get(d.source) : d.source;
        return source?.x || 0;
      })
      .attr('y1', d => {
        const source = typeof d.source === 'string' ? nodeMapRef.current.get(d.source) : d.source;
        return source?.y || 0;
      })
      .attr('x2', d => {
        const target = typeof d.target === 'string' ? nodeMapRef.current.get(d.target) : d.target;
        return target?.x || 0;
      })
      .attr('y2', d => {
        const target = typeof d.target === 'string' ? nodeMapRef.current.get(d.target) : d.target;
        return target?.y || 0;
      });

    const node = g.append('g')
      .selectAll('circle')
      .data(initialPositions)
      .join('circle')
      .attr('class', d => d.type === 'paper' ? 'node-paper' : 'node-author')
      .attr('r', d => d.isMain ? 20 : 12)
      .attr('cx', d => d.x!)
      .attr('cy', d => d.y!);

    const labelNodes = initialPositions
      .filter(n => n.isMain)
      .concat(initialPositions.filter(n => !n.isMain).slice(0, MAX_DISPLAYED_LABELS - 1));

    const label = g.append('g')
      .selectAll('text')
      .data(labelNodes)
      .join('text')
      .attr('class', 'node-label')
      .text(d => d.name.length > 20 ? d.name.substring(0, 20) + '...' : d.name)
      .attr('x', d => d.x!)
      .attr('y', d => d.y! + 25);

    node.on('mouseover', (event, d) => {
      if (tooltipRef.current) {
        tooltipRef.current.style.display = 'block';
        tooltipRef.current.style.left = (event.pageX + 10) + 'px';
        tooltipRef.current.style.top = (event.pageY - 10) + 'px';
        tooltipRef.current.innerHTML = `
          <div><strong>${d.type === 'paper' ? 'Paper' : 'Author'}</strong></div>
          <div>${d.name}</div>
        `;
      }
    }).on('mouseout', () => {
      if (tooltipRef.current) {
        tooltipRef.current.style.display = 'none';
      }
    });

    const simulation = d3.forceSimulation<Node>(initialPositions)
      .velocityDecay(0.5)
      .alphaDecay(0.02)
      .force('link', d3.forceLink<Node, Link>(limitedLinks).id(d => d.id).distance(100).iterations(1))
      .force('charge', d3.forceManyBody().strength(-150).theta(0.95))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(25).iterations(1));

    simulationRef.current = simulation;

    node.call(d3.drag<SVGCircleElement, Node>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }));

    let tickCount = 0;
    let animationId: number | null = null;
    let lastRenderTime = 0;
    const renderInterval = 32;

    const tick = () => {
      const now = performance.now();
      const shouldRender = now - lastRenderTime >= renderInterval;

      for (let i = 0; i < 3; i++) {
        simulation.tick();
      }
      tickCount += 3;

      if (shouldRender) {
        lastRenderTime = now;

        link
          .attr('x1', d => {
            const source = typeof d.source === 'string' ? nodeMapRef.current.get(d.source) : d.source;
            return source?.x || 0;
          })
          .attr('y1', d => {
            const source = typeof d.source === 'string' ? nodeMapRef.current.get(d.source) : d.source;
            return source?.y || 0;
          })
          .attr('x2', d => {
            const target = typeof d.target === 'string' ? nodeMapRef.current.get(d.target) : d.target;
            return target?.x || 0;
          })
          .attr('y2', d => {
            const target = typeof d.target === 'string' ? nodeMapRef.current.get(d.target) : d.target;
            return target?.y || 0;
          });

        node
          .attr('cx', d => d.x!)
          .attr('cy', d => d.y!);

        label
          .attr('x', d => d.x!)
          .attr('y', d => d.y! + 25);
      }

      if (simulation.alpha() < 0.05 || tickCount >= 500) {
        simulation.stop();
        setShowLoading(false);
      } else {
        animationId = requestAnimationFrame(tick);
      }
    };

    setTimeout(() => {
      setShowLoading(false);
      animationId = requestAnimationFrame(tick);
    }, 100);

    return () => {
      simulation.stop();
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [nodes, links, limitNodes]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} className="graph-svg" />
      <div ref={tooltipRef} className="tooltip" style={{ display: 'none' }} />
      {showLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '15px 25px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          fontSize: '14px',
          color: '#666'
        }}>
          Layouting graph...
        </div>
      )}
    </div>
  );
}
