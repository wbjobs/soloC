import React from 'react';
import { getMagnitudeColor } from '../utils/geo';

function Legend() {
  const levels = [
    { min: 1, max: 2, label: '轻微 (1.0-1.9)' },
    { min: 2, max: 4, label: '轻度 (2.0-3.9)' },
    { min: 4, max: 6, label: '中度 (4.0-5.9)' },
    { min: 6, max: 10, label: '强烈 (6.0+)' }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.title}>震级图例</div>
      <div style={styles.items}>
        {levels.map((level, index) => {
          const color = getMagnitudeColor(level.min + 0.5);
          const height = ((level.min - 1) / 7) * 0.7 + 0.1;
          
          return (
            <div key={index} style={styles.item}>
              <div style={styles.barContainer}>
                <div style={{
                  ...styles.bar,
                  backgroundColor: color,
                  height: `${height * 50}px`,
                  boxShadow: `0 0 8px ${color}40`
                }} />
              </div>
              <span style={styles.label}>{level.label}</span>
            </div>
          );
        })}
      </div>
      <div style={styles.hint}>
        柱状高度 = 震级大小
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    right: '24px',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 100,
    padding: '20px',
    background: 'rgba(15, 23, 42, 0.9)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)'
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '16px'
  },
  items: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  barContainer: {
    width: '16px',
    height: '50px',
    display: 'flex',
    alignItems: 'flex-end',
    borderRadius: '2px',
    background: 'rgba(255, 255, 255, 0.05)'
  },
  bar: {
    width: '100%',
    borderRadius: '2px',
    transition: 'all 0.3s'
  },
  label: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.7)',
    whiteSpace: 'nowrap'
  },
  hint: {
    marginTop: '16px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center'
  }
};

export default Legend;
