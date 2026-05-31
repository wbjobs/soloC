<template>
  <div class="map-view">
    <el-card class="filter-card">
      <div class="filter-row">
        <div class="filter-item">
          <span class="filter-label">选择地区:</span>
          <el-select v-model="selectedLocation" placeholder="全部地区" clearable style="width: 150px" @change="loadMapData">
            <el-option label="全部地区" value="" />
            <el-option
              v-for="loc in locationsList"
              :key="loc.location"
              :label="loc.location"
              :value="loc.location"
            />
          </el-select>
        </div>
        <div class="filter-item">
          <span class="filter-label">选择指标:</span>
          <el-radio-group v-model="selectedMetric" @change="updateMap">
            <el-radio-button label="temperature">温度</el-radio-button>
            <el-radio-button label="humidity">湿度</el-radio-button>
            <el-radio-button label="pressure">气压</el-radio-button>
            <el-radio-button label="wind_speed">风速</el-radio-button>
          </el-radio-group>
        </div>
        <div class="filter-item">
          <el-button type="primary" @click="refreshMapData" :loading="loading">
            刷新数据
          </el-button>
        </div>
      </div>
    </el-card>

    <el-card class="map-card">
      <template #header>
        <div class="card-header-title">气象数据地图分布</div>
      </template>
      <div v-if="loading" class="loading-container">
        <el-spinner size="50" />
        <p>数据加载中...</p>
      </div>
      <div v-else-if="!hasData" class="no-data-container">
        <el-empty description="暂无气象数据" />
      </div>
      <div ref="mapChart" class="map-container" v-show="hasData && !loading"></div>
    </el-card>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">各地区温度对比</div>
          </template>
          <div ref="barChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header-title">数据详情</div>
          </template>
          <el-table :data="locationData" border stripe v-loading="loading">
            <el-table-column prop="location" label="地区" width="120" />
            <el-table-column prop="temperature" label="温度(°C)" />
            <el-table-column prop="humidity" label="湿度(%)" />
            <el-table-column prop="pressure" label="气压(hPa)" />
            <el-table-column prop="wind_speed" label="风速(m/s)" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'
import { getLatest, getLocations } from '../api/weather'

const mapChart = ref(null)
const barChart = ref(null)

let mapChartInstance = null
let barChartInstance = null

const selectedMetric = ref('temperature')
const selectedLocation = ref('')
const loading = ref(false)
const locationData = ref([])
const locationsList = ref([])

const hasData = computed(() => locationData.value.length > 0)

const chinaCitiesCoordinates = {
  '北京': [116.4074, 39.9042],
  '上海': [121.4737, 31.2304],
  '广州': [113.2644, 23.1291],
  '深圳': [114.0579, 22.5431],
  '成都': [104.0668, 30.5728],
  '哈尔滨': [126.5349, 45.8038],
  '乌鲁木齐': [87.6177, 43.8256],
  '拉萨': [91.1172, 29.6469],
  '昆明': [102.8329, 24.8801],
  '海口': [110.1999, 20.0442],
  '沈阳': [123.4315, 41.8057],
  '长春': [125.3235, 43.8171],
  '呼和浩特': [111.7519, 40.8415],
  '银川': [106.2309, 38.4872],
  '兰州': [103.8236, 36.0581],
  '西宁': [101.7782, 36.6171],
  '西安': [108.9398, 34.3416],
  '重庆': [106.5049, 29.5332],
  '贵阳': [106.6302, 26.6477],
  '南宁': [108.3200, 22.8240],
  '长沙': [112.9388, 28.2282],
  '武汉': [114.3054, 30.5931],
  '郑州': [113.6654, 34.7579],
  '石家庄': [114.5149, 38.0423],
  '济南': [117.1201, 36.6512],
  '南京': [118.7969, 32.0603],
  '合肥': [117.2272, 31.8206],
  '杭州': [120.1536, 30.2875],
  '福州': [119.2965, 26.0745],
  '南昌': [115.8922, 28.6765],
  '天津': [117.2009, 39.0842],
  '太原': [112.5489, 37.8706],
  '青岛': [120.3826, 36.0671],
  '大连': [121.6147, 38.9140],
  '厦门': [118.0894, 24.4798],
  '三亚': [109.5119, 18.2528],
  '丽江': [100.2222, 26.8721],
  '桂林': [110.2992, 25.2737]
}

const getCityCoordinates = (location, lat, lon) => {
  if (lat && lon) {
    return [lon, lat]
  }
  return chinaCitiesCoordinates[location] || [104.0, 35.0]
}

const loadLocations = async () => {
  try {
    const response = await getLocations()
    if (response.data && response.data.locations) {
      locationsList.value = response.data.locations
    }
  } catch (error) {
    console.error('加载位置列表失败:', error)
  }
}

const loadMapData = async () => {
  loading.value = true
  try {
    const response = await getLatest(selectedLocation.value)
    if (response.data) {
      const records = Array.isArray(response.data) ? response.data : []

      const aggregated = {}
      records.forEach(record => {
        const loc = record.location
        if (!aggregated[loc]) {
          aggregated[loc] = {
            location: loc,
            latitude: record.latitude,
            longitude: record.longitude,
            temperature: [],
            humidity: [],
            pressure: [],
            wind_speed: []
          }
        }
        if (record.temperature !== null) aggregated[loc].temperature.push(record.temperature)
        if (record.humidity !== null) aggregated[loc].humidity.push(record.humidity)
        if (record.pressure !== null) aggregated[loc].pressure.push(record.pressure)
        if (record.wind_speed !== null) aggregated[loc].wind_speed.push(record.wind_speed)
      })

      locationData.value = Object.values(aggregated).map(item => ({
        location: item.location,
        latitude: item.latitude,
        longitude: item.longitude,
        temperature: item.temperature.length > 0
          ? Math.round(item.temperature.reduce((a, b) => a + b, 0) / item.temperature.length * 10) / 10
          : null,
        humidity: item.humidity.length > 0
          ? Math.round(item.humidity.reduce((a, b) => a + b, 0) / item.humidity.length * 10) / 10
          : null,
        pressure: item.pressure.length > 0
          ? Math.round(item.pressure.reduce((a, b) => a + b, 0) / item.pressure.length * 10) / 10
          : null,
        wind_speed: item.wind_speed.length > 0
          ? Math.round(item.wind_speed.reduce((a, b) => a + b, 0) / item.wind_speed.length * 10) / 10
          : null
      }))

      initMapChart()
      initBarChart()
    }
  } catch (error) {
    console.error('加载地图数据失败:', error)
  } finally {
    loading.value = false
  }
}

const refreshMapData = () => {
  loadMapData()
}

const initMapChart = () => {
  if (!mapChart.value) return

  if (mapChartInstance) {
    mapChartInstance.dispose()
  }

  mapChartInstance = echarts.init(mapChart.value)

  const convertData = () => {
    const res = []
    locationData.value.forEach((item) => {
      const coord = getCityCoordinates(item.location, item.latitude, item.longitude)
      const value = item[selectedMetric.value]
      if (value !== null && value !== undefined) {
        res.push({
          name: item.location,
          value: coord.concat(value)
        })
      }
    })
    return res
  }

  const getVisualMapRange = () => {
    const values = locationData.value
      .map(d => d[selectedMetric.value])
      .filter(v => v !== null && v !== undefined)

    if (values.length === 0) {
      return { min: 0, max: 40 }
    }

    const min = Math.floor(Math.min(...values) * 0.9)
    const max = Math.ceil(Math.max(...values) * 1.1)
    return { min, max }
  }

  const range = getVisualMapRange()
  const chartData = convertData()

  const option = {
    backgroundColor: '#fff',
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const data = locationData.value.find(d => d.location === params.name)
        if (data) {
          return `
            <strong>${params.name}</strong><br/>
            温度: ${data.temperature !== null ? data.temperature + '°C' : 'N/A'}<br/>
            湿度: ${data.humidity !== null ? data.humidity + '%' : 'N/A'}<br/>
            气压: ${data.pressure !== null ? data.pressure + ' hPa' : 'N/A'}<br/>
            风速: ${data.wind_speed !== null ? data.wind_speed + ' m/s' : 'N/A'}
          `
        }
        return params.name
      }
    },
    geo: {
      map: 'china',
      roam: true,
      zoom: 1.2,
      center: [104.0, 35.0],
      label: {
        show: true,
        fontSize: 10,
        color: '#333'
      },
      itemStyle: {
        areaColor: '#f0f5ff',
        borderColor: '#667eea',
        borderWidth: 1
      },
      emphasis: {
        itemStyle: { areaColor: '#e6f7ff' }
      },
      scaleLimit: {
        min: 0.8,
        max: 5
      }
    },
    visualMap: {
      min: range.min,
      max: range.max,
      left: 'left',
      bottom: 'bottom',
      text: ['高', '低'],
      calculable: true,
      inRange: {
        color: ['#e0f7fa', '#80deea', '#26c6da', '#00acc1', '#00838f']
      }
    },
    series: [
      {
        name: '气象数据',
        type: 'scatter',
        coordinateSystem: 'geo',
        data: chartData,
        symbolSize: (val) => {
          const size = Math.abs(val[2]) / 2
          return Math.max(Math.min(size, 50), 10)
        },
        encode: { value: 2 },
        label: {
          show: true,
          formatter: '{b}',
          position: 'right',
          fontSize: 12,
          color: '#333'
        },
        itemStyle: {
          color: '#ff6b6b',
          shadowBlur: 10,
          shadowColor: 'rgba(255, 107, 107, 0.5)'
        },
        emphasis: {
          itemStyle: { color: '#ee5a5a' }
        }
      },
      {
        name: 'Top3',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        data: chartData
          .sort((a, b) => b.value[2] - a.value[2])
          .slice(0, 3),
        symbolSize: (val) => Math.max(Math.abs(val[2]) / 2 + 5, 20),
        encode: { value: 2 },
        showEffectOn: 'render',
        rippleEffect: {
          brushType: 'stroke',
          scale: 3,
          period: 4
        },
        itemStyle: {
          color: '#feca57',
          shadowBlur: 10,
          shadowColor: '#feca57'
        }
      }
    ]
  }

  mapChartInstance.setOption(option)

  mapChartInstance.on('click', (params) => {
    if (params.componentType === 'series') {
      selectedLocation.value = params.name
    }
  })
}

const initBarChart = () => {
  if (!barChart.value) return

  if (barChartInstance) {
    barChartInstance.dispose()
  }

  barChartInstance = echarts.init(barChart.value)

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: locationData.value.map(d => d.location),
      axisLabel: {
        interval: 0,
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: '{value}°C'
      }
    },
    series: [
      {
        name: '温度',
        type: 'bar',
        data: locationData.value.map(d => d.temperature),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#667eea' },
            { offset: 1, color: '#764ba2' }
          ]),
          borderRadius: [4, 4, 0, 0]
        },
        barWidth: '50%'
      }
    ]
  }

  barChartInstance.setOption(option)
}

const updateMap = () => {
  if (mapChartInstance) {
    initMapChart()
  }
}

const handleResize = () => {
  mapChartInstance?.resize()
  barChartInstance?.resize()
}

onMounted(async () => {
  await loadLocations()
  await loadMapData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  mapChartInstance?.dispose()
  barChartInstance?.dispose()
})
</script>

<style scoped>
.map-view {
  padding: 0;
}

.filter-card {
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 24px;
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
  white-space: nowrap;
}

.map-card {
  margin-bottom: 20px;
}

.card-header-title {
  font-weight: 600;
  font-size: 16px;
}

.map-container {
  height: 500px;
  width: 100%;
}

.chart-card {
  margin-bottom: 20px;
}

.chart-container {
  height: 350px;
  width: 100%;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 500px;
  color: #909399;
}

.loading-container p {
  margin-top: 16px;
}

.no-data-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 500px;
}
</style>
