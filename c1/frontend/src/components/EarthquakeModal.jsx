import React from 'react';
import { formatTime, formatTimeAgo, getMagnitudeColor, getMagnitudeLabel } from '../utils/geo';

function EarthquakeModal({ earthquake, onClose }) {
  const color = getMagnitudeColor(earthquake.magnitude);
  const label = getMagnitudeLabel(earthquake.magnitude);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.close} onClick={onClose}>
          ✕
        </button>

        <div style={styles.header}>
          <div style={{ ...styles.magnitudeBadge, backgroundColor: color }}>
            <span style={styles.magnitudeValue}>M{earthquake.magnitude.toFixed(1)}</span>
            <span style={styles.magnitudeLabel}>{label}</span>
          </div>
          <div style={styles.location}>
            <div style={styles.place}>{earthquake.place}</div>
            <div style={styles.time}>
              {formatTime(earthquake.time)}
              <span style={styles.timeAgo}> ({formatTimeAgo(earthquake.time)})</span>
            </div>
          </div>
        </div>

        <div style={styles.divider} />

        <div style={styles.details}>
          <div style={styles.detailRow}>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>纬度</span>
              <span style={styles.detailValue}>{earthquake.latitude.toFixed(4)}°</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>经度</span>
              <span style={styles.detailValue}>{earthquake.longitude.toFixed(4)}°</span>
            </div>
          </div>

          <div style={styles.detailRow}>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>深度</span>
              <span style={styles.detailValue}>
                {earthquake.depth.toFixed(1)} <span style={styles.unit}>km</span>
              </span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>震级</span>
              <span style={{ ...styles.detailValue, color }}>
                {earthquake.magnitude.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div style={styles.mapPlaceholder}>
          <div style={styles.mapIcon}>📍</div>
          <div style={styles.mapText}>
            {earthquake.latitude.toFixed(2)}°, {earthquake.longitude.toFixed(2)}°
          </div>
        </div>

        <div style={styles.footer}>
          <span style={styles.eventId}>Event ID: {earthquake.id}</span>
        </div>
      </div>
    </div>
  );
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
    width: '400px',
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '16px',
    padding: '28px',
    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5), 0 0 60px rgba(96, 165, 250, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    position: 'relative'
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
    justifyContent: 'center',
    transition: 'all 0.2s'
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '20px'
  },
  magnitudeBadge: {
    width: '80px',
    height: '80px',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  magnitudeValue: {
    fontSize: '28px',
    fontWeight: 800,
    color: '#fff'
  },
  magnitudeLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginTop: '2px'
  },
  location: {
    flex: 1,
    minWidth: 0
  },
  place: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1.3,
    marginBottom: '8px'
  },
  time: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.5)'
  },
  timeAgo: {
    color: 'rgba(255, 255, 255, 0.3)'
  },
  divider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.1)',
    margin: '20px 0'
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  detailRow: {
    display: 'flex',
    gap: '24px'
  },
  detailItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  detailLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  detailValue: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#fff'
  },
  unit: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: 400
  },
  mapPlaceholder: {
    marginTop: '20px',
    padding: '20px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px'
  },
  mapIcon: {
    fontSize: '32px'
  },
  mapText: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'monospace'
  },
  footer: {
    marginTop: '16px',
    textAlign: 'center'
  },
  eventId: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: 'monospace'
  }
};

export default EarthquakeModal;
