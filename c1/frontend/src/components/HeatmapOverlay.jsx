import React, { useMemo } from 'react';
import * as THREE from 'three';
import { latLngToVector3, EARTH_RADIUS, getMagnitudeColor } from '../utils/geo';

const toRad = (deg) => (deg * Math.PI) / 180;

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const heatColor = (intensity) => {
  if (intensity < 0.2) return `rgba(0, 255, 100, ${intensity * 0.8})`;
  if (intensity < 0.4) return `rgba(150, 255, 0, ${intensity * 0.9})`;
  if (intensity < 0.6) return `rgba(255, 255, 0, ${intensity})`;
  if (intensity < 0.8) return `rgba(255, 150, 0, ${intensity})`;
  return `rgba(255, 50, 0, ${Math.min(intensity * 1.2, 0.95)})`;
};

const generateHeatmapPoints = (earthquakes, gridSize = 6) => {
  const points = [];
  const searchRadius = 800;
  
  for (let lat = -90 + gridSize / 2; lat <= 90; lat += gridSize) {
    for (let lng = -180 + gridSize / 2; lng <= 180; lng += gridSize) {
      let intensity = 0;
      
      earthquakes.forEach(eq => {
        const dist = haversineDistance(lat, lng, eq.latitude, eq.longitude);
        if (dist < searchRadius) {
          const normalizedDist = dist / searchRadius;
          const decay = Math.exp(-normalizedDist * 3);
          const magContribution = (eq.magnitude / 8) * decay;
          intensity += magContribution;
        }
      });
      
      if (intensity > 0.05) {
        points.push({
          latitude: lat,
          longitude: lng,
          intensity: Math.min(intensity, 1)
        });
      }
    }
  }
  
  return points;
};

function HeatmapOverlay({ earthquakes }) {
  const heatPoints = useMemo(() => {
    const recentEqs = earthquakes.filter(eq => {
      const now = new Date();
      const eqTime = new Date(eq.time);
      const diffHours = (now - eqTime) / (1000 * 60 * 60);
      return diffHours <= 1;
    });
    
    return generateHeatmapPoints(recentEqs, 5);
  }, [earthquakes]);

  return (
    <group>
      {heatPoints.map((point, index) => {
        const position = latLngToVector3(point.latitude, point.longitude, EARTH_RADIUS * 1.02);
        const color = heatColor(point.intensity);
        const size = 0.08 + point.intensity * 0.15;
        
        return (
          <mesh key={`heat-${index}`} position={position} pointerEvents="none">
            <sphereGeometry args={[size, 12, 12]} />
            <meshBasicMaterial
              color={new THREE.Color(color)}
              transparent
              opacity={point.intensity * 0.8}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        );
      })}
      
      {earthquakes
        .filter(eq => {
          const now = new Date();
          const eqTime = new Date(eq.time);
          const diffHours = (now - eqTime) / (1000 * 60 * 60);
          return diffHours <= 1;
        })
        .map((eq, index) => {
          const position = latLngToVector3(eq.latitude, eq.longitude, EARTH_RADIUS * 1.05);
          const size = 0.04 + (eq.magnitude / 8) * 0.08;
          
          return (
            <group key={`epicenter-${index}`}>
              <mesh position={position} pointerEvents="none">
                <sphereGeometry args={[size, 16, 16]} />
                <meshBasicMaterial
                  color={getMagnitudeColor(eq.magnitude)}
                  transparent
                  opacity={0.9}
                />
              </mesh>
              <mesh position={position} pointerEvents="none">
                <ringGeometry args={[size * 1.5, size * 2.5, 24]} />
                <meshBasicMaterial
                  color={getMagnitudeColor(eq.magnitude)}
                  transparent
                  opacity={0.4}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          );
        })}
    </group>
  );
}

export default HeatmapOverlay;
