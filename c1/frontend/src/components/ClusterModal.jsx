import React from 'react';
import { formatTime } from '../utils/geo';

function ClusterModal({ cluster, onClose }) {
  const maxMag = cluster.maxMagnitude || 0;
  const color = maxMag >= 6 ? '#ef4444' : maxMag >= 4.5 ? '#fb923c' : maxMag >= 3 ? '#facc15' : '#4ade80';

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.close} onClick={onClose}>
          ✕
        </button>

        <div style={styles.header}>
          <div style={{ ...styles.badge, backgroundColor: color }}>
            <span style={styles.badgeValue}>{cluster.size}</span>
            <span style={styles.badgeLabel}>个地震</span>
          </div>
          <div style={styles.info}>
            <div style={styles.title}>地震聚类</div>
            <div style={styles.coords}>
              {cluster.latitude?.toFixed(2)}°N, {cluster.longitude?.toFixed(2)}°E
            </div>
          </div>
        </div>

        <div style={styles.divider} />

        <div style={styles.stats}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>总震级</span>
            <span style={styles.statValue}>{cluster.totalMagnitude?.toFixed(1)}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>平均震级</span>
            <span style={styles.statValue}>{cluster.avgMagnitude?.toFixed(2)}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>最大震级</span>
            <span style={{ ...styles.statValue, color }}>M{maxMag.toFixed(1)}</span>
          </div>
        </div>

        <div style={styles.membersHeader}>
          <span style={styles.membersTitle}>包含的地震事件</span>
          <span style={styles.membersCount}>{cluster.members?.length || 0} 个</span>
        </div>

        <div style={styles.membersList}>
          {(cluster.members || []).map((member, index) => (
            <div key={member.id || index} style={styles.memberItem}>
              <span style={{ ...styles.memberMag, color: getMagnitudeColor(member.magnitude) }}>
                M{member.magnitude.toFixed(1)}
              </span>
              <span style={styles.memberPlace}>{member.place}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getMagnitudeColor(magnitude) {
  const mag = parseFloat(magnitude);
  if (mag >= 6) return '#ef4444';
  if (mag >= 4.5) return '#fb923c';
  if (mag >= 3) return '#facc15';
  return '#4ade80';
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)'
  },
  modal: {
    width: '420px',
    maxHeight: '80vh',
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column'
  },
  close: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px'
  },
  badge: {
    width: '80px',
    height: '80px',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeValue: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#fff'
  },
  badgeLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginTop: '2px'
  },
  info: {
    flex: 1,
    minWidth: 0
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#fff',
    marginBottom: '4px'
  },
  coords: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'monospace'
  },
  divider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.1)',
    margin: '20px 0'
  },
  stats: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px'
  },
  stat: {
    flex: 1,
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  statLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  statValue: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff'
  },
  membersHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  },
  membersTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.8)'
  },
  membersCount: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.4)'
  },
  membersList: {
    maxHeight: '200px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  memberItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px'
  },
  memberMag: {
    fontSize: '14px',
    fontWeight: 700
  },
  memberPlace: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.7)'
  }
};

export default ClusterModal;
