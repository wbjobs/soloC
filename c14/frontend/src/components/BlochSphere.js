import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

const BlochSphere = ({ x, y, z, qubitIndex = 0 }) => {
  const svgRef = useRef(null);
  const [rotation, setRotation] = useState({ x: -20, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 350;
    const height = 300;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    svg.attr('width', width).attr('height', height);

    const defs = svg.append('defs');
    
    const sphereGradient = defs.append('radialGradient')
      .attr('id', `sphereGradient${qubitIndex}`)
      .attr('cx', '30%')
      .attr('cy', '30%');
    
    sphereGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#5a5a8a')
      .attr('stop-opacity', 0.95);
    
    sphereGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#1a1a3e')
      .attr('stop-opacity', 0.95);

    const glow = defs.append('filter')
      .attr('id', `glow${qubitIndex}`)
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    glow.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');

    glow.append('feMerge')
      .html('<feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/>');

    const mainGroup = svg.append('g')
      .attr('transform', `translate(${centerX}, ${centerY})`);

    mainGroup.append('ellipse')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('rx', radius)
      .attr('ry', radius)
      .attr('fill', `url(#sphereGradient${qubitIndex})`)
      .attr('stroke', '#888')
      .attr('stroke-width', 2)
      .style('cursor', 'grab');

    const drawEllipse = (angleY, angleX, strokeColor, strokeDash = 'none') => {
      const scaleX = Math.cos(angleY * Math.PI / 180);
      const scaleY = Math.cos(angleX * Math.PI / 180);
      
      mainGroup.append('ellipse')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('rx', radius * Math.abs(scaleX) + (1 - Math.abs(scaleX)) * 2)
        .attr('ry', radius * scaleY)
        .attr('fill', 'none')
        .attr('stroke', strokeColor)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', strokeDash)
        .attr('opacity', scaleX > 0 ? 0.6 : 0.2);
    };

    drawEllipse(0, 0, '#666');
    drawEllipse(90, 0, '#555', '4,4');
    drawEllipse(45, 45, '#555', '2,2');

    const drawAxis = (label, x1, y1, x2, y2, color) => {
      mainGroup.append('line')
        .attr('x1', x1 * radius)
        .attr('y1', y1 * radius)
        .attr('x2', x2 * radius)
        .attr('y2', y2 * radius)
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.7);
    };

    drawAxis('Z', 0, -1, 0, 1, '#888');
    drawAxis('X', -1, 0, 1, 0, '#888');

    const validX = isNaN(x) ? 0 : Math.max(-1, Math.min(1, x));
    const validY = isNaN(y) ? 0 : Math.max(-1, Math.min(1, y));
    const validZ = isNaN(z) ? 0 : Math.max(-1, Math.min(1, z));

    const magnitude = Math.sqrt(validX * validX + validY * validY + validZ * validZ);
    
    const normX = magnitude > 0 ? validX / magnitude : 0;
    const normY = magnitude > 0 ? validY / magnitude : 0;
    const normZ = magnitude > 0 ? validZ / magnitude : 1;

    const displayX = normX;
    const displayY = normY * 0.3;
    const displayZ = normZ;

    const projX = (displayX + displayY * 0.5) * radius * 0.9;
    const projZ = (-displayZ + displayY * 0.3) * radius * 0.9;

    if (magnitude > 0.01) {
      mainGroup.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', projX)
        .attr('y2', projZ)
        .attr('stroke', '#00d9ff')
        .attr('stroke-width', 3)
        .attr('opacity', 0.9)
        .attr('filter', `url(#glow${qubitIndex})`);

      mainGroup.append('circle')
        .attr('cx', projX)
        .attr('cy', projZ)
        .attr('r', 10)
        .attr('fill', '#00d9ff')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2.5)
        .attr('filter', `url(#glow${qubitIndex})`);

      mainGroup.append('circle')
        .attr('cx', projX)
        .attr('cy', projZ)
        .attr('r', 14)
        .attr('fill', 'none')
        .attr('stroke', '#00d9ff')
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);
    } else {
      mainGroup.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#ff6b6b')
        .attr('font-size', '12px')
        .text('纠缠态');
    }

    const axisLabels = [
      { label: '|0⟩', x: 0, y: -radius - 25, color: '#00ff88' },
      { label: '|1⟩', x: 0, y: radius + 25, color: '#ff4444' },
      { label: '+X', x: radius + 20, y: 5, color: '#aaa' },
      { label: '-X', x: -radius - 25, y: 5, color: '#aaa' },
      { label: '+Y', x: radius * 0.6 + 15, y: radius * 0.4 + 10, color: '#aaa' },
    ];

    axisLabels.forEach(({ label, x, y, color }) => {
      mainGroup.append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', 'middle')
        .attr('fill', color)
        .attr('font-size', '12px')
        .attr('font-family', 'monospace')
        .text(label);
    });

    mainGroup.append('text')
      .attr('x', 0)
      .attr('y', -radius - 55)
      .attr('text-anchor', 'middle')
      .attr('fill', '#00d9ff')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .text(`Qubit ${qubitIndex}`);

    const coordsText = `x: ${normX.toFixed(2)}, y: ${normY.toFixed(2)}, z: ${normZ.toFixed(2)}`;
    mainGroup.append('text')
      .attr('x', 0)
      .attr('y', radius + 45)
      .attr('text-anchor', 'middle')
      .attr('fill', '#888')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .text(coordsText);

    if (magnitude < 0.99 && magnitude > 0.01) {
      mainGroup.append('text')
        .attr('x', 0)
        .attr('y', radius + 60)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ffaa00')
        .attr('font-size', '10px')
        .text(`纯度: ${(magnitude * 100).toFixed(1)}% (部分纠缠)`);
    }

  }, [x, y, z, qubitIndex]);

  return (
    <div className="bloch-sphere-container">
      <svg ref={svgRef} className="bloch-sphere" />
    </div>
  );
};

export default BlochSphere;
