import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { usePerformance } from '../contexts/PerformanceContext';

interface AdaptiveLODProps {
  children: React.ReactNode;
  position: [number, number, number];
  scale?: number;
  onQualityChange?: (quality: number) => void;
}

export function AdaptiveLOD({
  children,
  position,
  scale = 1,
  onQualityChange,
}: AdaptiveLODProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { metrics, qualityLevel, isVRMode } = usePerformance();
  const [lodLevel, setLodLevel] = useState(0);
  const lastAdjustment = useRef(0);
  const targetFPS = isVRMode ? 72 : 60;

  const getLODDistances = useCallback(() => {
    const baseMultiplier = qualityLevel === 'low' ? 0.7 : qualityLevel === 'high' ? 1.5 : 1;
    return {
      high: 3 * baseMultiplier,
      medium: 8 * baseMultiplier,
      low: 15 * baseMultiplier,
    };
  }, [qualityLevel]);

  useFrame(({ camera }, delta) => {
    if (!groupRef.current) return;

    const now = performance.now();
    if (now - lastAdjustment.current > 2000) {
      lastAdjustment.current = now;

      if (metrics.fps < targetFPS * 0.7) {
        setLodLevel(prev => Math.min(prev + 1, 2));
      } else if (metrics.fps > targetFPS * 1.1) {
        setLodLevel(prev => Math.max(prev - 1, 0));
      }
    }

    const distance = camera.position.distanceTo(groupRef.current.position);
    const distances = getLODDistances();
    
    let distanceBasedLevel = 0;
    if (distance >= distances.medium) distanceBasedLevel = 1;
    if (distance >= distances.low) distanceBasedLevel = 2;

    const finalLevel = Math.max(lodLevel, distanceBasedLevel);
    onQualityChange?.(finalLevel);
  });

  const renderLevel = (level: number) => {
    const opacity = level === lodLevel ? 1 : 0;
    
    return (
      <group key={level} visible={level === lodLevel}>
        {level === 0 ? (
          <group opacity={opacity}>
            {children}
          </group>
        ) : level === 1 ? (
          <mesh>
            <boxGeometry args={[0.8, 1.2, 0.8, 4, 4, 4]} />
            <meshStandardMaterial color="#CD853F" flatShading />
          </mesh>
        ) : (
          <mesh>
            <boxGeometry args={[0.8, 1.2, 0.8, 2, 2, 2]} />
            <meshBasicMaterial color="#CD853F" wireframe={qualityLevel === 'low'} />
          </mesh>
        )}
      </group>
    );
  };

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {[0, 1, 2].map(renderLevel)}
    </group>
  );
}
