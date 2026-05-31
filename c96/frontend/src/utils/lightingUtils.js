export const calculateSunPosition = (elevation, azimuth) => {
  const phi = (90 - elevation) * (Math.PI / 180);
  const theta = azimuth * (Math.PI / 180);
  const x = Math.sin(phi) * Math.cos(theta);
  const y = Math.cos(phi);
  const z = Math.sin(phi) * Math.sin(theta);
  return { x, y, z };
};

export const getTimeBasedSunColor = (timeOfDay) => {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  
  if (totalMinutes < 360) {
    return { color: '#1a1a3a', intensity: 0.1 };
  } else if (totalMinutes < 480) {
    return { color: '#ff7e5f', intensity: 0.5 };
  } else if (totalMinutes < 720) {
    return { color: '#fff5e6', intensity: 1.0 };
  } else if (totalMinutes < 1020) {
    return { color: '#ffd4a3', intensity: 0.7 };
  } else {
    return { color: '#1a1a3a', intensity: 0.1 };
  }
};

export const getSunElevationFromTime = (timeOfDay) => {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const totalHours = hours + minutes / 60;
  
  if (totalHours < 6 || totalHours > 18) {
    return 0;
  }
  
  const normalizedTime = (totalHours - 6) / 12;
  return Math.sin(normalizedTime * Math.PI) * 90;
};

export const getDefaultLightingConfig = (floorPlanId) => ({
  name: '默认配置',
  floorPlanId,
  sunLight: {
    enabled: true,
    intensity: 1.0,
    color: '#ffffff',
    elevation: 45,
    azimuth: 180,
    timeOfDay: '12:00'
  },
  ambientLight: {
    enabled: true,
    intensity: 0.3,
    color: '#ffffff'
  },
  indoorLights: [],
  shadow: {
    enabled: true,
    quality: 'medium'
  }
});
