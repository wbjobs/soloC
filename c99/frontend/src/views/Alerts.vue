<template>
  <div class="alerts">
    <el-card class="filter-card">
      <div class="filter-row">
        <div class="filter-item">
          <span class="filter-label">告警级别:</span>
          <el-select v-model="selectedLevel" placeholder="全部" style="width: 120px" clearable>
            <el-option label="危险" value="danger" />
            <el-option label="警告" value="warning" />
            <el-option label="提示" value="info" />
          </el-select>
        </div>
        <div class="filter-item">
          <span class="filter-label">告警类型:</span>
          <el-select v-model="selectedType" placeholder="全部" style="width: 150px" clearable>
            <el-option label="高温预警" value="HIGH_TEMP" />
            <el-option label="低温预警" value="LOW_TEMP" />
            <el-option label="暴雨预警" value="HEAVY_RAIN" />
            <el-option label="大风预警" value="HIGH_WIND" />
          </el-select>
        </div>
      </div>
    </el-card>

    <el-row :gutter="20">
      <el-col :span="6">
        <el-card class="stat-card danger">
          <div class="stat-content">
            <div class="stat-icon">🚨</div>
            <div class="stat-info">
              <div class="stat-value">{{ alertStats.danger }}</div>
              <div class="stat-label">危险告警</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card warning">
          <div class="stat-content">
            <div class="stat-icon">⚠️</div>
            <div class="stat-info">
              <div class="stat-value">{{ alertStats.warning }}</div>
              <div class="stat-label">警告告警</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card info">
          <div class="stat-content">
            <div class="stat-icon">ℹ️</div>
            <div class="stat-info">
              <div class="stat-value">{{ alertStats.info }}</div>
              <div class="stat-label">提示信息</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card total">
          <div class="stat-content">
            <div class="stat-icon">📊</div>
            <div class="stat-info">
              <div class="stat-value">{{ alertStats.total }}</div>
              <div class="stat-label">告警总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">各地区告警分布</div>
          </template>
          <div ref="locationChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">告警类型统计</div>
          </template>
          <div ref="typeChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="chart-card">
      <template #header>
        <div class="card-header-title">告警列表</div>
      </template>
      <el-table :data="filteredAlerts" border stripe>
        <el-table-column prop="level" label="级别" width="100">
          <template #default="{ row }">
            <el-tag :type="row.level" size="small">{{ getLevelText(row.level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column prop="location" label="地区" width="100" />
        <el-table-column prop="message" label="告警内容" />
        <el-table-column prop="time" label="时间" width="180" />
        <el-table-column label="操作" width="100">
          <template #default>
            <el-button type="primary" size="small" link>详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="chart-card">
      <template #header>
        <div class="card-header-title">告警规则配置</div>
      </template>
      <el-table :data="alertRules" border stripe>
        <el-table-column prop="name" label="规则名称" width="150" />
        <el-table-column prop="metric" label="指标" width="100" />
        <el-table-column prop="threshold" label="阈值" width="150">
          <template #default="{ row }">
            {{ row.operator }} {{ row.value }} {{ row.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="level" label="告警级别" width="100">
          <template #default="{ row }">
            <el-tag :type="row.level" size="small">{{ getLevelText(row.level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="enabled" label="状态" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default>
            <el-button type="primary" size="small" link>编辑</el-button>
            <el-button type="danger" size="small" link>删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'

const locationChart = ref(null)
const typeChart = ref(null)

let locationChartInstance = null
let typeChartInstance = null

const selectedLevel = ref('')
const selectedType = ref('')

const alertStats = ref({
  danger: 3,
  warning: 8,
  info: 5,
  total: 16
})

const alerts = ref([
  { level: 'danger', type: '暴雨预警', location: '广州', message: '降水量超过50mm/h，请注意防范', time: '2024-01-15 14:30:00' },
  { level: 'danger', type: '暴雨预警', location: '深圳', message: '降水量超过50mm/h，请注意防范', time: '2024-01-15 14:25:00' },
  { level: 'danger', type: '大风预警', location: '上海', message: '风速超过20m/s，请注意防范', time: '2024-01-15 13:15:00' },
  { level: 'warning', type: '高温预警', location: '广州', message: '温度超过35°C，请注意防暑', time: '2024-01-15 12:00:00' },
  { level: 'warning', type: '高温预警', location: '深圳', message: '温度超过35°C，请注意防暑', time: '2024-01-15 11:45:00' },
  { level: 'warning', type: '高温预警', location: '北京', message: '温度超过35°C，请注意防暑', time: '2024-01-15 11:30:00' },
  { level: 'warning', type: '大风预警', location: '北京', message: '风速超过15m/s，请注意防范', time: '2024-01-15 10:20:00' },
  { level: 'warning', type: '低温预警', location: '成都', message: '温度低于0°C，请注意保暖', time: '2024-01-15 09:00:00' },
  { level: 'info', type: '高温预警', location: '上海', message: '温度超过30°C，请注意防暑', time: '2024-01-15 08:30:00' },
  { level: 'info', type: '大风预警', location: '成都', message: '风速超过10m/s', time: '2024-01-15 08:00:00' }
])

const alertRules = ref([
  { name: '高温危险预警', metric: '温度', operator: '>=', value: 38, unit: '°C', level: 'danger', enabled: true },
  { name: '高温警告预警', metric: '温度', operator: '>=', value: 35, unit: '°C', level: 'warning', enabled: true },
  { name: '低温警告预警', metric: '温度', operator: '<=', value: 0, unit: '°C', level: 'warning', enabled: true },
  { name: '暴雨危险预警', metric: '降水量', operator: '>=', value: 50, unit: 'mm/h', level: 'danger', enabled: true },
  { name: '大风警告预警', metric: '风速', operator: '>=', value: 15, unit: 'm/s', level: 'warning', enabled: true },
  { name: '高湿度预警', metric: '湿度', operator: '>=', value: 90, unit: '%', level: 'info', enabled: false }
])

const filteredAlerts = computed(() => {
  return alerts.value.filter(alert => {
    const levelMatch = !selectedLevel.value || alert.level === selectedLevel.value
    const typeMatch = !selectedType.value || alert.type.includes(selectedType.value)
    return levelMatch && typeMatch
  })
})

const getLevelText = (level) => {
  const map = { danger: '危险', warning: '警告', info: '提示' }
  return map[level] || level
}

const initLocationChart = () => {
  locationChartInstance = echarts.init(locationChart.value)

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: { data: ['危险', '警告', '提示'], top: 10 },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: ['北京', '上海', '广州', '深圳', '成都']
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: '危险',
        type: 'bar',
        stack: 'total',
        data: [0, 1, 1, 1, 0],
        itemStyle: { color: '#f56c6c' }
      },
      {
        name: '警告',
        type: 'bar',
        stack: 'total',
        data: [2, 0, 1, 1, 1],
        itemStyle: { color: '#e6a23c' }
      },
      {
        name: '提示',
        type: 'bar',
        stack: 'total',
        data: [0, 1, 0, 0, 1],
        itemStyle: { color: '#909399' }
      }
    ]
  }

  locationChartInstance.setOption(option)
}

const initTypeChart = () => {
  typeChartInstance = echarts.init(typeChart.value)

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center'
    },
    series: [
      {
        name: '告警类型',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}: {c}' },
        data: [
          { value: 4, name: '高温预警', itemStyle: { color: '#ff6b6b' } },
          { value: 1, name: '低温预警', itemStyle: { color: '#667eea' } },
          { value: 2, name: '暴雨预警', itemStyle: { color: '#4ecdc4' } },
          { value: 3, name: '大风预警', itemStyle: { color: '#feca57' } },
          { value: 2, name: '其他', itemStyle: { color: '#909399' } }
        ]
      }
    ]
  }

  typeChartInstance.setOption(option)
}

const handleResize = () => {
  locationChartInstance?.resize()
  typeChartInstance?.resize()
}

onMounted(() => {
  initLocationChart()
  initTypeChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  locationChartInstance?.dispose()
  typeChartInstance?.dispose()
})
</script>

<style scoped>
.alerts {
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

.stat-card {
  margin-bottom: 20px;
}

.stat-card.danger { border-top: 4px solid #f56c6c; }
.stat-card.warning { border-top: 4px solid #e6a23c; }
.stat-card.info { border-top: 4px solid #909399; }
.stat-card.total { border-top: 4px solid #667eea; }

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
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
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
</style>
