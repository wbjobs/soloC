import React, { useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

function EarthquakeMarker({ marker, onClick }) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef();
  const glowRef = useRef();
  const [pulse, setPulse] = useState(0);

  const height = marker.height;
  const cylinderRadius = 0.05;
  const hitAreaRadius = 0.15;

  const surfacePos = useMemo(() => {
    return marker.position.clone();
  }, [marker.position]);

  const topPosition = useMemo(() => {
    const dir = marker.position.clone().normalize();
    const offset = dir.clone().multiplyScalar(height);
    return marker.position.clone().add(offset);
  }, [marker.position, height]);

  const rotation = useMemo(() => {
    const up = marker.position.clone().normalize();
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    return euler;
  }, [marker.position]);

  const midPosition = useMemo(() => {
    const dir = marker.position.clone().normalize();
    const offset = dir.clone().multiplyScalar(height / 2);
    return marker.position.clone().add(offset);
  }, [marker.position, height]);

  useFrame((_, delta) => {
    setPulse(prev => (prev + delta * 2) % (Math.PI * 2));
    
    if (glowRef.current) {
      const scale = 1 + Math.sin(pulse) * 0.3;
      glowRef.current.scale.set(scale, scale, scale);
      glowRef.current.material.opacity = 0.35 + Math.sin(pulse) * 0.15;
    }
  });

  const handleClick = (e) => {
    e.stopPropagation();
    onClick();
  };

  const handlePointerOver = (e) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = (e) => {
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = 'auto';
  };

  return (
    <group 
      ref={groupRef}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <mesh
        position={midPosition}
        rotation={rotation}
      >
        <cylinderGeometry args={[cylinderRadius, cylinderRadius * 1.3, height, 12]} />
        <meshPhongMaterial
          color={marker.color}
          emissive={marker.color}
          emissiveIntensity={hovered ? 0.6 : 0.25}
          shininess={120}
          transparent
          opacity={0.95}
        />
      </mesh>

      <mesh
        ref={glowRef}
        position={surfacePos}
      >
        <sphereGeometry args={[0.1, 24, 24]} />
        <meshBasicMaterial
          color={marker.color}
          transparent
          opacity={0.4}
        />
      </mesh>

      <mesh
        position={surfacePos}
      >
        <sphereGeometry args={[hitAreaRadius, 16, 16]} />
        <meshBasicMaterial
          color={marker.color}
          transparent
          opacity={hovered ? 0.25 : 0}
        />
      </mesh>

      {hovered && (
        <group position={surfacePos}>
          <mesh>
            <ringGeometry args={[hitAreaRadius * 1.2, hitAreaRadius * 1.5, 48]} />
            <meshBasicMaterial
              color="#ffffff"
              side={THREE.DoubleSide}
              transparent
              opacity={0.8}
            />
          </mesh>
          <mesh>
            <ringGeometry args={[hitAreaRadius * 1.6, hitAreaRadius * 1.8, 48]} />
            <meshBasicMaterial
              color={marker.color}
              side={THREE.DoubleSide}
              transparent
              opacity={0.5}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

export default EarthquakeMarker;
