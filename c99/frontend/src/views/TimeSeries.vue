<template>
  <div class="time-series">
    <el-card class="filter-card">
      <div class="filter-row">
        <div class="filter-item">
          <span class="filter-label">选择地区:</span>
          <el-select v-model="selectedLocation" placeholder="请选择地区" style="width: 150px">
            <el-option label="北京" value="北京" />
            <el-option label="上海" value="上海" />
            <el-option label="广州" value="广州" />
            <el-option label="深圳" value="深圳" />
            <el-option label="成都" value="成都" />
          </el-select>
        </div>
        <div class="filter-item">
          <span class="filter-label">选择指标:</span>
          <el-radio-group v-model="selectedMetric">
            <el-radio-button label="temperature">温度</el-radio-button>
            <el-radio-button label="humidity">湿度</el-radio-button>
            <el-radio-button label="pressure">气压</el-radio-button>
            <el-radio-button label="wind_speed">风速</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </el-card>

    <el-card class="chart-card">
      <template #header>
        <div class="card-header-title">{{ selectedLocation }} - {{ getMetricName(selectedMetric) }}时间序列</div>
      </template>
      <div ref="lineChart" class="chart-container"></div>
    </el-card>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">温度与湿度对比</div>
          </template>
          <div ref="dualChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">风速分布</div>
          </template>
          <div ref="scatterChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const lineChart = ref(null)
const dualChart = ref(null)
const scatterChart = ref(null)

let lineChartInstance = null
let dualChartInstance = null
let scatterChartInstance = null

const selectedLocation = ref('北京')
const selectedMetric = ref('temperature')

const generateTimeData = (location, metric) => {
  const baseValues = {
    '北京': { temperature: 18, humidity: 45, pressure: 1013, wind_speed: 3.5 },
    '上海': { temperature: 22, humidity: 65, pressure: 1015, wind_speed: 4.0 },
    '广州': { temperature: 28, humidity: 75, pressure: 1008, wind_speed: 2.8 },
    '深圳': { temperature: 27, humidity: 78, pressure: 1009, wind_speed: 3.2 },
    '成都': { temperature: 20, humidity: 60, pressure: 1018, wind_speed: 1.8 }
  }

  const base = baseValues[location]?.[metric] || 20
  const data = []
  const now = new Date()

  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 3600000)
    const variation = (Math.random() - 0.5) * 5
    data.push({
      time: time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      value: round(base + variation, 2)
    })
  }

  return data
}

const round = (num, decimals) => {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

const getMetricName = (metric) => {
  const names = {
    temperature: '温度',
    humidity: '湿度',
    pressure: '气压',
    wind_speed: '风速'
  }
  return names[metric] || metric
}

const initLineChart = () => {
  lineChartInstance = echarts.init(lineChart.value)
  const data = generateTimeData(selectedLocation.value, selectedMetric.value)

  const unitMap = {
    temperature: '°C',
    humidity: '%',
    pressure: 'hPa',
    wind_speed: 'm/s'
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        return `${params[0].axisValue}<br/>${getMetricName(selectedMetric.value)}: ${params[0].value} ${unitMap[selectedMetric.value]}`
      }
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map(d => d.time),
      axisLabel: { rotate: 45, interval: 2 }
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: `{value} ${unitMap[selectedMetric.value]}` }
    },
    series: [
      {
        name: getMetricName(selectedMetric.value),
        type: 'line',
        smooth: true,
        data: data.map(d => d.value),
        itemStyle: { color: '#667eea' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(102, 126, 234, 0.3)' },
            { offset: 1, color: 'rgba(102, 126, 234, 0.05)' }
          ])
        },
        markLine: {
          data: [{ type: 'average', name: '平均值' }],
          lineStyle: { color: '#ff6b6b' }
        }
      }
    ]
  }

  lineChartInstance.setOption(option)
}

const initDualChart = () => {
  dualChartInstance = echarts.init(dualChart.value)
  const tempData = generateTimeData(selectedLocation.value, 'temperature')
  const humidityData = generateTimeData(selectedLocation.value, 'humidity')

  const option = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['温度', '湿度'], top: 10 },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: tempData.map(d => d.time),
      axisLabel: { rotate: 45, interval: 4 }
    },
    yAxis: [
      {
        type: 'value',
        name: '温度',
        position: 'left',
        axisLabel: { formatter: '{value}°C' }
      },
      {
        type: 'value',
        name: '湿度',
        position: 'right',
        axisLabel: { formatter: '{value}%' }
      }
    ],
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: tempData.map(d => d.value),
        itemStyle: { color: '#ff6b6b' }
      },
      {
        name: '湿度',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: humidityData.map(d => d.value),
        itemStyle: { color: '#4ecdc4' }
      }
    ]
  }

  dualChartInstance.setOption(option)
}

const initScatterChart = () => {
  scatterChartInstance = echarts.init(scatterChart.value)

  const locations = ['北京', '上海', '广州', '深圳', '成都']
  const scatterData = []

  locations.forEach(location => {
    for (let i = 0; i < 20; i++) {
      const windData = generateTimeData(location, 'wind_speed')
      scatterData.push([
        windData[i].value,
        Math.random() * 360,
        location
      ])
    }
  })

  const option = {
    tooltip: {
      formatter: (params) => {
        return `风速: ${params.value[0]} m/s<br/>风向: ${round(params.value[1], 0)}°<br/>地区: ${params.value[2]}`
      }
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'value',
      name: '风速(m/s)',
      scale: true
    },
    yAxis: {
      type: 'value',
      name: '风向(°)',
      min: 0,
      max: 360
    },
    series: [
      {
        name: '风速分布',
        type: 'scatter',
        symbolSize: 12,
        data: scatterData.map((d, index) => ({
          value: d,
          itemStyle: {
            color: ['#667eea', '#764ba2', '#f093fb', '#ff6b6b', '#4ecdc4'][index % 5]
          }
        }))
      }
    ]
  }

  scatterChartInstance.setOption(option)
}

const handleResize = () => {
  lineChartInstance?.resize()
  dualChartInstance?.resize()
  scatterChartInstance?.resize()
}

watch([selectedLocation, selectedMetric], () => {
  initLineChart()
})

onMounted(() => {
  initLineChart()
  initDualChart()
  initScatterChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  lineChartInstance?.dispose()
  dualChartInstance?.dispose()
  scatterChartInstance?.dispose()
})
</script>

<style scoped>
.time-series {
  padding: 0;
}

.filter-card {
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 32px;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-label {
  font-weight: 500;
  color: #606266;
}

.chart-card {
  margin-bottom: 20px;
}

.card-header-title {
  font-weight: 600;
  font-size: 16px;
}

.chart-container {
  height: 350px;
  width: 100%;
}
</style>
