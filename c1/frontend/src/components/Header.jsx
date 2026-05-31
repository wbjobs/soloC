import React from 'react';

function Header({ count, isConnected, onRefresh, loading }) {
  return (
    <div style={styles.container}>
      <div style={styles.left}>
        <div style={styles.title}>
          <span style={styles.icon}>🌍</span>
          <span style={styles.titleText}>全球实时地震监测系统</span>
        </div>
        <div style={styles.stats}>
          <span style={styles.stat}>
            <span style={styles.statValue}>{count}</span>
            <span style={styles.statLabel}>地震事件</span>
          </span>
        </div>
      </div>

      <div style={styles.right}>
        <div style={{
          ...styles.status,
          backgroundColor: isConnected ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          borderColor: isConnected ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)'
        }}>
          <span style={{
            ...styles.statusDot,
            backgroundColor: isConnected ? '#4ade80' : '#ef4444',
            boxShadow: isConnected ? '0 0 8px #4ade80' : '0 0 8px #ef4444'
          }} />
          <span style={styles.statusText}>
            {isConnected ? '实时连接中' : '已断开'}
          </span>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            ...styles.refreshBtn,
            opacity: loading ? 0.5 : 1,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          <span style={{ ...styles.refreshIcon, animation: loading ? 'spin 1s linear infinite' : 'none' }}>
            ⟳
          </span>
          <span>{loading ? '加载中...' : '刷新'}</span>
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    background: 'linear-gradient(to bottom, rgba(10, 10, 15, 0.95), transparent)',
    pointerEvents: 'none'
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
    pointerEvents: 'auto'
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  icon: {
    fontSize: '28px'
  },
  titleText: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.5px'
  },
  stats: {
    display: 'flex',
    gap: '24px'
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#60a5fa'
  },
  statLabel: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    pointerEvents: 'auto'
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '20px',
    border: '1px solid'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  },
  statusText: {
    fontSize: '13px',
    fontWeight: 500
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 20px',
    borderRadius: '8px',
    border: '1px solid rgba(96, 165, 250, 0.3)',
    background: 'rgba(96, 165, 250, 0.1)',
    color: '#60a5fa',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.2s'
  },
  refreshIcon: {
    fontSize: '14px'
  }
};

export default Header;
