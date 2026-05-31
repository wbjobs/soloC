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

const findNeighbors = (points, pointIdx, eps) => {
  const neighbors = [];
  const p = points[pointIdx];
  
  for (let i = 0; i < points.length; i++) {
    if (i === pointIdx) continue;
    const q = points[i];
    const dist = haversineDistance(p.latitude, p.longitude, q.latitude, q.longitude);
    if (dist <= eps) {
      neighbors.push(i);
    }
  }
  
  return neighbors;
};

const expandCluster = (points, labels, pointIdx, neighbors, clusterId, eps, minPts) => {
  labels[pointIdx] = clusterId;
  
  let i = 0;
  while (i < neighbors.length) {
    const neighborIdx = neighbors[i];
    
    if (labels[neighborIdx] === -1) {
      labels[neighborIdx] = clusterId;
    } else if (labels[neighborIdx] === 0) {
      labels[neighborIdx] = clusterId;
      const newNeighbors = findNeighbors(points, neighborIdx, eps);
      
      if (newNeighbors.length + 1 >= minPts) {
        neighbors = neighbors.concat(newNeighbors);
      }
    }
    i++;
  }
};

const dbscan = (points, eps = 50, minPts = 3) => {
  const labels = new Array(points.length).fill(0);
  let clusterId = 0;

  for (let i = 0; i < points.length; i++) {
    if (labels[i] !== 0) continue;
    
    const neighbors = findNeighbors(points, i, eps);
    
    if (neighbors.length + 1 < minPts) {
      labels[i] = -1;
    } else {
      clusterId++;
      expandCluster(points, labels, i, neighbors, clusterId, eps, minPts);
    }
  }

  return labels;
};

const clusterEarthquakes = (earthquakes, eps = 150, minPts = 2) => {
  earthquakes = earthquakes || [];
  
  if (earthquakes.length < minPts) {
    return { clusters: [], noise: earthquakes };
  }

  const labels = dbscan(earthquakes, eps, minPts);
  
  const clusterMap = new Map();
  const noise = [];
  
  earthquakes.forEach((eq, idx) => {
    const label = labels[idx];
    if (label === -1) {
      noise.push(eq);
    } else {
      if (!clusterMap.has(label)) {
        clusterMap.set(label, []);
      }
      clusterMap.get(label).push(eq);
    }
  });
  
  const clusters = Array.from(clusterMap.entries()).map(([id, members]) => {
    const avgLat = members.reduce((sum, m) => sum + m.latitude, 0) / members.length;
    const avgLng = members.reduce((sum, m) => sum + m.longitude, 0) / members.length;
    const avgMagnitude = members.reduce((sum, m) => sum + m.magnitude, 0) / members.length;
    const maxMagnitude = Math.max(...members.map(m => m.magnitude));
    const totalMagnitude = members.reduce((sum, m) => sum + m.magnitude, 0);
    
    return {
      id: `cluster_${id}`,
      size: members.length,
      latitude: avgLat,
      longitude: avgLng,
      avgMagnitude,
      maxMagnitude,
      totalMagnitude,
      members
    };
  });
  
  return {
    clusters: clusters.sort((a, b) => b.size - a.size),
    noise
  };
};

module.exports = {
  dbscan,
  haversineDistance,
  clusterEarthquakes
};
