import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const EntanglementVisualization = ({ entanglement, numQubits }) => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !entanglement) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 320;
    const height = 200;
    const centerX = width / 2;
    const centerY = height / 2;

    svg.attr('width', width).attr('height', height);

    const isEntangled = entanglement.is_entangled || false;
    const score = entanglement.entanglement_score || 0;
    const pairs = entanglement.pairs || [];

    const g = svg.append('g');

    const defs = svg.append('defs');
    
    const gradient = defs.append('linearGradient')
      .attr('id', 'entanglementGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%');
    
    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#667eea');
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#f093fb');

    const glow = defs.append('filter')
      .attr('id', 'entanglementGlow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    glow.append('feMerge').html('<feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/>');

    const angleStep = (2 * Math.PI) / numQubits;
    const radius = Math.min(width, height) * 0.3;
    
    const nodePositions = [];
    for (let i = 0; i < numQubits; i++) {
      const angle = angleStep * i - Math.PI / 2;
      nodePositions.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        qubit: i
      });
    }

    pairs.forEach(pair => {
      const [q1, q2] = pair.qubits;
      const pos1 = nodePositions[q1];
      const pos2 = nodePositions[q2];

      const lineColor = pair.is_entangled ? '#f093fb' : '#444';
      const lineWidth = pair.is_entangled ? 2 + pair.entropy * 3 : 1;
      const lineOpacity = pair.is_entangled ? 0.8 + pair.entropy * 0.2 : 0.3;

      if (pair.is_entangled) {
        g.append('line')
          .attr('x1', pos1.x)
          .attr('y1', pos1.y)
          .attr('x2', pos2.x)
          .attr('y2', pos2.y)
          .attr('stroke', lineColor)
          .attr('stroke-width', lineWidth)
          .attr('stroke-dasharray', '5,5')
          .attr('opacity', lineOpacity)
          .attr('filter', 'url(#entanglementGlow)');

        const totalLength = Math.sqrt(
          Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.y - pos1.y, 2)
        );
        const line = g.append('line')
          .attr('x1', pos1.x)
          .attr('y1', pos1.y)
          .attr('x2', pos2.x)
          .attr('y2', pos2.y)
          .attr('stroke', '#00d9ff')
          .attr('stroke-width', lineWidth)
          .attr('stroke-dasharray', `${totalLength}`)
          .attr('stroke-dashoffset', `${totalLength}`)
          .attr('opacity', 0.6);

        line.transition()
          .duration(2000)
          .attr('stroke-dashoffset', 0)
          .transition()
          .duration(1000)
          .attr('stroke-dashoffset', -totalLength)
          .on('end', function repeat() {
            d3.select(this)
              .attr('stroke-dashoffset', totalLength)
              .transition()
              .duration(2000)
              .attr('stroke-dashoffset', 0)
              .transition()
              .duration(1000)
              .attr('stroke-dashoffset', -totalLength)
              .on('end', repeat);
          });
      } else {
        g.append('line')
          .attr('x1', pos1.x)
          .attr('y1', pos1.y)
          .attr('x2', pos2.x)
          .attr('y2', pos2.y)
          .attr('stroke', lineColor)
          .attr('stroke-width', lineWidth)
          .attr('stroke-dasharray', '2,2')
          .attr('opacity', lineOpacity);
      }
    });

    nodePositions.forEach((pos, index) => {
      const purity = entanglement.per_qubit_purity?.[index] || 1;
      const isEntangledWithSomeone = pairs.some(
        p => (p.qubits[0] === index || p.qubits[1] === index) && p.is_entangled
      );

      const nodeColor = isEntangledWithSomeone ? '#f093fb' : '#667eea';
      const nodeRadius = 12 + (1 - purity) * 8;

      if (isEntangledWithSomeone) {
        g.append('circle')
          .attr('cx', pos.x)
          .attr('cy', pos.y)
          .attr('r', nodeRadius + 5)
          .attr('fill', 'none')
          .attr('stroke', '#00d9ff')
          .attr('stroke-width', 2)
          .attr('opacity', 0.5)
          .transition()
          .duration(1500)
          .attr('r', nodeRadius + 20)
          .attr('opacity', 0)
          .on('end', function repeat() {
            d3.select(this)
              .attr('r', nodeRadius + 5)
              .attr('opacity', 0.5)
              .transition()
              .duration(1500)
              .attr('r', nodeRadius + 20)
              .attr('opacity', 0)
              .on('end', repeat);
          });
      }

      g.append('circle')
        .attr('cx', pos.x)
        .attr('cy', pos.y)
        .attr('r', nodeRadius)
        .attr('fill', nodeColor)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .attr('filter', isEntangledWithSomeone ? 'url(#entanglementGlow)' : null);

      g.append('text')
        .attr('x', pos.x)
        .attr('y', pos.y)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#fff')
        .attr('font-weight', 'bold')
        .attr('font-size', '12px')
        .text(`q${index}`);
    });

    const infoY = height - 25;
    
    g.append('text')
      .attr('x', 10)
      .attr('y', infoY)
      .attr('fill', isEntangled ? '#f093fb' : '#888')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(isEntangled ? '🔗 检测到量子纠缠' : '✓ 无量子纠缠');

    if (numQubits > 1) {
      const barWidth = 100;
      const barX = width - barWidth - 10;
      const barY = infoY - 10;
      const barHeight = 8;

      g.append('text')
        .attr('x', barX)
        .attr('y', barY - 5)
        .attr('fill', '#888')
        .attr('font-size', '10px')
        .text('纠缠度');

      g.append('rect')
        .attr('x', barX)
        .attr('y', barY)
        .attr('width', barWidth)
        .attr('height', barHeight)
        .attr('fill', '#444')
        .attr('rx', 4);

      g.append('rect')
        .attr('x', barX)
        .attr('y', barY)
        .attr('width', barWidth * score)
        .attr('height', barHeight)
        .attr('fill', 'url(#entanglementGradient)')
        .attr('rx', 4)
        .transition()
        .duration(1000)
        .attrTween('width', function() {
          const i = d3.interpolate(0, barWidth * score);
          return function(t) { return i(t); };
        });

      g.append('text')
        .attr('x', barX + barWidth + 5)
        .attr('y', barY + barHeight - 1)
        .attr('fill', '#aaa')
        .attr('font-size', '10px')
        .text(`${(score * 100).toFixed(0)}%`);
    }

  }, [entanglement, numQubits]);

  if (!entanglement) {
    return (
      <div className="entanglement-panel">
        <h4>🔗 量子纠缠分析</h4>
        <p className="loading">请先运行模拟...</p>
      </div>
    );
  }

  const isEntangled = entanglement.is_entangled;
  const score = (entanglement.entanglement_score || 0) * 100;
  const pairs = entanglement.pairs || [];
  const entropy = entanglement.global_entropy || 0;

  return (
    <div className="entanglement-panel">
      <h4>🔗 量子纠缠分析</h4>
      
      <svg ref={svgRef} className="entanglement-graph" />

      <div className="entanglement-details">
        <div className="detail-item">
          <span className="detail-label">状态:</span>
          <span className={`detail-value ${isEntangled ? 'entangled' : 'separable'}`}>
            {isEntangled ? '纠缠态' : '可分态'}
          </span>
        </div>
        
        <div className="detail-item">
          <span className="detail-label">全局熵:</span>
          <span className="detail-value">{entropy.toFixed(4)}</span>
        </div>

        {pairs.length > 0 && (
          <div className="pairs-list">
            <h5>量子比特对:</h5>
            {pairs.map((pair, index) => (
              <div key={index} className={`pair-item ${pair.is_entangled ? 'entangled' : ''}`}>
                <span>q{pair.qubits[0]} ↔ q{pair.qubits[1]}</span>
                <span className="pair-metric">
                  熵: {pair.entropy.toFixed(3)} | 纯度: {(pair.purity * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EntanglementVisualization;
