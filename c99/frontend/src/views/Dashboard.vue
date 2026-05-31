<template>
  <div class="dashboard">
    <el-row :gutter="20">
      <el-col :span="24">
        <el-card class="card-header">
          <h2>气象数据总览</h2>
          <p>多源数据融合分析平台实时监控</p>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon temp-icon">🌡️</div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.metrics.temperature?.mean || '--' }}°C</div>
              <div class="stat-label">平均温度</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon humidity-icon">💧</div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.metrics.humidity?.mean || '--' }}%</div>
              <div class="stat-label">平均湿度</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon pressure-icon">📊</div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.metrics.pressure?.mean || '--' }} hPa</div>
              <div class="stat-label">平均气压</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon wind-icon">🌪️</div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.metrics.wind_speed?.mean || '--' }} m/s</div>
              <div class="stat-label">平均风速</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">温度趋势</div>
          </template>
          <div ref="tempChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">湿度趋势</div>
          </template>
          <div ref="humidityChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">数据源分布</div>
          </template>
          <div ref="sourceChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">
              告警信息
              <el-badge :value="alerts.length" class="alarm-badge" type="danger" />
            </div>
          </template>
          <div class="alerts-list">
            <div v-for="(alert, index) in alerts.slice(0, 5)" :key="index" class="alert-item">
              <el-tag :type="getAlertType(alert.alerts[0]?.severity)">
                {{ alert.location }}
              </el-tag>
              <span class="alert-message">{{ alert.alerts[0]?.message }}</span>
            </div>
            <div v-if="alerts.length === 0" class="no-alerts">
              <el-empty description="暂无告警信息" :image-size="80" />
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { getStatistics, getAlerts, getTimeSeries } from '../api/weather'

const tempChart = ref(null)
const humidityChart = ref(null)
const sourceChart = ref(null)

let tempChartInstance = null
let humidityChartInstance = null
let sourceChartInstance = null

const statistics = ref({
  metrics: {
    temperature: { mean: '--' },
    humidity: { mean: '--' },
    pressure: { mean: '--' },
    wind_speed: { mean: '--' }
  }
})

const alerts = ref([])

const getAlertType = (severity) => {
  const typeMap = {
    'warning': 'warning',
    'alert': 'warning',
    'danger': 'danger'
  }
  return typeMap[severity] || 'info'
}

const initCharts = () => {
  tempChartInstance = echarts.init(tempChart.value)
  humidityChartInstance = echarts.init(humidityChart.value)
  sourceChartInstance = echarts.init(sourceChart.value)

  const tempOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: ['北京', '上海', '广州', '深圳', '成都'] },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}°C' } },
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: true,
        data: [18, 22, 28, 27, 20],
        itemStyle: { color: '#ff6b6b' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 107, 107, 0.3)' },
            { offset: 1, color: 'rgba(255, 107, 107, 0.05)' }
          ])
        }
      }
    ]
  }

  const humidityOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: ['北京', '上海', '广州', '深圳', '成都'] },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
    series: [
      {
        name: '湿度',
        type: 'line',
        smooth: true,
        data: [45, 65, 75, 78, 60],
        itemStyle: { color: '#4ecdc4' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(78, 205, 196, 0.3)' },
            { offset: 1, color: 'rgba(78, 205, 196, 0.05)' }
          ])
        }
      }
    ]
  }

  const sourceOption = {
    tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', left: 'left' },
    series: [
      {
        name: '数据源',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}: {c}' },
        emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
        data: [
          { value: 40, name: '公开API', itemStyle: { color: '#667eea' } },
          { value: 35, name: '本地传感器', itemStyle: { color: '#764ba2' } },
          { value: 25, name: '历史数据库', itemStyle: { color: '#f093fb' } }
        ]
      }
    ]
  }

  tempChartInstance.setOption(tempOption)
  humidityChartInstance.setOption(humidityOption)
  sourceChartInstance.setOption(sourceOption)
}

const loadData = async () => {
  try {
    const [statsRes, alertsRes] = await Promise.all([
      getStatistics(),
      getAlerts()
    ])

    statistics.value = statsRes.data
    alerts.value = alertsRes.data.alerts || []
  } catch (error) {
    console.error('加载数据失败:', error)
  }
}

const handleResize = () => {
  tempChartInstance?.resize()
  humidityChartInstance?.resize()
  sourceChartInstance?.resize()
}

onMounted(() => {
  initCharts()
  loadData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tempChartInstance?.dispose()
  humidityChartInstance?.dispose()
  sourceChartInstance?.dispose()
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.card-header {
  margin-bottom: 20px;
  text-align: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.card-header h2 {
  margin-bottom: 8px;
}

.card-header p {
  opacity: 0.9;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  border: none;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  font-size: 36px;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

.chart-card {
  margin-bottom: 20px;
}

.card-header-title {
  font-weight: 600;
  font-size: 16px;
}

.chart-container {
  height: 300px;
  width: 100%;
}

.alerts-list {
  max-height: 300px;
  overflow-y: auto;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.alert-message {
  flex: 1;
  font-size: 14px;
  color: #606266;
}

.no-alerts {
  padding: 40px 0;
}

.alarm-badge {
  margin-left: 12px;
}
</style>
