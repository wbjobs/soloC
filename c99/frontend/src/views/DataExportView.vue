<template>
  <div class="data-export-view">
    <el-row :gutter="20">
      <el-col :span="24">
        <DataExport />
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header-title">导出说明</div>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="支持格式">
              <el-tag type="success">CSV</el-tag>
              <el-tag type="primary" style="margin-left: 8px;">Excel</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="筛选条件">
              <span>按地区、数据源、时间范围筛选导出</span>
            </el-descriptions-item>
            <el-descriptions-item label="包含字段">
              <span>时间戳、地点、经纬度、温度、湿度、气压、风速、风向、降水量、数据源、质量评分</span>
            </el-descriptions-item>
            <el-descriptions-item label="编码格式">
              <el-tag type="warning">UTF-8 with BOM (兼容Excel中文)</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header-title">数据统计</div>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="总记录数">
              <span v-if="stats.total_records">{{ stats.total_records }}</span>
              <span v-else class="loading-text">加载中...</span>
            </el-descriptions-item>
            <el-descriptions-item label="覆盖地区">
              <span v-if="stats.locations">{{ stats.locations.length }}</span>
              <span v-else class="loading-text">加载中...</span>
            </el-descriptions-item>
            <el-descriptions-item label="数据源">
              <span v-if="stats.data_sources">{{ stats.data_sources.join(', ') }}</span>
              <span v-else class="loading-text">加载中...</span>
            </el-descriptions-item>
            <el-descriptions-item label="数据时间范围">
              <span v-if="stats.date_range">
                {{ stats.date_range.start }} ~ {{ stats.date_range.end }}
              </span>
              <span v-else class="loading-text">加载中...</span>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import DataExport from '../components/DataExport.vue'
import { getStatistics } from '../api/weather'

const stats = ref({
  total_records: null,
  locations: [],
  data_sources: [],
  date_range: null
})

const loadStats = async () => {
  try {
    const response = await getStatistics()
    if (response.data) {
      stats.value = response.data
    }
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
}

onMounted(() => {
  loadStats()
})
</script>

<style scoped>
.data-export-view {
  padding: 0;
}

.card-header-title {
  font-weight: 600;
  font-size: 16px;
}

.loading-text {
  color: #909399;
}
</style>
