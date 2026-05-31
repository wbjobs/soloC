import * as THREE from 'three';

export const TIME_SLOTS = [
  { hour: 6, label: '06:00', sunAltitude: 5 },
  { hour: 8, label: '08:00', sunAltitude: 20 },
  { hour: 10, label: '10:00', sunAltitude: 40 },
  { hour: 12, label: '12:00', sunAltitude: 65 },
  { hour: 14, label: '14:00', sunAltitude: 60 },
  { hour: 16, label: '16:00', sunAltitude: 35 },
  { hour: 18, label: '18:00', sunAltitude: 15 },
];

export const SEASON_PRESETS = {
  spring: { name: '春分/秋分', solarDeclination: 0, dayLength: 12 },
  summer: { name: '夏至', solarDeclination: 23.5, dayLength: 14.5 },
  winter: { name: '冬至', solarDeclination: -23.5, dayLength: 9.5 },
};

export function calculateSunDirection(hour, dayOfYear = 172, latitude = 39.9) {
  const declination = 23.45 * Math.sin((2 * Math.PI * (284 + dayOfYear) / 365);
  const hourAngle = (hour - 12) * 15;
  
  const latRad = latitude * Math.PI / 180;
  const decRad = declination * Math.PI / 180;
  const haRad = hourAngle * Math.PI / 180;
  
  const sinAltitude = Math.sin(latRad) * Math.sin(decRad) + 
                      Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const altitude = Math.asin(sinAltitude) * 180 / Math.PI;
  
  const cosAzimuth = (Math.sin(decRad) - Math.sin(latRad) * sinAltitude) / 
                   (Math.cos(latRad) * Math.sqrt(1 - sinAltitude * sinAltitude));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) * 180 / Math.PI;
  
  if (hour > 12) azimuth = 360 - azimuth;
  
  return { altitude, azimuth, hour };
}

export function analyzeRoomDaylight(roomPosition, roomSize, config, season = 'summer') {
  const results = [];
  const seasonData = SEASON_PRESETS[season];
  let totalSunlightHours = 0;
  let directSunlightCount = 0;
  
  TIME_SLOTS.forEach((slot, index) => {
    const sunPos = calculateSunDirection(slot.hour);
    const sunAltitude = sunPos.altitude;
    
    const windowExposure = calculateWindowExposure(
      roomPosition, 
      roomSize, 
      sunAltitude,
      sunPos.azimuth,
      config
    );
    
    const isInDirectSunlight = windowExposure > 0.3;
    
    if (isInDirectSunlight) {
      const duration = index < TIME_SLOTS.length - 1 ? 2 : 0;
      totalSunlightHours += duration * windowExposure;
      directSunlightCount++;
    }
    
    results.push({
      time: slot.label,
      hour: slot.hour,
      sunAltitude: sunAltitude.toFixed(1),
      exposure: windowExposure,
      hasDirectSunlight: isInDirectSunlight,
      irradiance: calculateIrradiance(sunAltitude, windowExposure)
    });
  });
  
  const avgIrradiance = results.reduce((sum, r) => sum + r.irradiance, 0) / results.length;
  
  let daylightLevel = totalSunlightHours >= 8 ? 'excellent' : 
                      totalSunlightHours >= 5 ? 'good' :
                      totalSunlightHours >= 3 ? 'fair' : 'poor';
  
  return {
    roomId: roomPosition.id || 'room',
    roomName: roomPosition.name || '房间',
    season: seasonData.name,
    totalSunlightHours: totalSunlightHours.toFixed(1),
    directSunlightSlots: directSunlightCount,
    avgIrradiance: avgIrradiance.toFixed(0),
    daylightLevel,
    hourlyData: results,
    recommendations: generateRecommendations(totalSunlightHours, avgIrradiance)
  };
}

function calculateWindowExposure(roomPos, roomSize, sunAltitude, sunAzimuth, config) {
  if (sunAltitude <= 0) return 0;
  
  const windowNormal = roomPos.windowNormal || { x: 0, z: 1 };
  const sunDir = {
    x: Math.sin(sunAzimuth * Math.PI / 180) * Math.cos(sunAltitude * Math.PI / 180),
    z: Math.cos(sunAzimuth * Math.PI / 180) * Math.cos(sunAltitude * Math.PI / 180),
    y: Math.sin(sunAltitude * Math.PI / 180)
  };
  
  const dotProduct = windowNormal.x * sunDir.x + windowNormal.z * sunDir.z;
  const windowFactor = Math.max(0, dotProduct);
  
  const altitudeFactor = Math.sin(sunAltitude * Math.PI / 180);
  const obstructionFactor = 1 - (roomPos.obstruction || 0.3);
  
  return windowFactor * altitudeFactor * obstructionFactor * (roomPos.windowAreaFactor || 0.8;
}

function calculateIrradiance(sunAltitude, windowExposure) {
  const maxIrradiance = 1000;
  const altitudeFactor = Math.sin(sunAltitude * Math.PI / 180);
  return maxIrradiance * altitudeFactor * windowExposure;
}

function generateRecommendations(sunlightHours, avgIrradiance) {
  const recommendations = [];
  
  if (sunlightHours < 3) {
    recommendations.push({ type: 'warning', text: '日照时间较短，建议增加人工照明或优化窗户设计' });
    recommendations.push({ type: 'suggestion', text: '考虑使用浅色内饰增强自然光线反射' });
  } else if (sunlightHours < 5) {
    recommendations.push({ type: 'info', text: '日照时间适中，可适当增加南向窗户面积' });
  } else {
    recommendations.push({ type: 'success', text: '采光条件良好，适合日常居住' });
  }
  
  if (avgIrradiance > 500) {
    recommendations.push({ type: 'warning', text: '夏季可能存在过热问题，建议考虑遮阳措施' });
  }
  
  return recommendations;
}

export function generateDaylightReport(rooms, config, season = 'summer') {
  const roomAnalyses = rooms.map(room => 
    analyzeRoomDaylight(room.position, room.size, config, season)
  );
  
  const avgSunlightHours = roomAnalyses.reduce((sum, r) => sum + parseFloat(r.totalSunlightHours), 0) / roomAnalyses.length;
  
  const avgIrradiance = roomAnalyses.reduce((sum, r) => sum + parseFloat(r.avgIrradiance), 0) / roomAnalyses.length;
  
  const excellentCount = roomAnalyses.filter(r => r.daylightLevel === 'excellent').length;
  const goodCount = roomAnalyses.filter(r => r.daylightLevel === 'good').length;
  const fairCount = roomAnalyses.filter(r => r.daylightLevel === 'fair').length;
  const poorCount = roomAnalyses.filter(r => r.daylightLevel === 'poor').length;
  
  const overallScore = Math.round((excellentCount * 100 + goodCount * 75 + fairCount * 50 + poorCount * 25) / roomAnalyses.length);
  
  let overallLevel = 'poor';
  if (overallScore >= 80) overallLevel = 'excellent';
  else if (overallScore >= 60) overallLevel = 'good';
  else if (overallScore >= 40) overallLevel = 'fair';
  
  return {
    generatedAt: new Date().toISOString(),
    season: SEASON_PRESETS[season].name,
    overallScore,
    overallLevel,
    summary: {
      totalRooms: roomAnalyses.length,
      avgSunlightHours: avgSunlightHours.toFixed(1),
      avgIrradiance: Math.round(avgIrradiance),
      excellentCount,
      goodCount,
      fairCount,
      poorCount,
    },
    rooms: roomAnalyses,
    overallRecommendations: generateOverallRecommendations(overallScore, avgSunlightHours, roomAnalyses)
  };
}

function generateOverallRecommendations(score, avgHours, roomAnalyses) {
  const recommendations = [];
  
  const poorRooms = roomAnalyses.filter(r => r.daylightLevel === 'poor');
  
  if (score >= 80) {
    recommendations.push({
      type: 'success',
      title: '整体采光优秀',
      text: '该户型采光设计优良，自然光线充足'
    });
  } else if (score >= 60) {
    recommendations.push({
      type: 'info',
      title: '整体采光良好',
      text: '大部分房间采光正常，部分区域可进一步优化'
    });
  } else {
    recommendations.push({
      type: 'warning',
      title: '采光需要改进',
      text: '建议重新规划开窗位置，增加南向窗户面积'
    });
  }
  
  if (poorRooms.length > 0) {
    recommendations.push({
      type: 'warning',
      title: `${poorRooms.length} 个房间采光不足',
      text: `建议重点改进: ${poorRooms.map(r => r.roomName).join(', ')}`
    });
  }
  
  if (avgHours > 6) {
    recommendations.push({
      type: 'suggestion',
      title: '节能建议',
      text: '充分日照充足，可考虑太阳能利用自然采光减少人工照明能耗'
    });
  }
  
  return recommendations;
}

export function getDaylightLevelInfo(level) {
  const levels = {
    excellent: { label: '优秀', color: '#52c41a', description: '采光非常充足' },
    good: { label: '良好', color: '#1890ff', description: '采光条件良好' },
    fair: { label: '一般', color: '#faad14', description: '采光基本满足需求' },
    poor: { label: '不足', color: '#f5222d', description: '需要改进采光' }
  };
  return levels[level] || levels.poor;
}

export function autoDetectRooms(scene, model) {
  const rooms = [];
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  
  const gridSize = 3;
  const cellSize = {
    x: size.x / gridSize,
    z: size.z / gridSize
  };
  
  const roomNames = ['客厅', '主卧', '次卧', '厨房', '卫生间', '书房', '阳台', '餐厅', '玄关'];
  
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const center = new THREE.Vector3(
        box.min.x + (i + 0.5) * cellSize.x,
        box.min.y + size.y / 2,
        box.min.z + (j + 0.5) * cellSize.z
      );
      
      const roomIndex = i * gridSize + j;
      rooms.push({
        id: `room_${roomIndex}`,
        name: roomNames[roomIndex] || `房间${roomIndex + 1}`,
        position: {
          x: center.x,
          y: center.y,
          z: center.z,
          windowNormal: { x: 0, z: 1 },
          windowAreaFactor: 0.6 + Math.random() * 0.4,
          obstruction: 0.2 + Math.random() * 0.3
        },
        size: {
          width: cellSize.x * 0.8,
          height: size.y,
          depth: cellSize.z * 0.8
        },
        center: center
      });
    }
  }
  
  return rooms.slice(0, 6);
}
