<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useNodeStore } from '@/stores/node'
import type { EChartsOption } from 'echarts'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent
])

const isMobile = ref(window.innerWidth <= 768)

function handleResize() {
  isMobile.value = window.innerWidth <= 768
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

const props = defineProps<{
  type: 'tx_rate' | 'block_height' | 'latency_ms' | 'peer_count'
}>()

const nodeStore = useNodeStore()

const chartOption = computed<EChartsOption>(() => {
  const series: any[] = []
  const legendData: string[] = []
  const allTimestamps = new Set<number>()

  for (const node of nodeStore.nodes) {
    const metrics = nodeStore.getNodeMetrics(node.id)
    if (metrics.length > 0) {
      legendData.push(node.name)
      
      const data = metrics.map(m => ({
        value: m[props.type as keyof typeof m],
        timestamp: m.timestamp * 1000
      }))

      for (const m of metrics) {
        allTimestamps.add(m.timestamp * 1000)
      }

      series.push({
        name: node.name,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: data.map(d => [d.timestamp, d.value]),
        lineStyle: {
          width: 2
        },
        areaStyle: {
          opacity: 0.1
        }
      })
    }
  }

  const timestamps = Array.from(allTimestamps).sort()

  const gridTop = isMobile.value ? '5px' : '40px'
  const gridLeft = isMobile.value ? '2%' : '3%'
  const gridRight = isMobile.value ? '2%' : '4%'
  const gridBottom = isMobile.value ? '2%' : '3%'
  const showLegend = !isMobile.value || legendData.length <= 2

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
        let result = date.toLocaleTimeString() + '<br/>'
        for (const param of params) {
          result += `${param.marker} ${param.seriesName}: ${param.value[1]}<br/>`
        }
        return result
      }
    },
    legend: {
      data: legendData,
      show: showLegend,
      textStyle: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: isMobile.value ? 10 : 12
      },
      top: isMobile.value ? -5 : 0,
      type: isMobile.value && legendData.length > 2 ? 'scroll' : 'plain'
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
            ? date.toLocaleTimeString().slice(0, 5) 
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
      }
    },
    series
  }
})
</script>

<template>
  <div class="chart-container">
    <v-chart 
      :option="chartOption" 
      autoresize
      style="width: 100%; height: 300px;"
    />
  </div>
</template>

<style scoped>
.chart-container {
  width: 100%;
  min-height: 250px;
}

@media (max-width: 768px) {
  .chart-container {
    min-height: 200px;
  }
}

@media (max-width: 480px) {
  .chart-container {
    min-height: 180px;
  }
}
</style>
