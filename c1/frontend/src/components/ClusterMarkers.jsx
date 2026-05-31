import React, { useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { latLngToVector3, EARTH_RADIUS, getMagnitudeColor } from '../utils/geo';

const getClusterColor = (cluster) => {
  if (cluster.maxMagnitude >= 6) return '#ef4444';
  if (cluster.maxMagnitude >= 4.5) return '#fb923c';
  if (cluster.maxMagnitude >= 3) return '#facc15';
  return '#4ade80';
};

const getClusterSize = (cluster) => {
  const baseSize = 0.08;
  const sizePerMember = 0.04;
  const magBonus = (cluster.maxMagnitude / 8) * 0.1;
  return baseSize + cluster.size * sizePerMember + magBonus;
};

function ClusterMarker({ cluster, onClick }) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef();
  const pulseRef = useRef();
  const [pulse, setPulse] = useState(0);

  const position = useMemo(() => {
    return latLngToVector3(cluster.latitude, cluster.longitude, EARTH_RADIUS * 1.03);
  }, [cluster.latitude, cluster.longitude]);

  const size = useMemo(() => getClusterSize(cluster), [cluster]);
  const color = useMemo(() => getClusterColor(cluster), [cluster]);

  const rotation = useMemo(() => {
    const up = position.clone().normalize();
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    return euler;
  }, [position]);

  useFrame((_, delta) => {
    setPulse(prev => (prev + delta * 1.5) % (Math.PI * 2));
    
    if (pulseRef.current) {
      const scale = 1 + Math.sin(pulse) * 0.15;
      pulseRef.current.scale.set(scale, scale, scale);
      pulseRef.current.material.opacity = 0.2 + Math.sin(pulse) * 0.1;
    }
  });

  const handleClick = (e) => {
    e.stopPropagation();
    onClick && onClick(cluster);
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
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <mesh
        ref={pulseRef}
        position={position}
        rotation={rotation}
      >
        <ringGeometry args={[size * 1.3, size * 1.8, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh
        ref={meshRef}
        position={position}
      >
        <sphereGeometry args={[size, 32, 32]} />
        <meshPhongMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.5 : 0.2}
          transparent
          opacity={0.85}
        />
      </mesh>

      {cluster.size > 1 && (
        <mesh position={position}>
          <sphereGeometry args={[size * 0.5, 24, 24]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.95}
          />
        </mesh>
      )}

      {hovered && (
        <mesh position={position}>
          <ringGeometry args={[size * 1.2, size * 1.5, 48]} />
          <meshBasicMaterial
            color="#ffffff"
            side={THREE.DoubleSide}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
    </group>
  );
}

function NoiseMarker({ earthquake, onClick }) {
  const position = useMemo(() => {
    return latLngToVector3(earthquake.latitude, earthquake.longitude, EARTH_RADIUS * 1.03);
  }, [earthquake]);

  return (
    <mesh
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick && onClick(earthquake);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'auto';
      }}
    >
      <sphereGeometry args={[0.05, 16, 16]} />
      <meshBasicMaterial
        color="#6b7280"
        transparent
        opacity={0.5}
      />
    </mesh>
  );
}

function ClusterMarkers({ clusters, noise, onClusterClick, onNoiseClick }) {
  return (
    <group>
      {clusters.map((cluster) => (
        <ClusterMarker
          key={cluster.id}
          cluster={cluster}
          onClick={onClusterClick}
        />
      ))}
      {noise.map((eq) => (
        <NoiseMarker
          key={eq.id}
          earthquake={eq}
          onClick={onNoiseClick}
        />
      ))}
    </group>
  );
}

export default ClusterMarkers;
