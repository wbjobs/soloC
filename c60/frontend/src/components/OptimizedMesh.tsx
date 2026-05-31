import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { usePerformance } from '../contexts/PerformanceContext';

interface OptimizedMeshProps {
  position?: [number, number, number];
  scale?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  children: React.ReactNode;
  enableFrustumCulling?: boolean;
}

export function OptimizedMesh({
  position = [0, 0, 0],
  scale = 1,
  castShadow = true,
  receiveShadow = false,
  children,
  enableFrustumCulling = true,
}: OptimizedMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { qualityLevel, isVRMode } = usePerformance();

  const lodBias = useMemo(() => {
    if (isVRMode) return -1;
    switch (qualityLevel) {
      case 'low': return -1;
      case 'medium': return 0;
      case 'high': return 1;
      default: return 0;
    }
  }, [qualityLevel, isVRMode]);

  useFrame(() => {
    if (meshRef.current) {
      if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
        const material = meshRef.current.material;
        if (isVRMode || qualityLevel === 'low') {
          material.roughness = Math.min(material.roughness + 0.2, 1);
          material.metalness = Math.max(material.metalness - 0.2, 0);
        }
      }
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      scale={scale}
      castShadow={castShadow && qualityLevel !== 'low'}
      receiveShadow={receiveShadow && qualityLevel !== 'low'}
      frustumCulled={enableFrustumCulling}
    >
      {children}
    </mesh>
  );
}

interface InstancedArtifactsProps {
  positions: { x: number; y: number; z: number }[];
  scales?: number[];
  colors?: string[];
}

export function InstancedArtifacts({
  positions,
  scales = [],
  colors = [],
}: InstancedArtifactsProps) {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { qualityLevel } = usePerformance();

  const segments = useMemo(() => {
    switch (qualityLevel) {
      case 'low': return 4;
      case 'medium': return 8;
      case 'high': return 16;
      default: return 8;
    }
  }, [qualityLevel]);

  useMemo(() => {
    if (!instancedMeshRef.current) return;

    positions.forEach((pos, i) => {
      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.scale.setScalar(scales[i] || 1);
      dummy.updateMatrix();
      instancedMeshRef.current!.setMatrixAt(i, dummy.matrix);

      if (colors[i]) {
        const color = new THREE.Color(colors[i]);
        instancedMeshRef.current!.setColorAt(i, color);
      }
    });

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    if (instancedMeshRef.current.instanceColor) {
      instancedMeshRef.current.instanceColor.needsUpdate = true;
    }
  }, [positions, scales, colors, dummy]);

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[undefined, undefined, positions.length]}
      castShadow={qualityLevel !== 'low'}
    >
      <boxGeometry args={[0.8, 1.2, 0.8, segments, segments, segments]} />
      <meshStandardMaterial color="#CD853F" />
    </instancedMesh>
  );
}
