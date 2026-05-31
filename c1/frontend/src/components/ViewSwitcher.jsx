import React from 'react';

const VIEWS = [
  { id: 'markers', label: '地震标记', icon: '📍', desc: '单个地震柱' },
  { id: 'heatmap', label: '热力图', icon: '🔥', desc: '过去1小时密度' },
  { id: 'clusters', label: '聚类分析', icon: '💠', desc: 'DBSCAN聚类' }
];

function ViewSwitcher({ currentView, onViewChange }) {
  return (
    <div style={styles.container}>
      <div style={styles.title}>视图模式</div>
      <div style={styles.buttons}>
        {VIEWS.map((view) => (
          <button
            key={view.id}
            onClick={() => onViewChange(view.id)}
            style={{
              ...styles.button,
              ...(currentView === view.id ? styles.buttonActive : {})
            }}
          >
            <span style={styles.buttonIcon}>{view.icon}</span>
            <span style={styles.buttonLabel}>{view.label}</span>
          </button>
        ))}
      </div>
      <div style={styles.hint}>
        {VIEWS.find(v => v.id === currentView)?.desc}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    top: '80px',
    right: '24px',
    zIndex: 100,
    padding: '16px',
    background: 'rgba(15, 23, 42, 0.9)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
    minWidth: '200px'
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '12px'
  },
  buttons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid transparent',
    background: 'rgba(255, 255, 255, 0.03)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'left'
  },
  buttonActive: {
    background: 'rgba(96, 165, 250, 0.15)',
    borderColor: 'rgba(96, 165, 250, 0.3)',
    boxShadow: '0 0 20px rgba(96, 165, 250, 0.1)'
  },
  buttonIcon: {
    fontSize: '18px',
    width: '24px',
    textAlign: 'center'
  },
  buttonLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.85)'
  },
  hint: {
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center'
  }
};

export default ViewSwitcher;
