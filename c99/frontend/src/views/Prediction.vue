<template>
  <div class="prediction">
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
          <span class="filter-label">预测天数:</span>
          <el-slider v-model="daysAhead" :min="3" :max="14" :step="1" style="width: 200px" />
          <span class="slider-value">{{ daysAhead }}天</span>
        </div>
      </div>
    </el-card>

    <el-row :gutter="20">
      <el-col :span="16">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">温度趋势预测 (未来{{ daysAhead }}天)</div>
          </template>
          <div ref="predictionChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">预测置信度</div>
          </template>
          <div ref="confidenceChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">预测数据详情</div>
          </template>
          <el-table :data="predictionData" border stripe size="small">
            <el-table-column prop="date" label="日期" width="120" />
            <el-table-column prop="temperature" label="温度(°C)" />
            <el-table-column prop="humidity" label="湿度(%)" />
            <el-table-column prop="pressure" label="气压(hPa)" />
            <el-table-column prop="wind_speed" label="风速(m/s)" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">模型评估</div>
          </template>
          <div class="model-evaluation">
            <div class="metric-grid">
              <div class="metric-item">
                <div class="metric-icon temp">R²</div>
                <div class="metric-info">
                  <div class="metric-value">{{ modelMetrics.r2 }}</div>
                  <div class="metric-label">决定系数</div>
                </div>
              </div>
              <div class="metric-item">
                <div class="metric-icon humidity">RMSE</div>
                <div class="metric-info">
                  <div class="metric-value">{{ modelMetrics.rmse }}</div>
                  <div class="metric-label">均方根误差</div>
                </div>
              </div>
              <div class="metric-item">
                <div class="metric-icon pressure">MAE</div>
                <div class="metric-info">
                  <div class="metric-value">{{ modelMetrics.mae }}</div>
                  <div class="metric-label">平均绝对误差</div>
                </div>
              </div>
              <div class="metric-item">
                <div class="metric-icon wind">MAPE</div>
                <div class="metric-info">
                  <div class="metric-value">{{ modelMetrics.mape }}%</div>
                  <div class="metric-label">平均绝对百分比误差</div>
                </div>
              </div>
            </div>
            <el-divider />
            <div class="model-description">
              <el-alert
                title="预测说明"
                type="info"
                :closable="false"
                description="本预测基于线性回归模型，使用历史气象数据进行训练。预测结果仅供参考，实际天气可能受多种因素影响。"
              />
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const predictionChart = ref(null)
const confidenceChart = ref(null)

let predictionChartInstance = null
let confidenceChartInstance = null

const selectedLocation = ref('北京')
const daysAhead = ref(7)

const baseTemps = {
  '北京': 18, '上海': 22, '广州': 28, '深圳': 27, '成都': 20
}

const predictionData = ref([])

const modelMetrics = ref({
  r2: 0.85,
  rmse: 1.8,
  mae: 1.5,
  mape: 6.2
})

const generatePredictionData = () => {
  const data = []
  const baseTemp = baseTemps[selectedLocation.value] || 20
  const now = new Date()

  for (let i = 1; i <= daysAhead.value; i++) {
    const date = new Date(now.getTime() + i * 24 * 3600000)
    const trend = (i / daysAhead.value) * 2
    const variation = (Math.random() - 0.5) * 3

    data.push({
      date: date.toLocaleDateString('zh-CN'),
      temperature: round(baseTemp + trend + variation, 1),
      humidity: round(50 + Math.random() * 30, 1),
      pressure: round(1013 + (Math.random() - 0.5) * 10, 1),
      wind_speed: round(2 + Math.random() * 4, 1)
    })
  }

  predictionData.value = data
}

const round = (num, decimals) => {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

const initPredictionChart = () => {
  predictionChartInstance = echarts.init(predictionChart.value)

  const actualData = []
  const now = new Date()
  const baseTemp = baseTemps[selectedLocation.value] || 20

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 3600000)
    actualData.push([
      date.toLocaleDateString('zh-CN'),
      round(baseTemp + (Math.random() - 0.5) * 4, 1)
    ])
  }

  const predictedData = []
  for (let i = 1; i <= daysAhead.value; i++) {
    const date = new Date(now.getTime() + i * 24 * 3600000)
    const trend = (i / daysAhead.value) * 2
    predictedData.push([
      date.toLocaleDateString('zh-CN'),
      round(baseTemp + trend + (Math.random() - 0.5) * 3, 1)
    ])
  }

  const allDates = [...actualData.map(d => d[0]), ...predictedData.map(d => d[0])]

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: { data: ['历史数据', '预测数据'], top: 10 },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: allDates,
      axisLabel: { rotate: 45, interval: 0 }
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: '{value}°C' }
    },
    series: [
      {
        name: '历史数据',
        type: 'line',
        smooth: true,
        data: actualData.map((d, i) => i < actualData.length ? d[1] : null),
        itemStyle: { color: '#667eea' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(102, 126, 234, 0.3)' },
            { offset: 1, color: 'rgba(102, 126, 234, 0.05)' }
          ])
        }
      },
      {
        name: '预测数据',
        type: 'line',
        smooth: true,
        data: new Array(actualData.length - 1).fill(null).concat(actualData[actualData.length - 1][1], ...predictedData.map(d => d[1])),
        itemStyle: { color: '#ff6b6b' },
        lineStyle: { type: 'dashed' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 107, 107, 0.2)' },
            { offset: 1, color: 'rgba(255, 107, 107, 0.03)' }
          ])
        }
      }
    ]
  }

  predictionChartInstance.setOption(option)
}

const initConfidenceChart = () => {
  confidenceChartInstance = echarts.init(confidenceChart.value)

  const confidenceData = []
  for (let i = 1; i <= daysAhead.value; i++) {
    const date = new Date(Date.now() + i * 24 * 3600000)
    confidenceData.push([
      date.toLocaleDateString('zh-CN'),
      round(95 - (i / daysAhead.value) * 25, 1)
    ])
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => `${params[0].axisValue}<br/>置信度: ${params[0].value}%`
    },
    grid: { left: '10%', right: '10%', bottom: '15%', top: '10%' },
    xAxis: {
      type: 'category',
      data: confidenceData.map(d => d[0]),
      axisLabel: { rotate: 45, interval: 0, fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      min: 50,
      max: 100,
      axisLabel: { formatter: '{value}%' }
    },
    series: [
      {
        name: '置信度',
        type: 'bar',
        data: confidenceData.map(d => d[1]),
        itemStyle: {
          color: (params) => {
            const value = params.value
            if (value >= 85) return '#67c23a'
            if (value >= 70) return '#e6a23c'
            return '#f56c6c'
          },
          borderRadius: [4, 4, 0, 0]
        }
      }
    ]
  }

  confidenceChartInstance.setOption(option)
}

const handleResize = () => {
  predictionChartInstance?.resize()
  confidenceChartInstance?.resize()
}

watch([selectedLocation, daysAhead], () => {
  generatePredictionData()
  initPredictionChart()
  initConfidenceChart()
})

onMounted(() => {
  generatePredictionData()
  initPredictionChart()
  initConfidenceChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  predictionChartInstance?.dispose()
  confidenceChartInstance?.dispose()
})
</script>

<style scoped>
.prediction {
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

.slider-value {
  min-width: 40px;
  font-weight: 500;
  color: #667eea;
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

.model-evaluation {
  padding: 10px;
}

.metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.metric-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.metric-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  border-radius: 8px;
  color: white;
}

.metric-icon.temp { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.metric-icon.humidity { background: linear-gradient(135deg, #4ecdc4 0%, #44a08d 100%); }
.metric-icon.pressure { background: linear-gradient(135deg, #feca57 0%, #ff9f43 100%); }
.metric-icon.wind { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%); }

.metric-info {
  flex: 1;
}

.metric-value {
  font-size: 20px;
  font-weight: bold;
  color: #303133;
}

.metric-label {
  font-size: 12px;
  color: #909399;
}

.model-description {
  margin-top: 16px;
}
</style>
