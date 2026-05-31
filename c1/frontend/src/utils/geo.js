import * as THREE from 'three';

export const EARTH_RADIUS = 2;

export const latLngToVector3 = (lat, lng, radius) => {
  const latRad = (parseFloat(lat) * Math.PI) / 180;
  const lngRad = (parseFloat(lng) * Math.PI) / 180;

  const x = -radius * Math.cos(latRad) * Math.cos(lngRad);
  const z = radius * Math.cos(latRad) * Math.sin(lngRad);
  const y = radius * Math.sin(latRad);

  return new THREE.Vector3(x, y, z);
};

export const getMagnitudeColor = (magnitude) => {
  const mag = parseFloat(magnitude);
  if (mag < 2) return '#4ade80';
  if (mag < 4) return '#facc15';
  if (mag < 6) return '#fb923c';
  return '#ef4444';
};

export const getMagnitudeHeight = (magnitude) => {
  const mag = parseFloat(magnitude);
  const minHeight = 0.15;
  const maxHeight = 0.9;
  const normalizedMag = Math.min(Math.max(mag - 1, 0), 7);
  return minHeight + (normalizedMag / 7) * (maxHeight - minHeight);
};

export const getMagnitudeLabel = (magnitude) => {
  const mag = parseFloat(magnitude);
  if (mag < 2) return 'Minor';
  if (mag < 4) return 'Light';
  if (mag < 6) return 'Moderate';
  if (mag < 7) return 'Strong';
  return 'Major';
};

export const formatTime = (timeStr) => {
  const date = new Date(timeStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

export const formatTimeAgo = (timeStr) => {
  const now = new Date();
  const past = new Date(timeStr);
  const diffMs = now - past;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  return `${diffDays} 天前`;
};

export const normalizeEarthquake = (data) => {
  return {
    ...data,
    magnitude: parseFloat(data.magnitude) || 0,
    latitude: parseFloat(data.latitude) || 0,
    longitude: parseFloat(data.longitude) || 0,
    depth: parseFloat(data.depth) || 0
  };
};
