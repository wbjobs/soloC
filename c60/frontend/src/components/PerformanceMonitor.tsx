import React from 'react';
import { usePerformance } from '../contexts/PerformanceContext';

export function PerformanceMonitor() {
  const { metrics, isVRMode, qualityLevel, setQualityLevel } = usePerformance();

  const getFPSColor = (fps: number) => {
    if (fps >= 72) return '#00ff00';
    if (fps >= 60) return '#ffff00';
    if (fps >= 45) return '#ff9900';
    return '#ff0000';
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 20,
        right: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '15px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '12px',
        minWidth: '200px',
        zIndex: 1000,
      }}
    >
      <div style={{ marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>
        性能监控
      </div>
      
      <div style={{ marginBottom: '5px' }}>
        <span style={{ color: getFPSColor(metrics.fps) }}>
          FPS: {metrics.fps}
        </span>
      </div>
      
      <div style={{ marginBottom: '5px' }}>
        帧时间: {metrics.frameTime}ms
      </div>
      
      <div style={{ marginBottom: '5px' }}>
        三角形: {metrics.triangles.toLocaleString()}
      </div>
      
      <div style={{ marginBottom: '5px' }}>
        Draw Calls: {metrics.drawCalls}
      </div>
      
      <div style={{ marginBottom: '10px', color: isVRMode ? '#00ff00' : '#ff9900' }}>
        模式: {isVRMode ? 'VR' : '桌面'}
      </div>

      <div style={{ borderTop: '1px solid #444', paddingTop: '10px' }}>
        <div style={{ marginBottom: '5px' }}>画质设置:</div>
        <div style={{ display: 'flex', gap: '5px' }}>
          {(['low', 'medium', 'high'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setQualityLevel(level)}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                backgroundColor: qualityLevel === level ? '#4CAF50' : '#555',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {level === 'low' ? '低' : level === 'medium' ? '中' : '高'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
