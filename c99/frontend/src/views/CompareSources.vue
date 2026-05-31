<template>
  <div class="compare-sources">
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

    <el-row :gutter="20">
      <el-col :span="16">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">多数据源数据对比</div>
          </template>
          <div ref="barChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">数据源权重</div>
          </template>
          <div ref="pieChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">数据标准差对比</div>
          </template>
          <div ref="radarChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">融合结果</div>
          </template>
          <div class="fusion-result">
            <div class="fusion-item">
              <span class="fusion-label">融合后{{ getMetricName(selectedMetric) }}:</span>
              <span class="fusion-value">{{ fusionValue }} {{ getUnit(selectedMetric) }}</span>
            </div>
            <el-divider />
            <div class="source-details">
              <div v-for="(source, index) in sourceData" :key="index" class="source-item">
                <div class="source-header">
                  <el-tag :type="source.tagType" size="small">{{ source.name }}</el-tag>
                  <span class="source-weight">权重: {{ source.weight }}%</span>
                </div>
                <div class="source-value">
                  {{ getMetricName(selectedMetric) }}: {{ source.value }} {{ getUnit(selectedMetric) }}
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="chart-card">
      <template #header>
        <div class="card-header-title">数据源详细对比表</div>
      </template>
      <el-table :data="tableData" border stripe>
        <el-table-column prop="source" label="数据源" width="150">
          <template #default="{ row }">
            <el-tag :type="row.tagType">{{ row.source }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="mean" label="平均值" />
        <el-table-column prop="min" label="最小值" />
        <el-table-column prop="max" label="最大值" />
        <el-table-column prop="std" label="标准差" />
        <el-table-column prop="count" label="样本数" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const barChart = ref(null)
const pieChart = ref(null)
const radarChart = ref(null)

let barChartInstance = null
let pieChartInstance = null
let radarChartInstance = null

const selectedLocation = ref('北京')
const selectedMetric = ref('temperature')
const fusionValue = ref(0)

const sourceData = ref([
  { name: '公开API', value: 20.5, weight: 40, tagType: 'primary' },
  { name: '本地传感器', value: 19.8, weight: 35, tagType: 'success' },
  { name: '历史数据库', value: 21.2, weight: 25, tagType: 'warning' }
])

const tableData = ref([
  { source: '公开API', mean: 20.5, min: 18.2, max: 23.8, std: 1.5, count: 100, tagType: 'primary' },
  { source: '本地传感器', mean: 19.8, min: 17.5, max: 22.9, std: 1.2, count: 120, tagType: 'success' },
  { source: '历史数据库', mean: 21.2, min: 19.0, max: 24.5, std: 1.8, count: 80, tagType: 'warning' }
])

const getMetricName = (metric) => {
  const names = {
    temperature: '温度',
    humidity: '湿度',
    pressure: '气压',
    wind_speed: '风速'
  }
  return names[metric] || metric
}

const getUnit = (metric) => {
  const units = {
    temperature: '°C',
    humidity: '%',
    pressure: 'hPa',
    wind_speed: 'm/s'
  }
  return units[metric] || ''
}

const calculateFusion = () => {
  const total = sourceData.value.reduce((sum, source) => sum + source.value * source.weight, 0)
  fusionValue.value = round(total / 100, 2)
}

const round = (num, decimals) => {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

const initBarChart = () => {
  barChartInstance = echarts.init(barChart.value)

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: { data: ['平均值', '最小值', '最大值'], top: 10 },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: tableData.value.map(d => d.source),
      axisLabel: { interval: 0 }
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: `{value} ${getUnit(selectedMetric.value)}` }
    },
    series: [
      {
        name: '平均值',
        type: 'bar',
        data: tableData.value.map(d => d.mean),
        itemStyle: { color: '#667eea', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: '最小值',
        type: 'bar',
        data: tableData.value.map(d => d.min),
        itemStyle: { color: '#4ecdc4', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: '最大值',
        type: 'bar',
        data: tableData.value.map(d => d.max),
        itemStyle: { color: '#ff6b6b', borderRadius: [4, 4, 0, 0] }
      }
    ]
  }

  barChartInstance.setOption(option)
}

const initPieChart = () => {
  pieChartInstance = echarts.init(pieChart.value)

  const option = {
    tooltip: { trigger: 'item', formatter: '{b}: {c}% ({d}%)' },
    series: [
      {
        name: '权重',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '55%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{c}%' },
        emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
        data: sourceData.value.map((s, index) => ({
          value: s.weight,
          name: s.name,
          itemStyle: { color: ['#667eea', '#4ecdc4', '#feca57'][index] }
        }))
      }
    ]
  }

  pieChartInstance.setOption(option)
}

const initRadarChart = () => {
  radarChartInstance = echarts.init(radarChart.value)

  const indicators = [
    { name: '温度偏差', max: 5 },
    { name: '湿度偏差', max: 5 },
    { name: '气压偏差', max: 5 },
    { name: '风速偏差', max: 5 },
    { name: '数据质量', max: 5 }
  ]

  const option = {
    tooltip: { trigger: 'item' },
    legend: { data: tableData.value.map(d => d.source), top: 10 },
    radar: {
      indicator: indicators,
      center: ['50%', '55%'],
      radius: 120,
      axisName: { color: '#333' },
      splitArea: { areaStyle: { color: ['rgba(102, 126, 234, 0.1)', 'rgba(102, 126, 234, 0.05)'] } }
    },
    series: [
      {
        name: '数据源标准差',
        type: 'radar',
        data: tableData.value.map((d, index) => ({
          value: [d.std, d.std * 0.8, d.std * 0.6, d.std * 1.2, 5 - d.std * 2],
          name: d.source,
          itemStyle: { color: ['#667eea', '#4ecdc4', '#feca57'][index] },
          areaStyle: { opacity: 0.2 }
        }))
      }
    ]
  }

  radarChartInstance.setOption(option)
}

const handleResize = () => {
  barChartInstance?.resize()
  pieChartInstance?.resize()
  radarChartInstance?.resize()
}

watch([selectedLocation, selectedMetric], () => {
  calculateFusion()
  initBarChart()
})

onMounted(() => {
  calculateFusion()
  initBarChart()
  initPieChart()
  initRadarChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  barChartInstance?.dispose()
  pieChartInstance?.dispose()
  radarChartInstance?.dispose()
})
</script>

<style scoped>
.compare-sources {
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

.fusion-result {
  padding: 20px;
}

.fusion-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  color: white;
}

.fusion-label {
  font-size: 16px;
  font-weight: 500;
}

.fusion-value {
  font-size: 28px;
  font-weight: bold;
}

.source-details {
  margin-top: 16px;
}

.source-item {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-bottom: 12px;
}

.source-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.source-weight {
  font-size: 14px;
  color: #909399;
}

.source-value {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}
</style>
