import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface AvatarProps {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  username: string;
  color?: string;
  isLocal?: boolean;
}

export function Avatar({
  position,
  rotation,
  username,
  color = '#4CAF50',
  isLocal = false,
}: AvatarProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.set(position.x, position.y, position.z);
      groupRef.current.rotation.set(rotation.x, rotation.y, rotation.z);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <capsuleGeometry args={[0.25, 0.8, 8, 16]} />
        <meshStandardMaterial color={color} transparent opacity={isLocal ? 0 : 0.8} />
      </mesh>

      <mesh position={[0, 1.2, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color={color} transparent opacity={isLocal ? 0 : 0.8} />
      </mesh>

      {!isLocal && (
        <Text
          position={[0, 1.6, 0]}
          fontSize={0.15}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {username}
        </Text>
      )}

      <mesh position={[0, 0.05, -0.15]}>
        <coneGeometry args={[0.08, 0.15, 8]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
    </group>
  );
}

interface PointerLineProps {
  start: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  color?: string;
}

export function PointerLine({ start, direction, color = '#FF0000' }: PointerLineProps) {
  const points = [
    new THREE.Vector3(start.x, start.y, start.z),
    new THREE.Vector3(
      start.x + direction.x * 5,
      start.y + direction.y * 5,
      start.z + direction.z * 5
    ),
  ];

  const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);

  return (
    <line geometry={lineGeometry}>
      <lineBasicMaterial color={color} linewidth={2} />
    </line>
  );
}
