<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { nodeAPI } from '@/api'
import type { EChartsOption } from 'echarts'
import type { PredictionResult, NodeInfo } from '@/types'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent
])

const props = defineProps<{
  node: NodeInfo
}>()

const predictionData = ref<PredictionResult | null>(null)
const loading = ref(false)
const isMobile = ref(window.innerWidth <= 768)

function handleResize() {
  isMobile.value = window.innerWidth <= 768
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  fetchPrediction()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

watch(() => props.node.id, () => {
  fetchPrediction()
})

async function fetchPrediction() {
  if (!props.node.id) return
  
  loading.value = true
  try {
    const response = await nodeAPI.getNodePrediction(props.node.id, 24)
    if (response.success && response.data) {
      predictionData.value = response.data
    }
  } catch (error) {
    console.error('Failed to fetch prediction:', error)
  } finally {
    loading.value = false
  }
}

const trendInfo = computed(() => {
  if (!predictionData.value) return null
  
  const trend = predictionData.value.summary.trend
  let icon = '⚖️'
  let text = 'Stable'
  let color = '#67c23a'
  
  switch (trend) {
    case 'increasing':
      icon = '📈'
      text = 'Increasing'
      color = '#409eff'
      break
    case 'decreasing':
      icon = '📉'
      text = 'Decreasing'
      color = '#e6a23c'
      break
    case 'insufficient_data':
      icon = '⚠️'
      text = 'Insufficient Data'
      color = '#f56c6c'
      break
  }
  
  return { icon, text, color }
})

const chartOption = computed<EChartsOption>(() => {
  if (!predictionData.value) {
    return {
      backgroundColor: 'transparent'
    }
  }

  const historical = predictionData.value.historical_points || []
  const predicted = predictionData.value.predicted_points || []

  const gridTop = isMobile.value ? '5px' : '40px'
  const gridLeft = isMobile.value ? '2%' : '3%'
  const gridRight = isMobile.value ? '2%' : '4%'
  const gridBottom = isMobile.value ? '5%' : '10%'

  const historicalData = historical.map(p => [
    new Date(p.time).getTime(),
    p.block_generation_rate
  ]).filter(p => p[1] > 0)

  const predictedData = predicted.map(p => [
    new Date(p.time).getTime(),
    p.block_generation_rate
  ])

  const allData = [...historicalData, ...predictedData]
  const maxValue = Math.max(...allData.map(d => d[1]), 0) * 1.1
  const minValue = Math.min(...allData.filter(d => d[1] > 0).map(d => d[1]), 0) * 0.9

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: {
        color: '#fff',
        fontSize: isMobile.value ? 11 : 12
      },
      formatter: function(params: any) {
        const date = new Date(params[0].axisValue)
        let result = date.toLocaleString() + '<br/>'
        for (const param of params) {
          result += `${param.marker} ${param.seriesName}: ${param.value[1]?.toFixed(2) || 0} blocks/min<br/>`
        }
        return result
      }
    },
    legend: {
      data: ['Historical', 'Predicted'],
      textStyle: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: isMobile.value ? 10 : 12
      },
      top: isMobile.value ? -5 : 0
    },
    grid: {
      left: gridLeft,
      right: gridRight,
      bottom: gridBottom,
      top: gridTop,
      containLabel: true
    },
    xAxis: {
      type: 'time',
      axisLabel: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: isMobile.value ? 10 : 12,
        formatter: (value: number) => {
          const date = new Date(value)
          return isMobile.value 
            ? `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}` 
            : date.toLocaleTimeString()
        }
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.05)'
        }
      }
    },
    yAxis: {
      type: 'value',
      name: 'blocks/min',
      nameTextStyle: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: isMobile.value ? 10 : 11
      },
      axisLabel: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: isMobile.value ? 10 : 12
      },
      axisLine: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.05)'
        }
      },
      min: minValue > 0 ? minValue : 0,
      max: maxValue
    },
    series: [
      {
        name: 'Historical',
        type: 'line',
        data: historicalData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2,
          color: '#67c23a'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(103, 194, 58, 0.3)' },
              { offset: 1, color: 'rgba(103, 194, 58, 0.05)' }
            ]
          }
        }
      },
      {
        name: 'Predicted',
        type: 'line',
        data: predictedData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2,
          color: '#409eff',
          type: 'dashed'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(64, 158, 255, 0.25)' },
              { offset: 1, color: 'rgba(64, 158, 255, 0.05)' }
            ]
          }
        }
      }
    ]
  }
})
</script>

<template>
  <div class="prediction-chart">
    <div class="prediction-header">
      <div class="node-info">
        <span class="node-icon">{{ node.type === 'ETHEREUM' ? '🔷' : '🟠' }}</span>
        <div>
          <div class="node-name">{{ node.name }}</div>
          <div class="node-type">{{ node.type }}</div>
        </div>
      </div>
      
      <div v-if="predictionData && trendInfo" class="trend-badge" :style="{ borderColor: trendInfo.color }">
        <span class="trend-icon">{{ trendInfo.icon }}</span>
        <span class="trend-text">{{ trendInfo.text }}</span>
      </div>
    </div>

    <div v-if="predictionData && predictionData.summary" class="summary-cards">
      <div class="summary-card">
        <div class="summary-label">Avg Rate (24h)</div>
        <div class="summary-value">{{ predictionData.summary.average_block_rate_24h.toFixed(2) }}</div>
        <div class="summary-unit">blocks/min</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Predicted</div>
        <div class="summary-value">{{ predictionData.summary.predicted_blocks_next_24h.toLocaleString() }}</div>
        <div class="summary-unit">blocks (24h)</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Confidence</div>
        <div class="summary-value">{{ (predictionData.summary.confidence * 100).toFixed(0) }}%</div>
        <div class="summary-unit">accuracy</div>
      </div>
    </div>

    <div class="chart-wrapper" v-loading="loading">
      <v-chart 
        v-if="predictionData"
        :option="chartOption" 
        autoresize
        :style="{ width: '100%', height: isMobile ? '220px' : '280px' }"
      />
      <div v-else class="no-data">
        <el-icon :size="48" style="margin-bottom: 10px;"><TrendCharts /></el-icon>
        <p>Loading prediction data...</p>
      </div>
    </div>

    <div v-if="predictionData && predictionData.summary.trend === 'insufficient_data'" class="warning-message">
      <el-icon><Warning /></el-icon>
      <span>Not enough historical data for accurate prediction. Need at least 5 data points.</span>
    </div>
  </div>
</template>

<style scoped>
.prediction-chart {
  color: #fff;
}

.prediction-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 15px;
}

.node-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.node-icon {
  font-size: 32px;
}

.node-name {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.node-type {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.trend-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid;
  background: rgba(255, 255, 255, 0.05);
}

.trend-icon {
  font-size: 18px;
}

.trend-text {
  font-size: 14px;
  font-weight: 500;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-bottom: 20px;
}

.summary-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 15px;
  text-align: center;
}

.summary-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 5px;
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}

.summary-unit {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.chart-wrapper {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-data {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
}

.warning-message {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 15px;
  padding: 10px 15px;
  background: rgba(230, 162, 60, 0.1);
  border: 1px solid rgba(230, 162, 60, 0.3);
  border-radius: 6px;
  color: #e6a23c;
  font-size: 13px;
}

@media (max-width: 768px) {
  .summary-cards {
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .summary-card {
    padding: 10px;
  }

  .summary-value {
    font-size: 18px;
  }

  .summary-label, .summary-unit {
    font-size: 10px;
  }

  .node-name {
    font-size: 16px;
  }

  .prediction-header {
    margin-bottom: 15px;
  }
}

@media (max-width: 480px) {
  .summary-cards {
    grid-template-columns: 1fr;
  }

  .summary-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 15px;
  }

  .summary-label {
    margin-bottom: 0;
  }

  .summary-value {
    font-size: 20px;
  }

  .summary-unit {
    display: none;
  }
}
</style>
