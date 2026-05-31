import React, { useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import Earth from './components/Earth';
import EarthquakeMarker from './components/EarthquakeMarker';
import Header from './components/Header';
import Timeline from './components/Timeline';
import EarthquakeModal from './components/EarthquakeModal';
import Legend from './components/Legend';
import ViewSwitcher from './components/ViewSwitcher';
import HeatmapOverlay from './components/HeatmapOverlay';
import ClusterMarkers from './components/ClusterMarkers';
import ClusterModal from './components/ClusterModal';
import { fetchRecentEarthquakes, fetchClusters, connectWebSocket } from './services/api';
import { EARTH_RADIUS, latLngToVector3, getMagnitudeColor, getMagnitudeHeight } from './utils/geo';

const VIEW_MODES = {
  MARKERS: 'markers',
  HEATMAP: 'heatmap',
  CLUSTERS: 'clusters'
};

function App() {
  const [earthquakes, setEarthquakes] = useState([]);
  const [selectedEarthquake, setSelectedEarthquake] = useState(null);
  const [timeRange, setTimeRange] = useState(24);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [viewMode, setViewMode] = useState(VIEW_MODES.MARKERS);
  const [clusterData, setClusterData] = useState({ clusters: [], noise: [] });
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [loadingClusters, setLoadingClusters] = useState(false);

  const loadEarthquakes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRecentEarthquakes(timeRange);
      setEarthquakes(data);
    } catch (error) {
      console.error('Failed to load earthquakes:', error);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  const loadClusters = useCallback(async () => {
    setLoadingClusters(true);
    try {
      const data = await fetchClusters(10);
      setClusterData({
        clusters: data.clusters || [],
        noise: data.noise || []
      });
    } catch (error) {
      console.error('Failed to load clusters:', error);
    } finally {
      setLoadingClusters(false);
    }
  }, []);

  useEffect(() => {
    loadEarthquakes();
  }, [loadEarthquakes]);

  useEffect(() => {
    if (viewMode === VIEW_MODES.CLUSTERS) {
      loadClusters();
      const interval = setInterval(loadClusters, 10000);
      return () => clearInterval(interval);
    }
  }, [viewMode, loadClusters]);

  useEffect(() => {
    const cleanup = connectWebSocket(
      () => setIsConnected(true),
      () => setIsConnected(false),
      (quake) => {
        setEarthquakes(prev => {
          const exists = prev.some(e => e.id === quake.id);
          if (!exists) {
            return [quake, ...prev];
          }
          return prev;
        });
      }
    );

    return cleanup;
  }, []);

  const visibleEarthquakes = earthquakes.filter(eq => {
    const now = new Date();
    const eqTime = new Date(eq.time);
    const diffHours = (now - eqTime) / (1000 * 60 * 60);
    return diffHours <= timeRange;
  });

  const markers = visibleEarthquakes.map(eq => {
    const position = latLngToVector3(eq.latitude, eq.longitude, EARTH_RADIUS);
    const height = getMagnitudeHeight(eq.magnitude);
    const color = getMagnitudeColor(eq.magnitude);
    
    return {
      ...eq,
      position,
      height,
      color
    };
  });

  const renderMarkersLayer = () => (
    <>
      {markers.map((marker, index) => (
        <EarthquakeMarker
          key={marker.id || index}
          marker={marker}
          onClick={() => setSelectedEarthquake(marker)}
        />
      ))}
    </>
  );

  const renderHeatmapLayer = () => (
    <HeatmapOverlay earthquakes={earthquakes} />
  );

  const renderClustersLayer = () => (
    <ClusterMarkers
      clusters={clusterData.clusters}
      noise={clusterData.noise}
      onClusterClick={setSelectedCluster}
      onNoiseClick={setSelectedEarthquake}
    />
  );

  const renderLayer = () => {
    switch (viewMode) {
      case VIEW_MODES.HEATMAP:
        return renderHeatmapLayer();
      case VIEW_MODES.CLUSTERS:
        return renderClustersLayer();
      default:
        return renderMarkersLayer();
    }
  };

  const displayCount = (() => {
    switch (viewMode) {
      case VIEW_MODES.CLUSTERS:
        return clusterData.clusters.length;
      case VIEW_MODES.HEATMAP:
        return visibleEarthquakes.length;
      default:
        return visibleEarthquakes.length;
    }
  })();

  return (
    <div style={styles.container}>
      <Header 
        count={displayCount} 
        isConnected={isConnected}
        onRefresh={() => {
          if (viewMode === VIEW_MODES.CLUSTERS) {
            loadClusters();
          } else {
            loadEarthquakes();
          }
        }}
        loading={loading || loadingClusters}
      />
      
      {viewMode !== VIEW_MODES.CLUSTERS && <Legend />}
      <ViewSwitcher currentView={viewMode} onViewChange={setViewMode} />
      
      <div style={styles.canvasContainer}>
        <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
          <color attach="background" args={['#0a0a0f']} />
          <ambientLight intensity={0.3} />
          <directionalLight position={[5, 3, 5]} intensity={1} />
          <Stars radius={300} depth={60} count={5000} factor={4} saturation={0} />
          
          <Earth>
            {renderLayer()}
          </Earth>
          
          <OrbitControls 
            enableZoom={true}
            enablePan={false}
            minDistance={3}
            maxDistance={15}
          />
        </Canvas>
      </div>
      
      {viewMode !== VIEW_MODES.CLUSTERS && (
        <Timeline 
          value={timeRange}
          onChange={setTimeRange}
          earthquakeCount={visibleEarthquakes.length}
        />
      )}

      {viewMode === VIEW_MODES.CLUSTERS && (
        <div style={styles.clusterInfo}>
          <div style={styles.clusterInfoRow}>
            <span style={styles.clusterInfoLabel}>聚类</span>
            <span style={{ ...styles.clusterInfoValue, color: '#60a5fa' }}>
              {clusterData.clusters.length} 个
            </span>
          </div>
          <div style={styles.clusterInfoRow}>
            <span style={styles.clusterInfoLabel}>孤立点</span>
            <span style={{ ...styles.clusterInfoValue, color: '#9ca3af' }}>
              {clusterData.noise.length} 个
            </span>
          </div>
          <div style={styles.clusterInfoHint}>
            DBSCAN 聚类 (近10分钟)
          </div>
        </div>
      )}
      
      {selectedEarthquake && (
        <EarthquakeModal 
          earthquake={selectedEarthquake}
          onClose={() => setSelectedEarthquake(null)}
        />
      )}

      {selectedCluster && (
        <ClusterModal
          cluster={selectedCluster}
          onClose={() => setSelectedCluster(null)}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    position: 'relative',
    background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 100%)'
  },
  canvasContainer: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0
  },
  clusterInfo: {
    position: 'absolute',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '16px 28px',
    background: 'rgba(15, 23, 42, 0.9)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)'
  },
  clusterInfoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  clusterInfoLabel: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  clusterInfoValue: {
    fontSize: '18px',
    fontWeight: 700
  },
  clusterInfoHint: {
    marginLeft: '16px',
    paddingLeft: '16px',
    borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.35)'
  }
};

export default App;
