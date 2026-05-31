import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import EarthquakeMarker from './EarthquakeMarker';
import { EARTH_RADIUS, latLngToVector3 } from '../utils/geo';

function Atmosphere() {
  return (
    <mesh scale={1.15} pointerEvents="none">
      <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
      <meshBasicMaterial
        color="#4db8ff"
        transparent
        opacity={0.08}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

function GridLines() {
  const latLines = useMemo(() => {
    const lines = [];
    for (let lat = -90; lat <= 90; lat += 30) {
      const points = [];
      for (let lng = -180; lng <= 180; lng += 5) {
        points.push(latLngToVector3(lat, lng, EARTH_RADIUS));
      }
      lines.push(new THREE.BufferGeometry().setFromPoints(points));
    }
    return lines;
  }, []);

  const lngLines = useMemo(() => {
    const lines = [];
    for (let lng = -180; lng <= 180; lng += 30) {
      const points = [];
      for (let lat = -90; lat <= 90; lat += 5) {
        points.push(latLngToVector3(lat, lng, EARTH_RADIUS));
      }
      lines.push(new THREE.BufferGeometry().setFromPoints(points));
    }
    return lines;
  }, []);

  return (
    <group pointerEvents="none">
      {latLines.map((geometry, i) => (
        <line key={`lat-${i}`} geometry={geometry}>
          <lineBasicMaterial color="#334155" transparent opacity={0.3} />
        </line>
      ))}
      {lngLines.map((geometry, i) => (
        <line key={`lng-${i}`} geometry={geometry}>
          <lineBasicMaterial color="#334155" transparent opacity={0.3} />
        </line>
      ))}
    </group>
  );
}

function Earth({ children }) {
  const groupRef = useRef();

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh pointerEvents="none">
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshPhongMaterial
          color="#1e40af"
          emissive="#0f172a"
          shininess={5}
          specular="#1e3a5f"
        />
      </mesh>

      <mesh pointerEvents="none">
        <sphereGeometry args={[EARTH_RADIUS * 1.001, 64, 64]} />
        <meshPhongMaterial
          color="#166534"
          emissive="#14532d"
          transparent
          opacity={0.8}
        />
      </mesh>

      <GridLines />
      <Atmosphere />

      {children}
    </group>
  );
}

export default Earth;
