import React from 'react';

function Timeline({ value, onChange, earthquakeCount }) {
  const hours = [1, 6, 12, 24, 48, 168];
  const labels = {
    1: '1小时',
    6: '6小时',
    12: '12小时',
    24: '24小时',
    48: '48小时',
    168: '7天'
  };

  const percentage = (() => {
    const index = hours.indexOf(value);
    return (index / (hours.length - 1)) * 100;
  })();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>时间范围</span>
        <span style={styles.value}>
          显示 <strong style={{ color: '#60a5fa' }}>{labels[value]}</strong> 内的地震
          <span style={styles.count}> ({earthquakeCount} 个事件)</span>
        </span>
      </div>

      <div style={styles.sliderContainer}>
        <div style={styles.track}>
          <div style={{ ...styles.fill, width: `${percentage}%` }} />
        </div>
        
        <input
          type="range"
          min="0"
          max={hours.length - 1}
          value={hours.indexOf(value)}
          onChange={(e) => onChange(hours[parseInt(e.target.value)])}
          style={styles.slider}
        />

        <div style={styles.marks}>
          {hours.map((h) => (
            <button
              key={h}
              onClick={() => onChange(h)}
              style={{
                ...styles.mark,
                ...(value >= h ? styles.markActive : {})
              }}
            >
              <span style={styles.markLabel}>{labels[h]}</span>
              <span style={{
                ...styles.markDot,
                backgroundColor: value === h ? '#60a5fa' : value > h ? '#3b82f6' : '#334155'
              }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    padding: '24px 32px 32px',
    background: 'linear-gradient(to top, rgba(10, 10, 15, 0.95), transparent)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  value: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.6)'
  },
  count: {
    color: 'rgba(255, 255, 255, 0.4)'
  },
  sliderContainer: {
    position: 'relative',
    padding: '20px 10px 0'
  },
  track: {
    position: 'absolute',
    top: '28px',
    left: '10px',
    right: '10px',
    height: '4px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '2px'
  },
  fill: {
    height: '100%',
    background: 'linear-gradient(to right, #3b82f6, #60a5fa)',
    borderRadius: '2px',
    transition: 'width 0.2s'
  },
  slider: {
    position: 'relative',
    width: '100%',
    height: '20px',
    appearance: 'none',
    background: 'transparent',
    cursor: 'pointer',
    zIndex: 2,
    outline: 'none'
  },
  marks: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '8px'
  },
  mark: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
    transition: 'background 0.2s'
  },
  markActive: {
    background: 'rgba(96, 165, 250, 0.1)'
  },
  markLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.5)',
    whiteSpace: 'nowrap'
  },
  markDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    transition: 'all 0.2s'
  }
};

export default Timeline;
