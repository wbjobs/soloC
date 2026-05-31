import { getColorScaleColors } from '../utils/colorMapping';

export default function ColorBar() {
  const colors = getColorScaleColors();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}
    >
      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', fontWeight: 500 }}>
        Stability Score
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: '#4488ff' }}>Stable (1.0)</span>
        <div
          style={{
            width: '20px',
            height: '120px',
            borderRadius: '4px',
            background: `linear-gradient(to bottom, ${colors[colors.length - 1]}, ${colors[0]})`,
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}
        />
        <span style={{ fontSize: '11px', color: '#ff4444' }}>Unstable (0.0)</span>
      </div>
    </div>
  );
}
