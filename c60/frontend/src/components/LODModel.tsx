import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface LODLevel {
  distance: number;
  geometry?: THREE.BufferGeometry;
  url?: string;
  simplified?: boolean;
}

interface LODModelProps {
  position: [number, number, number];
  scale?: number;
  lodLevels: LODLevel[];
  children?: React.ReactNode;
  onLODChange?: (level: number) => void;
}

export function LODModel({ 
  position, 
  scale = 1, 
  lodLevels, 
  children,
  onLODChange 
}: LODModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [currentLOD, setCurrentLOD] = useState(0);
  const lastUpdate = useRef(0);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    lastUpdate.current += delta;
    if (lastUpdate.current < 0.1) return;
    lastUpdate.current = 0;

    const distance = camera.position.distanceTo(groupRef.current.position);
    
    let newLOD = 0;
    for (let i = lodLevels.length - 1; i >= 0; i--) {
      if (distance >= lodLevels[i].distance) {
        newLOD = i;
        break;
      }
    }

    if (newLOD !== currentLOD) {
      setCurrentLOD(newLOD);
      onLODChange?.(newLOD);
    }
  });

  const renderLODLevel = (level: number) => {
    const lod = lodLevels[level];
    const isVisible = level === currentLOD;

    return (
      <group key={level} visible={isVisible}>
        {lod.simplified ? (
          <mesh>
            <boxGeometry args={[0.8, 1.2, 0.8]} />
            <meshStandardMaterial color="#CD853F" flatShading />
          </mesh>
        ) : (
          children
        )}
      </group>
    );
  };

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {lodLevels.map((_, index) => renderLODLevel(index))}
    </group>
  );
}
