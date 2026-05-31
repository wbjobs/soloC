import { useEffect, useRef, useState, useCallback } from 'react';
import { AlignmentResult, Alignment } from '../types';

const BASE_COLORS: Record<string, string> = {
  A: '#4ade80',
  T: '#f87171',
  G: '#fbbf24',
  C: '#60a5fa',
  N: '#9ca3af'
};

interface GenomeBrowserProps {
  alignmentResult: AlignmentResult;
}

const GenomeBrowser: React.FC<GenomeBrowserProps> = ({ alignmentResult }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ start: 0, end: 1000, zoom: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const lastXRef = useRef(0);

  const animationFrameRef = useRef<number | null>(null);
  const isRenderingRef = useRef(false);
  const isUnmountedRef = useRef(false);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingViewportRef = useRef<typeof viewport | null>(null);

  const firstRefName = Object.keys(alignmentResult.reference_sequences)[0];
  const referenceSequence = alignmentResult.reference_sequences[firstRefName];
  const refLength = referenceSequence?.length || 0;

  const visibleAlignments = alignmentResult.alignments.filter(
    (aln) => aln.reference_end > viewport.start && aln.reference_start < viewport.end
  );

  const drawAlignment = useCallback((
    ctx: CanvasRenderingContext2D,
    alignment: Alignment,
    y: number,
    height: number,
    baseWidth: number,
    currentViewport: { start: number; end: number },
    canvasWidth: number
  ) => {
    if (isUnmountedRef.current) return;

    const alnStartX = (alignment.reference_start - currentViewport.start) * baseWidth;
    const alnEndX = (alignment.reference_end - currentViewport.start) * baseWidth;

    if (alnEndX < 0 || alnStartX > canvasWidth) return;

    const color = alignment.is_reverse ? '#f97316' : '#00d4ff';
    ctx.fillStyle = color;
    ctx.fillRect(Math.max(0, alnStartX), y, Math.min(canvasWidth, alnEndX - alnStartX), height);

    let refPos = alignment.reference_start;
    let queryPos = 0;

    for (let opIndex = 0; opIndex < alignment.cigar.length; opIndex++) {
      if (isUnmountedRef.current) return;
      
      const op = alignment.cigar[opIndex];
      const opX = (refPos - currentViewport.start) * baseWidth;
      const opWidth = op.length * baseWidth;

      if (opX + opWidth < 0) {
        if (op.type === 'M' || op.type === '=' || op.type === 'X') {
          refPos += op.length;
          queryPos += op.length;
        } else if (op.type === 'I' || op.type === 'S' || op.type === 'H') {
          queryPos += op.length;
        } else if (op.type === 'D' || op.type === 'N') {
          refPos += op.length;
        }
        continue;
      }
      if (opX > canvasWidth) break;

      if (op.type === 'I') {
        ctx.fillStyle = '#a855f7';
        ctx.fillRect(Math.max(0, opX), y - 3, Math.min(canvasWidth - opX, Math.max(2, opWidth)), height + 6);
        queryPos += op.length;
      } else if (op.type === 'D') {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(Math.max(0, opX), y + height / 2 - 2, Math.min(canvasWidth - opX, Math.max(2, opWidth)), 4);
        refPos += op.length;
      } else if (op.type === 'M' || op.type === '=' || op.type === 'X') {
        refPos += op.length;
        queryPos += op.length;
      } else if (op.type === 'S' || op.type === 'H') {
        queryPos += op.length;
      } else if (op.type === 'N') {
        refPos += op.length;
      }
    }

    if (alignment.mismatches && baseWidth > 3) {
      for (let i = 0; i < alignment.mismatches.length; i++) {
        if (isUnmountedRef.current) return;
        
        const mismatch = alignment.mismatches[i];
        const mmPos = alignment.reference_start + mismatch.pos;
        if (mmPos >= currentViewport.start && mmPos < currentViewport.end) {
          const mmX = (mmPos - currentViewport.start) * baseWidth;
          if (mmX >= 0 && mmX < canvasWidth) {
            if (mismatch.type === 'mismatch') {
              ctx.fillStyle = '#fbbf24';
              ctx.fillRect(mmX, y, Math.max(2, baseWidth), height);
            }
          }
        }
      }
    }

    if (baseWidth > 10 && alignment.query_sequence) {
      ctx.fillStyle = '#fff';
      ctx.font = '8px monospace';
      let qPos = 0;
      let rPos = alignment.reference_start;
      
      for (let opIndex = 0; opIndex < alignment.cigar.length; opIndex++) {
        if (isUnmountedRef.current) return;
        
        const op = alignment.cigar[opIndex];
        if (op.type === 'M' || op.type === '=' || op.type === 'X') {
          for (let i = 0; i < op.length; i++) {
            const x = (rPos + i - currentViewport.start) * baseWidth;
            if (x >= 0 && x < canvasWidth && qPos + i < alignment.query_sequence.length) {
              ctx.fillText(alignment.query_sequence[qPos + i], x + 1, y + height - 3);
            }
          }
          rPos += op.length;
          qPos += op.length;
        } else if (op.type === 'I') {
          qPos += op.length;
        } else if (op.type === 'D' || op.type === 'N') {
          rPos += op.length;
        } else if (op.type === 'S' || op.type === 'H') {
          qPos += op.length;
        }
      }
    }
  }, []);

  const renderCanvas = useCallback(() => {
    if (isUnmountedRef.current || isRenderingRef.current) return;
    
    const canvas = canvasRef.current;
    if (!canvas || !referenceSequence) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    isRenderingRef.current = true;

    try {
      const width = canvas.width;
      const height = canvas.height;
      const currentViewport = pendingViewportRef.current || viewport;
      const viewWidth = currentViewport.end - currentViewport.start;

      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, width, height);

      const baseWidth = width / viewWidth;
      const trackHeight = 20;
      const refTrackY = 30;
      const readsStartY = refTrackY + 40;

      ctx.fillStyle = '#16213e';
      ctx.fillRect(0, refTrackY - 15, width, trackHeight + 10);

      ctx.fillStyle = '#888';
      ctx.font = '10px sans-serif';
      ctx.fillText('Reference', 5, refTrackY - 5);

      const startIdx = Math.max(0, Math.floor(currentViewport.start));
      const endIdx = Math.min(refLength, Math.ceil(currentViewport.end));
      
      for (let i = startIdx; i < endIdx; i++) {
        if (isUnmountedRef.current) return;
        const x = (i - currentViewport.start) * baseWidth;
        if (x > width) break;
        if (x + baseWidth < 0) continue;

        const base = referenceSequence[i];

        if (baseWidth > 5) {
          ctx.fillStyle = BASE_COLORS[base] || '#9ca3af';
          if (baseWidth > 10) {
            ctx.font = '10px monospace';
            ctx.fillText(base, x + 2, refTrackY + trackHeight - 5);
          } else {
            ctx.fillRect(x, refTrackY, Math.max(1, baseWidth - 1), trackHeight);
          }
        }
      }

      if (viewWidth > 5) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        const logValue = Math.log10(viewWidth / 5);
        const step = Math.pow(10, Math.floor(logValue));
        const startPos = Math.ceil(currentViewport.start / step) * step;
        
        for (let pos = startPos; pos < currentViewport.end; pos += step) {
          if (isUnmountedRef.current) return;
          const x = (pos - currentViewport.start) * baseWidth;
          if (x > width) break;
          if (x < 0) continue;
          
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
          
          ctx.fillStyle = '#666';
          ctx.font = '9px sans-serif';
          ctx.fillText(pos.toString(), x + 2, 15);
        }
      }

      for (let rowIndex = 0; rowIndex < visibleAlignments.length; rowIndex++) {
        if (isUnmountedRef.current) return;
        const alignment = visibleAlignments[rowIndex];
        const y = readsStartY + rowIndex * (trackHeight + 5);
        drawAlignment(ctx, alignment, y, trackHeight, baseWidth, currentViewport, width);
      }
    } finally {
      isRenderingRef.current = false;
    }
  }, [referenceSequence, viewport, visibleAlignments, refLength, drawAlignment]);

  const scheduleRender = useCallback(() => {
    if (isUnmountedRef.current) return;
    
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(() => {
      if (!isUnmountedRef.current) {
        renderCanvas();
        animationFrameRef.current = null;
      }
    });
  }, [renderCanvas]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    if (wheelTimeoutRef.current !== null) {
      clearTimeout(wheelTimeoutRef.current);
    }

    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.1, Math.min(10, viewport.zoom * delta));
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const width = rect.width;
    const viewWidth = viewport.end - viewport.start;
    const mousePos = viewport.start + (mouseX / width) * viewWidth;
    
    const newViewWidth = viewWidth * delta;
    const newStart = mousePos - (mousePos - viewport.start) * delta;
    const newEnd = newStart + newViewWidth;
    
    const clampedStart = Math.max(0, newStart);
    const clampedEnd = Math.min(refLength, newEnd);
    
    pendingViewportRef.current = {
      start: clampedStart,
      end: clampedEnd,
      zoom: newZoom
    };

    setViewport(pendingViewportRef.current);
    scheduleRender();

    wheelTimeoutRef.current = setTimeout(() => {
      pendingViewportRef.current = null;
    }, 150);
  }, [viewport, refLength, scheduleRender]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastXRef.current = e.clientX;
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const dx = e.clientX - lastXRef.current;
    const width = (e.currentTarget as HTMLElement).clientWidth;
    const viewWidth = viewport.end - viewport.start;
    const shift = (dx / width) * viewWidth;
    
    const newStart = Math.max(0, viewport.start - shift);
    const newEnd = Math.min(refLength, viewport.end - shift);
    
    const newViewport = {
      start: newStart,
      end: newEnd,
      zoom: viewport.zoom
    };
    
    pendingViewportRef.current = newViewport;
    setViewport(newViewport);
    scheduleRender();
    
    lastXRef.current = e.clientX;
  }, [isDragging, viewport, refLength, scheduleRender]);

  const handleMouseUp = () => {
    setIsDragging(false);
    pendingViewportRef.current = null;
  };

  const zoomIn = () => {
    const center = (viewport.start + viewport.end) / 2;
    const newWidth = (viewport.end - viewport.start) * 0.5;
    const newViewport = {
      start: Math.max(0, center - newWidth / 2),
      end: Math.min(refLength, center + newWidth / 2),
      zoom: viewport.zoom * 2
    };
    setViewport(newViewport);
  };

  const zoomOut = () => {
    const center = (viewport.start + viewport.end) / 2;
    const newWidth = (viewport.end - viewport.start) * 2;
    const newViewport = {
      start: Math.max(0, center - newWidth / 2),
      end: Math.min(refLength, center + newWidth / 2),
      zoom: viewport.zoom * 0.5
    };
    setViewport(newViewport);
  };

  const resetView = () => {
    setViewport({ start: 0, end: Math.min(1000, refLength), zoom: 1 });
  };

  useEffect(() => {
    isUnmountedRef.current = false;

    return () => {
      isUnmountedRef.current = true;
      
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      if (wheelTimeoutRef.current !== null) {
        clearTimeout(wheelTimeoutRef.current);
        wheelTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      if (resizeTimeout !== null) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        if (!isUnmountedRef.current) {
          canvas.width = container.clientWidth;
          canvas.height = Math.max(400, 100 + visibleAlignments.length * 25);
          scheduleRender();
        }
      }, 100);
    };

    canvas.width = container.clientWidth;
    canvas.height = Math.max(400, 100 + visibleAlignments.length * 25);
    scheduleRender();

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout !== null) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [visibleAlignments.length, scheduleRender]);

  useEffect(() => {
    if (!pendingViewportRef.current) {
      scheduleRender();
    }
  }, [viewport, scheduleRender]);

  return (
    <section className="browser-section">
      <h2 style={{ marginBottom: '1rem', color: '#00d4ff' }}>
        Alignment Viewer - {firstRefName}
      </h2>

      <div className="stats-section">
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{alignmentResult.total_reads}</div>
            <div className="stat-label">Aligned Reads</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{refLength.toLocaleString()}</div>
            <div className="stat-label">Reference Length</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{visibleAlignments.length}</div>
            <div className="stat-label">Visible Reads</div>
          </div>
        </div>
      </div>

      <div className="browser-controls">
        <button onClick={zoomIn} className="control-button">Zoom In +</button>
        <button onClick={zoomOut} className="control-button">Zoom Out -</button>
        <button onClick={resetView} className="control-button">Reset View</button>
        <span className="zoom-info">
          View: {Math.round(viewport.start)} - {Math.round(viewport.end)} | Zoom: {viewport.zoom.toFixed(2)}x
        </span>
      </div>

      <div className="canvas-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="genome-canvas"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      <div className="legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#00d4ff' }}></div>
          <span>Forward Strand</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#f97316' }}></div>
          <span>Reverse Strand</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#a855f7' }}></div>
          <span>Insertion</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#ef4444' }}></div>
          <span>Deletion</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#fbbf24' }}></div>
          <span>Mismatch</span>
        </div>
      </div>
    </section>
  );
};

export default GenomeBrowser;
