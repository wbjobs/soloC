import { useEffect, useRef } from 'react';
import { ProteinRenderer } from '../utils/proteinRenderer';
import { ProteinData } from '../types';

interface VisualizerProps {
  proteinData: ProteinData | null;
  stabilityScores: number[];
  showAtoms: boolean;
  showBackbone: boolean;
  webGPUSupported: (supported: boolean) => void;
}

export default function Visualizer({
  proteinData,
  stabilityScores,
  showAtoms,
  showBackbone,
  webGPUSupported
}: VisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ProteinRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    rendererRef.current = new ProteinRenderer({
      container: containerRef.current,
      width,
      height
    });

    webGPUSupported(rendererRef.current.getWebGPUSupport());

    const handleResize = () => {
      if (containerRef.current && rendererRef.current) {
        rendererRef.current.resize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [webGPUSupported]);

  useEffect(() => {
    if (proteinData && rendererRef.current) {
      rendererRef.current.renderProtein(
        proteinData,
        stabilityScores,
        showAtoms,
        showBackbone
      );
    }
  }, [proteinData, stabilityScores, showAtoms, showBackbone]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}
    />
  );
}
