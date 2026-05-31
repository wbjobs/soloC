<template>
  <div class="min-h-screen bg-gray-100">
    <header class="bg-white shadow-md">
      <div class="max-w-7xl mx-auto px-4 py-6">
        <h1 class="text-3xl font-bold text-gray-800">AI Gateway 管理面板</h1>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-8">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-2">总请求数</h3>
          <p class="text-4xl font-bold text-blue-600">{{ stats.total_requests || 0 }}</p>
        </div>
        
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-2">缓存命中</h3>
          <p class="text-4xl font-bold text-green-600">{{ stats.total_cached || 0 }}</p>
        </div>
        
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-2">缓存命中率</h3>
          <p class="text-4xl font-bold text-purple-600">{{ (stats.cache_hit_rate || 0).toFixed(2) }}%</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-4">模型路由分布</h3>
          <div class="h-64">
            <canvas ref="modelChart"></canvas>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-4">各模型缓存命中率</h3>
          <div class="space-y-4">
            <div v-for="(modelStats, modelName) in stats.models" :key="modelName" class="p-4 bg-gray-50 rounded-lg">
              <div class="flex justify-between items-center mb-2">
                <span class="font-medium text-gray-800">{{ modelName }}</span>
                <span class="text-sm text-gray-600">
                  {{ ((modelStats.cached_requests || 0) / (modelStats.total_requests || 1) * 100).toFixed(1) }}% 命中
                </span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div 
                  class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  :style="{ width: ((modelStats.cached_requests || 0) / (modelStats.total_requests || 1) * 100) + '%' }"
                ></div>
              </div>
              <div class="flex justify-between mt-2 text-sm text-gray-500">
                <span>总请求: {{ modelStats.total_requests || 0 }}</span>
                <span>缓存: {{ modelStats.cached_requests || 0 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6 mb-8">
        <h3 class="text-lg font-semibold text-gray-700 mb-4">测试 AI Gateway</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">输入 Prompt</label>
            <textarea 
              v-model="testPrompt" 
              class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows="4"
              placeholder="请输入要测试的 prompt..."
            ></textarea>
          </div>
          <div class="flex gap-4">
            <button 
              @click="sendTestRequest"
              :disabled="loading"
              class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ loading ? '发送中...' : '发送请求' }}
            </button>
            <button 
              @click="clearCache"
              class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              清除缓存
            </button>
          </div>
          
          <div v-if="testResult" class="p-4 bg-gray-50 rounded-lg">
            <div class="flex gap-4 mb-3">
              <span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                模型: {{ testResult.model }}
              </span>
              <span 
                class="px-3 py-1 rounded-full text-sm font-medium"
                :class="testResult.cached ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'"
              >
                {{ testResult.cached ? '缓存命中' : '未命中缓存' }}
              </span>
            </div>
            <p class="text-gray-700">{{ testResult.response }}</p>
          </div>
        </div>
      </div>

      <div class="flex justify-center">
        <button 
          @click="refreshStats"
          class="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
        >
          刷新统计数据
        </button>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import axios from 'axios'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const stats = ref({})
const testPrompt = ref('')
const testResult = ref(null)
const loading = ref(false)
const modelChart = ref(null)
let chartInstance = null

const refreshStats = async () => {
  try {
    const response = await axios.get('/api/stats')
    stats.value = response.data
    await nextTick()
    updateChart()
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

const sendTestRequest = async () => {
  if (!testPrompt.value.trim()) return
  
  loading.value = true
  testResult.value = null
  
  try {
    const response = await axios.post('/api/chat', {
      prompt: testPrompt.value
    })
    testResult.value = response.data
    await refreshStats()
  } catch (error) {
    console.error('请求失败:', error)
    alert('请求失败，请检查后端服务是否正常运行')
  } finally {
    loading.value = false
  }
}

const clearCache = async () => {
  try {
    await axios.post('/api/cache/clear')
    alert('缓存已清除')
    await refreshStats()
  } catch (error) {
    console.error('清除缓存失败:', error)
  }
}

const updateChart = () => {
  if (!modelChart.value) return
  
  const models = stats.value.models || {}
  const labels = Object.keys(models)
  const data = labels.map(name => models[name]?.total_requests || 0)
  
  if (chartInstance) {
    chartInstance.destroy()
  }
  
  chartInstance = new Chart(modelChart.value, {
    type: 'doughnut',
    data: {
      labels: labels.length > 0 ? labels : ['Claude', 'DeepSeek', 'Qwen'],
      datasets: [{
        data: data.length > 0 ? data : [0, 0, 0],
        backgroundColor: [
          'rgb(59, 130, 246)',
          'rgb(16, 185, 129)',
          'rgb(139, 92, 246)'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  })
}

onMounted(() => {
  refreshStats()
  setInterval(refreshStats, 5000)
})
</script>
