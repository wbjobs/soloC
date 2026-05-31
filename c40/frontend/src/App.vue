<template>
  <div class="app">
    <header class="header">
      <h1>🏭 工业设备监控系统</h1>
      <div class="header-right">
        <div class="alert-banner" v-if="activeAlerts.length > 0">
          <span class="blink">⚠️ 告警中: {{ activeAlerts.length }} 个</span>
        </div>
        <div class="alert-banner anomaly" v-if="anomalies.length > 0">
          <span class="blink">🚨 异常模式: {{ anomalies.length }} 个</span>
        </div>
      </div>
    </header>

    <div class="main-content">
      <aside class="sidebar">
        <div class="tabs">
          <button class="tab-btn" :class="{active: currentTab === 'devices'}" @click="currentTab = 'devices'">
            设备列表
          </button>
          <button class="tab-btn" :class="{active: currentTab === 'rules'}" @click="currentTab = 'rules'">
            规则管理
          </button>
        </div>

        <div v-if="currentTab === 'devices'" class="device-list">
          <div 
            v-for="device in devices" 
            :key="device.deviceId"
            class="device-item"
            :class="{ 'has-alert': device.hasAlert, 'selected': selectedDevice === device.deviceId }"
            @click="selectDevice(device.deviceId)"
          >
            <span class="device-id">{{ device.deviceId }}</span>
            <span class="device-temp" :class="getTemperatureClass(device.lastTemperature)">
              {{ device.lastTemperature.toFixed(1) }}°C
            </span>
            <span v-if="device.hasAlert" class="alert-indicator blink">🔴</span>
          </div>
        </div>

        <div v-if="currentTab === 'rules'" class="rules-panel">
          <div class="rule-form">
            <h3>新建/编辑规则</h3>
            <input v-model="editingRule.name" placeholder="规则名称" class="form-input" />
            <textarea v-model="editingRule.description" placeholder="规则描述" class="form-textarea" rows="2" />
            
            <div class="form-row">
              <label>窗口大小(秒):</label>
              <input v-model.number="editingRule.windowSeconds" type="number" class="form-input small" />
            </div>
            
            <div class="form-row">
              <label>严重级别:</label>
              <select v-model="editingRule.severity" class="form-select">
                <option value="LOW">低</option>
                <option value="MEDIUM">中</option>
                <option value="HIGH">高</option>
                <option value="CRITICAL">严重</option>
              </select>
            </div>

            <div class="conditions-section">
              <h4>条件配置</h4>
              <div v-for="(cond, idx) in editingRule.conditions" :key="idx" class="condition-item">
                <div class="condition-row">
                  <select v-model="cond.metric" class="form-select small">
                    <option value="temperature">温度</option>
                    <option value="vibration">振动</option>
                    <option value="current">电流</option>
                  </select>
                  <select v-model="cond.aggregation" class="form-select small">
                    <option value="last">当前值</option>
                    <option value="avg">平均值</option>
                    <option value="max">最大值</option>
                    <option value="min">最小值</option>
                    <option value="change">变化量</option>
                    <option value="changePercent">变化率%</option>
                  </select>
                  <select v-model="cond.operator" class="form-select small">
                    <option value=">">></option>
                    <option value=">=">>=</option>
                    <option value="<"><</option>
                    <option value="<="><=</option>
                    <option value="==">=</option>
                  </select>
                  <input v-model.number="cond.value" type="number" step="0.1" class="form-input small" />
                  <button @click="removeCondition(idx)" class="btn-small danger">✕</button>
                </div>
              </div>
              <button @click="addCondition" class="btn btn-secondary">+ 添加条件</button>
            </div>

            <input v-model="editingRule.notificationMessage" placeholder="告警消息" class="form-input" />
            
            <div class="form-actions">
              <button @click="saveRule" class="btn btn-primary">保存</button>
              <button @click="resetRule" class="btn btn-secondary">重置</button>
            </div>
          </div>

          <div class="rules-list">
            <h4>已有规则</h4>
            <div v-for="rule in rules" :key="rule.id" class="rule-item">
              <div class="rule-header">
                <span class="rule-name">{{ rule.name }}</span>
                <span class="rule-severity" :class="rule.severity.toLowerCase()">{{ rule.severity }}</span>
              </div>
              <p class="rule-desc">{{ rule.description }}</p>
              <div class="rule-actions">
                <button @click="editRule(rule)" class="btn-small">编辑</button>
                <button @click="deleteRule(rule.id)" class="btn-small danger">删除</button>
                <button @click="toggleRule(rule)" class="btn-small" :class="{active: rule.enabled}">
                  {{ rule.enabled ? '启用' : '禁用' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <section class="content">
        <div v-if="selectedDevice" class="device-detail">
          <h2>设备详情: {{ selectedDevice }}</h2>
          
          <div class="chart-container">
            <h3>实时温度曲线</h3>
            <Line :data="chartData" :options="chartOptions" />
          </div>

          <div class="chart-container">
            <h3>预测温度曲线 (未来1小时)</h3>
            <Line :data="predictionChartData" :options="predictionChartOptions" />
          </div>

          <div v-if="deviceAnomalies.length > 0" class="anomalies-section">
            <h3>检测到的异常</h3>
            <div v-for="anomaly in deviceAnomalies" :key="anomaly.id" class="anomaly-item">
              <div class="anomaly-header">
                <span class="anomaly-rule">{{ anomaly.ruleName }}</span>
                <span class="anomaly-severity" :class="anomaly.severity.toLowerCase()">{{ anomaly.severity }}</span>
                <span class="anomaly-time">{{ formatTime(anomaly.detectedAt) }}</span>
              </div>
              <p class="anomaly-msg">{{ anomaly.message }}</p>
              <button @click="acknowledgeAnomaly(anomaly.id)" class="btn-small">确认</button>
            </div>
          </div>
        </div>

        <div v-else class="no-selection">
          <p>请从左侧选择一个设备查看详情</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'
import SockJS from 'sockjs-client'
import { Client } from '@stomp/stompjs'
import axios from 'axios'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

const devices = ref([])
const activeAlerts = ref([])
const anomalies = ref([])
const deviceAnomalies = ref([])
const selectedDevice = ref(null)
const historicalData = ref([])
const predictionData = ref([])
const stompClient = ref(null)
const currentTab = ref('devices')
const rules = ref([])

const editingRule = ref({
  name: '',
  description: '',
  enabled: true,
  windowSeconds: 30,
  severity: 'MEDIUM',
  conditions: [],
  notificationMessage: ''
})

const chartData = computed(() => ({
  labels: historicalData.value.map(d => {
    const date = new Date(d.timestamp)
    return date.toLocaleTimeString()
  }),
  datasets: [{
    label: '实际温度',
    data: historicalData.value.map(d => d.temperature),
    borderColor: '#4bc0c0',
    backgroundColor: 'rgba(75, 192, 192, 0.1)',
    tension: 0.4,
    fill: true
  }]
}))

const predictionChartData = computed(() => ({
  labels: predictionData.value.map(d => {
    const date = new Date(d.timestamp)
    return date.toLocaleTimeString()
  }),
  datasets: [{
    label: '预测温度',
    data: predictionData.value.map(d => d.temperature),
    borderColor: '#ff6b6b',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderDash: [5, 5],
    tension: 0.4,
    fill: true
  }]
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#eee' } } },
  scales: {
    x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.1)' } },
    y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.1)' } }
  }
}

const predictionChartOptions = {
  ...chartOptions
}

const getTemperatureClass = (temp) => {
  if (temp > 75) return 'temp-critical'
  if (temp > 60) return 'temp-warning'
  return 'temp-normal'
}

const formatTime = (timeStr) => {
  return new Date(timeStr).toLocaleString()
}

const selectDevice = async (deviceId) => {
  selectedDevice.value = deviceId
  await loadDeviceData(deviceId)
  await loadDeviceAnomalies(deviceId)
}

const loadDeviceData = async (deviceId) => {
  try {
    const [historyRes, predictionRes] = await Promise.all([
      axios.get(`/api/devices/${deviceId}/history`),
      axios.get(`/api/devices/${deviceId}/predictions`)
    ])
    historicalData.value = historyRes.data
    predictionData.value = predictionRes.data
  } catch (error) {
    console.error('加载设备数据失败:', error)
  }
}

const loadDeviceAnomalies = async (deviceId) => {
  try {
    const res = await axios.get(`/api/rules/anomalies/${deviceId}`)
    deviceAnomalies.value = res.data
  } catch (error) {
    console.error('加载设备异常失败:', error)
  }
}

const acknowledgeAnomaly = async (eventId) => {
  try {
    await axios.post(`/api/rules/anomalies/${eventId}/acknowledge`)
    loadAnomalies()
    if (selectedDevice.value) {
      loadDeviceAnomalies(selectedDevice.value)
    }
  } catch (error) {
    console.error('确认异常失败:', error)
  }
}

const loadDevices = async () => {
  try {
    const res = await axios.get('/api/devices')
    devices.value = res.data
  } catch (error) {
    console.error('加载设备列表失败:', error)
  }
}

const loadAlerts = async () => {
  try {
    const res = await axios.get('/api/alerts')
    activeAlerts.value = res.data
  } catch (error) {
    console.error('加载告警失败:', error)
  }
}

const loadAnomalies = async () => {
  try {
    const res = await axios.get('/api/rules/anomalies')
    anomalies.value = res.data
  } catch (error) {
    console.error('加载异常失败:', error)
  }
}

const loadRules = async () => {
  try {
    const res = await axios.get('/api/rules')
    rules.value = res.data
  } catch (error) {
    console.error('加载规则失败:', error)
  }
}

const addCondition = () => {
  editingRule.value.conditions.push({
    metric: 'temperature',
    operator: '>',
    value: 0,
    aggregation: 'last'
  })
}

const removeCondition = (idx) => {
  editingRule.value.conditions.splice(idx, 1)
}

const editRule = (rule) => {
  editingRule.value = JSON.parse(JSON.stringify(rule))
}

const resetRule = () => {
  editingRule.value = {
    name: '',
    description: '',
    enabled: true,
    windowSeconds: 30,
    severity: 'MEDIUM',
    conditions: [],
    notificationMessage: ''
  }
}

const saveRule = async () => {
  try {
    if (editingRule.value.id) {
      await axios.put(`/api/rules/${editingRule.value.id}`, editingRule.value)
    } else {
      await axios.post('/api/rules', editingRule.value)
    }
    await loadRules()
    resetRule()
  } catch (error) {
    console.error('保存规则失败:', error)
  }
}

const deleteRule = async (ruleId) => {
  if (!confirm('确定删除此规则?')) return
  try {
    await axios.delete(`/api/rules/${ruleId}`)
    await loadRules()
  } catch (error) {
    console.error('删除规则失败:', error)
  }
}

const toggleRule = async (rule) => {
  rule.enabled = !rule.enabled
  try {
    await axios.put(`/api/rules/${rule.id}`, rule)
    await loadRules()
  } catch (error) {
    console.error('更新规则失败:', error)
  }
}

const connectWebSocket = () => {
  stompClient.value = new Client({
    webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
    reconnectDelay: 3000,
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
    onConnect: () => {
      console.log('WebSocket 已连接，订阅告警主题...')
      stompClient.value.subscribe('/topic/alerts', (message) => {
        try {
          const alert = JSON.parse(message.body)
          console.log('收到告警:', alert)
          loadAlerts()
          loadDevices()
        } catch (e) {
          console.error('解析告警消息失败:', e)
        }
      })
      stompClient.value.subscribe('/topic/anomalies', (message) => {
        try {
          const anomaly = JSON.parse(message.body)
          console.log('收到异常:', anomaly)
          loadAnomalies()
          if (selectedDevice.value === anomaly.deviceId) {
            loadDeviceAnomalies(selectedDevice.value)
          }
        } catch (e) {
          console.error('解析异常消息失败:', e)
        }
      })
    },
    onDisconnect: () => {
      console.log('WebSocket 断开连接，将自动重连...')
    },
    onStompError: (frame) => {
      console.error('WebSocket 错误:', frame.headers['message'])
    },
    onWebSocketClose: () => {
      console.log('WebSocket 连接关闭，准备重连...')
    },
    onWebSocketError: (error) => {
      console.error('WebSocket 底层连接错误:', error)
    }
  })
  stompClient.value.activate()
}

onMounted(() => {
  loadDevices()
  loadAlerts()
  loadAnomalies()
  loadRules()
  connectWebSocket()
  
  setInterval(() => {
    loadDevices()
    if (selectedDevice.value) {
      loadDeviceData(selectedDevice.value)
    }
  }, 5000)
})

onUnmounted(() => {
  if (stompClient.value) {
    stompClient.value.deactivate()
  }
})
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
  padding: 1rem 2rem;
  border-bottom: 2px solid #0f3460;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h1 {
  font-size: 1.5rem;
  color: #4bc0c0;
}

.header-right {
  display: flex;
  gap: 1rem;
}

.alert-banner {
  background: rgba(255, 107, 107, 0.2);
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border: 1px solid #ff6b6b;
}

.alert-banner.anomaly {
  background: rgba(255, 193, 7, 0.2);
  border-color: #ffc107;
}

.blink {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 400px;
  background: #16213e;
  padding: 1rem;
  overflow-y: auto;
  border-right: 1px solid #0f3460;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.tab-btn {
  flex: 1;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  background: #1a1a2e;
  color: #aaa;
  cursor: pointer;
  transition: all 0.3s;
}

.tab-btn.active {
  background: #4bc0c0;
  color: white;
}

.sidebar h2 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: #4bc0c0;
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.device-item {
  background: #1a1a2e;
  padding: 0.75rem;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s;
  border: 2px solid transparent;
}

.device-item:hover {
  background: #252545;
  transform: translateX(5px);
}

.device-item.selected {
  border-color: #4bc0c0;
  background: #1e3a5f;
}

.device-item.has-alert {
  border-color: #ff6b6b;
  background: rgba(255, 107, 107, 0.1);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.4); }
  50% { box-shadow: 0 0 0 10px rgba(255, 107, 107, 0); }
}

.device-id {
  font-weight: 600;
}

.temp-normal { color: #4bc0c0; }
.temp-warning { color: #ffd93d; }
.temp-critical { color: #ff6b6b; }

.content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  font-size: 1.2rem;
}

.device-detail h2 {
  margin-bottom: 1.5rem;
  color: #4bc0c0;
}

.chart-container {
  background: #16213e;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  border: 1px solid #0f3460;
}

.chart-container h3 {
  margin-bottom: 1rem;
  color: #aaa;
  font-size: 1rem;
}

.chart-container :deep(.vue-chartjs) {
  height: 300px !important;
}

.rules-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.rule-form {
  background: #1a1a2e;
  padding: 1rem;
  border-radius: 8px;
}

.rule-form h3,
.rule-form h4 {
  color: #4bc0c0;
  margin-bottom: 0.75rem;
  font-size: 1rem;
}

.form-input,
.form-textarea,
.form-select {
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 4px;
  color: #eee;
}

.form-input.small {
  width: auto;
}

.form-select.small {
  flex: 1;
  min-width: 80px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.form-row label {
  color: #aaa;
  font-size: 0.9rem;
  min-width: 80px;
}

.conditions-section {
  margin: 1rem 0;
  padding-top: 1rem;
  border-top: 1px solid #0f3460;
}

.condition-item {
  background: #16213e;
  padding: 0.5rem;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.condition-row {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary {
  background: #4bc0c0;
  color: white;
}

.btn-secondary {
  background: #666;
  color: white;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
  background: #4bc0c0;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-small.danger {
  background: #ff6b6b;
}

.btn-small.active {
  background: #666;
}

.rules-list {
  background: #1a1a2e;
  padding: 1rem;
  border-radius: 8px;
}

.rules-list h4 {
  color: #4bc0c0;
  margin-bottom: 0.75rem;
  font-size: 1rem;
}

.rule-item {
  background: #16213e;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 0.5rem;
  border-left: 3px solid #4bc0c0;
}

.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.rule-name {
  font-weight: 600;
  color: #eee;
}

.rule-severity {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.rule-severity.critical { background: #ff6b6b; color: white; }
.rule-severity.high { background: #ff9800; color: white; }
.rule-severity.medium { background: #ffc107; color: black; }
.rule-severity.low { background: #4caf50; color: white; }

.rule-desc {
  color: #aaa;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.rule-actions {
  display: flex;
  gap: 0.5rem;
}

.anomalies-section {
  background: #16213e;
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid #0f3460;
}

.anomalies-section h3 {
  color: #ffc107;
  margin-bottom: 1rem;
}

.anomaly-item {
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.anomaly-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.anomaly-rule {
  font-weight: 600;
  color: #ffc107;
}

.anomaly-severity {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.anomaly-severity.critical { background: #ff6b6b; color: white; }
.anomaly-severity.high { background: #ff9800; color: white; }
.anomaly-severity.medium { background: #ffc107; color: black; }
.anomaly-severity.low { background: #4caf50; color: white; }

.anomaly-time {
  color: #888;
  font-size: 0.85rem;
  margin-left: auto;
}

.anomaly-msg {
  color: #ddd;
  margin: 0;
}
</style>
