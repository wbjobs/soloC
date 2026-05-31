<template>
  <div class="data-export">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>数据导出</span>
          <el-tag type="success" size="small">支持 CSV/Excel</el-tag>
        </div>
      </template>

      <el-form :model="exportForm" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="选择地区">
              <el-select v-model="exportForm.location" placeholder="全部地区" clearable style="width: 100%">
                <el-option label="全部地区" value="" />
                <el-option
                  v-for="loc in locationsList"
                  :key="loc.location"
                  :label="loc.location"
                  :value="loc.location"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="数据源">
              <el-select v-model="exportForm.dataSource" placeholder="全部数据源" clearable style="width: 100%">
                <el-option label="全部数据源" value="" />
                <el-option label="公开API" value="openweather_api" />
                <el-option label="本地传感器" value="local_sensor" />
                <el-option label="历史数据库" value="historical_db" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="开始时间">
              <el-date-picker
                v-model="exportForm.startTime"
                type="datetime"
                placeholder="选择开始时间"
                style="width: 100%"
                value-format="YYYY-MM-DD HH:mm:ss"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束时间">
              <el-date-picker
                v-model="exportForm.endTime"
                type="datetime"
                placeholder="选择结束时间"
                style="width: 100%"
                value-format="YYYY-MM-DD HH:mm:ss"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="导出格式">
              <el-radio-group v-model="exportForm.format">
                <el-radio-button label="csv">CSV</el-radio-button>
                <el-radio-button label="excel">Excel</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item>
              <el-button type="primary" @click="handleExport" :loading="exporting">
                <el-icon><Download /></el-icon>
                导出数据
              </el-button>
              <el-button @click="resetForm">重置</el-button>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div v-if="lastExport" class="export-info">
        <el-alert
          :title="`上次导出: ${lastExport.filename} (${lastExport.record_count}条记录)`"
          type="success"
          :closable="false"
          show-icon
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { getLocations, exportData, downloadCSV, downloadExcel } from '../api/weather'

const exportForm = ref({
  location: '',
  dataSource: '',
  startTime: '',
  endTime: '',
  format: 'csv'
})

const locationsList = ref([])
const exporting = ref(false)
const lastExport = ref(null)

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

const handleExport = async () => {
  exporting.value = true
  try {
    const response = await exportData(
      exportForm.value.location || undefined,
      exportForm.value.dataSource || undefined,
      exportForm.value.startTime || undefined,
      exportForm.value.endTime || undefined,
      exportForm.value.format
    )

    const { filename, content, format, record_count } = response.data

    if (format === 'csv') {
      downloadCSV(content, filename)
    } else {
      downloadExcel(content, filename)
    }

    lastExport.value = { filename, record_count }
    ElMessage.success(`导出成功! 共导出 ${record_count} 条记录`)
  } catch (error) {
    console.error('导出失败:', error)
    const errorMsg = error.response?.data?.error || '导出失败，请稍后重试'
    ElMessage.error(errorMsg)
  } finally {
    exporting.value = false
  }
}

const resetForm = () => {
  exportForm.value = {
    location: '',
    dataSource: '',
    startTime: '',
    endTime: '',
    format: 'csv'
  }
  lastExport.value = null
}

onMounted(() => {
  loadLocations()
})
</script>

<style scoped>
.data-export {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.export-info {
  margin-top: 16px;
}
</style>
