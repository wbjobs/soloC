<template>
  <div class="stats-panel">
    <h3>压缩率统计</h3>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{{ formatNumber(stats.totalOriginalPoints) }}</div>
        <div class="stat-label">原始数据点</div>
        <div class="stat-icon raw">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ formatNumber(stats.totalCompressedPoints) }}</div>
        <div class="stat-label">压缩后数据点</div>
        <div class="stat-icon compressed">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </div>
      </div>
      <div class="stat-card highlight">
        <div class="stat-value">{{ formatPercent(stats.compressionRate) }}</div>
        <div class="stat-label">压缩比例</div>
        <div class="stat-progress">
          <div class="progress-bar" :style="{ width: Math.max(10, stats.compressionRate * 100) + '%' }"></div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ formatDistance(stats.averageDeviation) }}</div>
        <div class="stat-label">平均距离偏差</div>
        <div class="stat-unit">米</div>
      </div>
      <div class="stat-card vessels">
        <div class="stat-value">{{ formatNumber(stats.vesselsCount) }}</div>
        <div class="stat-label">活跃船舶</div>
        <div class="stat-vessels-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19z"/>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  stats: {
    type: Object,
    default: () => ({
      totalOriginalPoints: 0,
      totalCompressedPoints: 0,
      compressionRate: 0,
      averageDeviation: 0,
      vesselsCount: 0
    })
  }
})

function formatNumber(num) {
  if (!num) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

function formatPercent(value) {
  if (!value) return '0%'
  return (value * 100).toFixed(1) + '%'
}

function formatDistance(value) {
  if (!value) return '0'
  if (value >= 1000) return (value / 1000).toFixed(2)
  return value.toFixed(2)
}
</script>

<style scoped>
.stats-panel {
  background: rgba(20, 20, 50, 0.8);
  border: 1px solid rgba(100, 180, 255, 0.2);
  border-radius: 12px;
  padding: 16px;
}

.stats-panel h3 {
  font-size: 14px;
  font-weight: 600;
  color: #64b4ff;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-card {
  position: relative;
  background: rgba(10, 10, 30, 0.6);
  border: 1px solid rgba(100, 180, 255, 0.15);
  border-radius: 10px;
  padding: 14px;
  overflow: hidden;
}

.stat-card.highlight {
  border-color: rgba(100, 255, 155, 0.4);
  background: linear-gradient(135deg, rgba(100, 255, 155, 0.1), rgba(100, 180, 255, 0.1));
}

.stat-card.vessels {
  grid-column: span 2;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #e0e0e0;
  margin-bottom: 4px;
}

.stat-card.highlight .stat-value {
  color: #64ff9b;
}

.stat-card.vessels .stat-value {
  font-size: 28px;
}

.stat-label {
  font-size: 11px;
  color: #8080a0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-unit {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 10px;
  color: #606080;
}

.stat-icon {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon.raw {
  background: rgba(255, 150, 100, 0.2);
  color: #ff9664;
}

.stat-icon.compressed {
  background: rgba(100, 180, 255, 0.2);
  color: #64b4ff;
}

.stat-icon svg {
  width: 16px;
  height: 16px;
}

.stat-vessels-icon {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 36px;
  height: 36px;
  background: rgba(100, 180, 255, 0.15);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64b4ff;
}

.stat-vessels-icon svg {
  width: 22px;
  height: 22px;
}

.stat-progress {
  margin-top: 8px;
  height: 4px;
  background: rgba(100, 180, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #64ff9b, #64b4ff);
  border-radius: 2px;
  transition: width 0.5s ease;
}
</style>
