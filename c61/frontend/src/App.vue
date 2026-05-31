<template>
  <div class="container">
    <div class="header">
      <h1>🔧 Modbus TCP 监控系统</h1>
      <p>实时监控设备数据 · 远程设置阈值 · 历史数据查询</p>
    </div>

    <div class="device-selector">
      <button 
        v-for="device in devices" 
        :key="device"
        :class="['device-btn', { active: selectedDevice === device }]"
        @click="selectDevice(device)"
      >
        设备 {{ device }}
      </button>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <h3>🌡️ 温度 (°C)</h3>
        <div ref="tempChart" class="chart-container"></div>
      </div>
      <div class="chart-card">
        <h3>💨 压力 (kPa)</h3>
        <div ref="pressureChart" class="chart-container"></div>
      </div>
      <div class="chart-card">
        <h3>⚙️ 转速 (RPM)</h3>
        <div ref="speedChart" class="chart-container"></div>
      </div>
    </div>

    <div class="sliders-section">
      <h3>🎚️ 阈值设置</h3>
      <div class="sliders-grid">
        <div class="slider-item">
          <label>
            温度阈值
            <span class="value">{{ thresholds.temp }} °C</span>
          </label>
          <input 
            type="range" 
            v-model.number="thresholds.temp" 
            min="0" 
            max="100" 
            step="1"
            @change="setThreshold(3, thresholds.temp)"
          >
        </div>
        <div class="slider-item">
          <label>
            压力阈值
            <span class="value">{{ thresholds.pressure }} kPa</span>
          </label>
          <input 
            type="range" 
            v-model.number="thresholds.pressure" 
            min="50" 
            max="250" 
            step="1"
            @change="setThreshold(4, thresholds.pressure)"
          >
        </div>
        <div class="slider-item">
          <label>
            转速阈值
            <span class="value">{{ thresholds.speed }} RPM</span>
          </label>
          <input 
            type="range" 
            v-model.number="thresholds.speed" 
            min="1000" 
            max="3500" 
            step="50"
            @change="setThreshold(5, thresholds.speed)"
          >
        </div>
      </div>
    </div>

    <div class="status-section">
      <h3>📊 实时状态</h3>
      <div class="status-grid">
        <div class="status-item">
          <span class="label">设备状态</span>
          <span class="value normal">运行中</span>
        </div>
        <div class="status-item">
          <span class="label">报警状态</span>
          <span :class="['value', alarmStatus ? 'alarm' : 'normal']">
            {{ alarmStatus ? '⚠️ 报警' : '✅ 正常' }}
          </span>
        </div>
      </div>
    </div>

    <div class="history-section">
      <h3>📜 历史数据查询</h3>
      <div class="history-controls">
        <select v-model="historyRegister">
          <option v-for="(name, index) in registerNames" :key="index" :value="index">
            {{ name }}
          </option>
        </select>
        <select v-model="historyLimit">
          <option :value="20">最近 20 条</option>
          <option :value="50">最近 50 条</option>
          <option :value="100">最近 100 条</option>
        </select>
        <button @click="fetchHistory">查询</button>
      </div>
      <table class="history-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>设备</th>
            <th>寄存器</th>
            <th>值</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in historyData" :key="record.id">
            <td>{{ formatTime(record.timestamp) }}</td>
            <td>{{ record.device_id }}</td>
            <td>{{ registerNames[record.register_address] || record.register_address }}</td>
            <td>{{ record.value.toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="rules-section">
      <h3>⚙️ 报警规则引擎</h3>
      <div class="rules-header">
        <button class="btn-primary" @click="showRuleModal = true">+ 新建规则</button>
      </div>
      
      <div class="rules-list">
        <div class="rule-card" v-for="rule in rules" :key="rule.id">
          <div class="rule-header">
            <div class="rule-title">
              <span class="rule-name">{{ rule.name }}</span>
              <span :class="['rule-status', rule.enabled ? 'enabled' : 'disabled']">
                {{ rule.enabled ? '已启用' : '已禁用' }}
              </span>
            </div>
            <div class="rule-actions">
              <button class="btn-small" @click="editRule(rule)">编辑</button>
              <button class="btn-small btn-danger" @click="deleteRule(rule.id)">删除</button>
              <button class="btn-small btn-success" @click="toggleRule(rule)">
                {{ rule.enabled ? '禁用' : '启用' }}
              </button>
            </div>
          </div>
          <div class="rule-description">{{ rule.description }}</div>
          <div class="rule-preview">
            <span class="preview-label">条件: </span>
            <span class="preview-value">{{ formatConditionPreview(rule.condition) }}</span>
          </div>
          <div class="rule-preview">
            <span class="preview-label">动作: </span>
            <span class="preview-value">{{ formatActionsPreview(rule.actions) }}</span>
          </div>
        </div>
        <div v-if="rules.length === 0" class="empty-state">
          暂无规则，点击上方按钮创建新规则
        </div>
      </div>

      <div class="rule-logs-section" style="margin-top: 30px;">
        <h4>📋 规则执行日志</h4>
        <table class="history-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>规则ID</th>
              <th>设备</th>
              <th>状态</th>
              <th>消息</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in ruleLogs" :key="log.id">
              <td>{{ formatTime(log.timestamp) }}</td>
              <td>{{ log.rule_id }}</td>
              <td>{{ log.device_id }}</td>
              <td :class="log.triggered ? 'alarm' : 'normal'">
                {{ log.triggered ? '✅ 触发' : '⏸️ 未触发' }}
              </td>
              <td>{{ log.message || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showRuleModal" class="modal-overlay" @click.self="showRuleModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ editingRule ? '编辑规则' : '新建规则' }}</h3>
          <button class="close-btn" @click="showRuleModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>规则名称</label>
            <input type="text" v-model="ruleForm.name" class="form-input" placeholder="输入规则名称">
          </div>
          <div class="form-group">
            <label>规则描述</label>
            <input type="text" v-model="ruleForm.description" class="form-input" placeholder="输入规则描述">
          </div>
          
          <div class="condition-builder">
            <h4>条件配置</h4>
            <div class="condition-tree">
              <div class="condition-node">
                <select v-model="ruleForm.condition.type" class="form-select">
                  <option value="AND">AND (全部满足)</option>
                  <option value="OR">OR (任一满足)</option>
                  <option value="COMPARISON">简单比较</option>
                </select>
                
                <template v-if="ruleForm.condition.type === 'COMPARISON'">
                  <div class="comparison-row">
                    <select v-model="ruleForm.condition.register" class="form-select">
                      <option v-for="(name, index) in registerNames" :key="index" :value="index">
                        {{ name }}
                      </option>
                    </select>
                    <select v-model="ruleForm.condition.operator" class="form-select">
                      <option value=">">大于 (>)</option>
                      <option value=">=">大于等于 (>=)</option>
                      <option value="<">小于 (<)</option>
                      <option value="<=">小于等于 (<=)</option>
                      <option value="==">等于 (==)</option>
                      <option value="!=">不等于 (!=)</option>
                    </select>
                    <input type="number" v-model.number="ruleForm.condition.value" class="form-input" placeholder="值">
                  </div>
                </template>
                
                <template v-else>
                  <div class="children-conditions">
                    <div class="child-condition" v-for="(child, index) in ruleForm.condition.children" :key="index">
                      <select v-model="child.register" class="form-select">
                        <option v-for="(name, idx) in registerNames" :key="idx" :value="idx">
                          {{ name }}
                        </option>
                      </select>
                      <select v-model="child.operator" class="form-select">
                        <option value=">">></option>
                        <option value=">=">>=</option>
                        <option value="<"><</option>
                        <option value="<="><=</option>
                        <option value="==">==</option>
                        <option value="!=">!=</option>
                      </select>
                      <input type="number" v-model.number="child.value" class="form-input" style="width: 80px;">
                      <button class="btn-small btn-danger" @click="removeCondition(index)" v-if="ruleForm.condition.children.length > 1">×</button>
                    </div>
                    <button class="btn-small btn-add" @click="addCondition">+ 添加条件</button>
                  </div>
                </template>
              </div>
            </div>
          </div>
          
          <div class="actions-builder">
            <h4>动作配置</h4>
            <div class="action-list">
              <div class="action-item" v-for="(action, index) in ruleForm.actions" :key="index">
                <select v-model="action.type" class="form-select">
                  <option value="SET_REGISTER">设置寄存器</option>
                  <option value="ALARM">触发报警</option>
                </select>
                
                <template v-if="action.type === 'SET_REGISTER'">
                  <select v-model="action.register" class="form-select">
                    <option v-for="(name, idx) in registerNames" :key="idx" :value="idx">
                      {{ name }}
                    </option>
                  </select>
                  <input type="number" v-model.number="action.value" class="form-input" style="width: 80px;" placeholder="值">
                </template>
                
                <template v-else>
                  <input type="text" v-model="action.message" class="form-input" placeholder="报警消息">
                </template>
                
                <button class="btn-small btn-danger" @click="removeAction(index)" v-if="ruleForm.actions.length > 1">×</button>
              </div>
              <button class="btn-small btn-add" @click="addAction">+ 添加动作</button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showRuleModal = false">取消</button>
          <button class="btn-primary" @click="saveRule">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import axios from 'axios'

const selectedDevice = ref(1)
const devices = ref([1, 2, 3])
const registerNames = ref([])
const registers = ref([
  { value: 25 }, { value: 100 }, { value: 1500 },
  { value: 50 }, { value: 150 }, { value: 2000 },
  { value: 1 }, { value: 0 }, { value: 0 }, { value: 0 }
])
const alarmStatus = ref(0)

const thresholds = ref({
  temp: 50,
  pressure: 150,
  speed: 2000
})

const tempChart = ref(null)
const pressureChart = ref(null)
const speedChart = ref(null)

let tempChartInstance = null
let pressureChartInstance = null
let speedChartInstance = null

const tempData = ref([])
const pressureData = ref([])
const speedData = ref([])
const timeLabels = ref([])

const historyRegister = ref(0)
const historyLimit = ref(20)
const historyData = ref([])

let pollInterval = null

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const fetchWithRetry = async (fetchFn, maxRetries = 3, delay = 100) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchFn()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await sleep(delay * (i + 1))
    }
  }
}

const safeValue = (value, fallback = 0) => {
  return value === undefined || value === null || isNaN(value) ? fallback : value
}

const selectDevice = (deviceId) => {
  selectedDevice.value = deviceId
  tempData.value = []
  pressureData.value = []
  speedData.value = []
  timeLabels.value = []
  fetchRegisters()
}

const fetchRegisters = async () => {
  try {
    const response = await fetchWithRetry(() => 
      axios.get(`/api/devices/${selectedDevice.value}/registers`, { timeout: 5000 })
    )
    registers.value = response.data
    
    if (registers.value && registers.value.length >= 8) {
      thresholds.value.temp = safeValue(registers.value[3]?.value, 50)
      thresholds.value.pressure = safeValue(registers.value[4]?.value, 150)
      thresholds.value.speed = safeValue(registers.value[5]?.value, 2000)
      alarmStatus.value = safeValue(registers.value[7]?.value, 0)
      
      const now = new Date()
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
      
      const newTemp = safeValue(registers.value[0]?.value, tempData.value[tempData.value.length - 1] || 25)
      const newPressure = safeValue(registers.value[1]?.value, pressureData.value[pressureData.value.length - 1] || 100)
      const newSpeed = safeValue(registers.value[2]?.value, speedData.value[speedData.value.length - 1] || 1500)
      
      timeLabels.value.push(timeStr)
      tempData.value.push(newTemp)
      pressureData.value.push(newPressure)
      speedData.value.push(newSpeed)
      
      if (timeLabels.value.length > 30) {
        timeLabels.value.shift()
        tempData.value.shift()
        pressureData.value.shift()
        speedData.value.shift()
      }
      
      updateCharts()
    }
  } catch (error) {
    console.error('Failed to fetch registers:', error)
  }
}

const setThreshold = async (address, value) => {
  try {
    await fetchWithRetry(() =>
      axios.post(`/api/devices/${selectedDevice.value}/registers/${address}?value=${value}`, { timeout: 5000 })
    )
  } catch (error) {
    console.error('Failed to set threshold:', error)
  }
}

const fetchHistory = async () => {
  try {
    const response = await fetchWithRetry(() =>
      axios.get('/api/history', {
        params: {
          device_id: selectedDevice.value,
          register_address: historyRegister.value,
          limit: historyLimit.value
        },
        timeout: 10000
      })
    )
    historyData.value = response.data.data || []
  } catch (error) {
    console.error('Failed to fetch history:', error)
    historyData.value = []
  }
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN')
}

const initCharts = () => {
  nextTick(() => {
    tempChartInstance = echarts.init(tempChart.value)
    pressureChartInstance = echarts.init(pressureChart.value)
    speedChartInstance = echarts.init(speedChart.value)
    
    updateCharts()
  })
}

const updateCharts = () => {
  const commonOption = {
    grid: {
      left: '10%',
      right: '10%',
      bottom: '15%',
      top: '10%'
    },
    xAxis: {
      type: 'category',
      data: timeLabels.value,
      axisLabel: {
        fontSize: 10,
        rotate: 45
      }
    },
    yAxis: {
      type: 'value'
    },
    series: [{
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        width: 3
      },
      areaStyle: {
        opacity: 0.3
      }
    }],
    tooltip: {
      trigger: 'axis'
    }
  }
  
  if (tempChartInstance) {
    tempChartInstance.setOption({
      ...commonOption,
      yAxis: {
        ...commonOption.yAxis,
        min: 0,
        max: 100
      },
      series: [{
        ...commonOption.series[0],
        data: tempData.value,
        name: '温度',
        itemStyle: { color: '#ff6b6b' },
        areaStyle: { color: 'rgba(255, 107, 107, 0.3)' }
      }]
    })
  }
  
  if (pressureChartInstance) {
    pressureChartInstance.setOption({
      ...commonOption,
      yAxis: {
        ...commonOption.yAxis,
        min: 50,
        max: 200
      },
      series: [{
        ...commonOption.series[0],
        data: pressureData.value,
        name: '压力',
        itemStyle: { color: '#4ecdc4' },
        areaStyle: { color: 'rgba(78, 205, 196, 0.3)' }
      }]
    })
  }
  
  if (speedChartInstance) {
    speedChartInstance.setOption({
      ...commonOption,
      yAxis: {
        ...commonOption.yAxis,
        min: 1000,
        max: 3000
      },
      series: [{
        ...commonOption.series[0],
        data: speedData.value,
        name: '转速',
        itemStyle: { color: '#ffe66d' },
        areaStyle: { color: 'rgba(255, 230, 109, 0.3)' }
      }]
    })
  }
}

const fetchRegisterNames = async () => {
  try {
    const response = await fetchWithRetry(() =>
      axios.get('/api/register-names', { timeout: 5000 })
    )
    registerNames.value = response.data.names || []
  } catch (error) {
    console.error('Failed to fetch register names:', error)
    registerNames.value = ['温度', '压力', '转速', '温度阈值', '压力阈值', '转速阈值', '状态', '报警', '预留1', '预留2']
  }
}

const rules = ref([])
const ruleLogs = ref([])
const showRuleModal = ref(false)
const editingRule = ref(null)

const ruleForm = ref({
  name: '',
  description: '',
  condition: {
    type: 'AND',
    children: [
      { type: 'COMPARISON', register: 0, operator: '>', value: 50 }
    ]
  },
  actions: [
    { type: 'SET_REGISTER', register: 2, value: 0 }
  ]
})

const fetchRules = async () => {
  try {
    const response = await fetchWithRetry(() =>
      axios.get('/api/rules', { timeout: 5000 })
    )
    rules.value = response.data.data || []
  } catch (error) {
    console.error('Failed to fetch rules:', error)
  }
}

const fetchRuleLogs = async () => {
  try {
    const response = await fetchWithRetry(() =>
      axios.get('/api/rule-logs', { params: { limit: 20 }, timeout: 5000 })
    )
    ruleLogs.value = response.data.data || []
  } catch (error) {
    console.error('Failed to fetch rule logs:', error)
  }
}

const formatConditionPreview = (condition) => {
  if (!condition || !condition.type) return '未配置'
  
  if (condition.type === 'COMPARISON') {
    const regName = registerNames.value[condition.register] || `寄存器${condition.register}`
    return `${regName} ${condition.operator} ${condition.value}`
  }
  
  if (condition.children && condition.children.length > 0) {
    return condition.children.map(child => {
      const regName = registerNames.value[child.register] || `寄存器${child.register}`
      return `${regName} ${child.operator} ${child.value}`
    }).join(` ${condition.type} `)
  }
  
  return '未配置'
}

const formatActionsPreview = (actions) => {
  if (!actions || actions.length === 0) return '未配置'
  
  return actions.map(action => {
    if (action.type === 'SET_REGISTER') {
      const regName = registerNames.value[action.register] || `寄存器${action.register}`
      return `设置${regName}=${action.value}`
    } else if (action.type === 'ALARM') {
      return `报警: ${action.message || '触发报警'}`
    }
    return '未知动作'
  }).join('; ')
}

const addCondition = () => {
  if (!ruleForm.value.condition.children) {
    ruleForm.value.condition.children = []
  }
  ruleForm.value.condition.children.push({
    type: 'COMPARISON',
    register: 0,
    operator: '>',
    value: 0
  })
}

const removeCondition = (index) => {
  ruleForm.value.condition.children.splice(index, 1)
}

const addAction = () => {
  ruleForm.value.actions.push({
    type: 'SET_REGISTER',
    register: 0,
    value: 0
  })
}

const removeAction = (index) => {
  ruleForm.value.actions.splice(index, 1)
}

const editRule = (rule) => {
  editingRule.value = rule
  ruleForm.value = {
    name: rule.name,
    description: rule.description,
    condition: JSON.parse(JSON.stringify(rule.condition || { type: 'AND', children: [] })),
    actions: JSON.parse(JSON.stringify(rule.actions || []))
  }
  showRuleModal.value = true
}

const saveRule = async () => {
  try {
    if (editingRule.value) {
      await axios.put(`/api/rules/${editingRule.value.id}`, null, {
        params: {
          name: ruleForm.value.name,
          description: ruleForm.value.description
        }
      })
      await axios.put(`/api/rules/${editingRule.value.id}`, {
        condition: ruleForm.value.condition,
        actions: ruleForm.value.actions
      })
    } else {
      await axios.post('/api/rules', null, {
        params: {
          name: ruleForm.value.name,
          description: ruleForm.value.description
        }
      })
      const response = await axios.get('/api/rules')
      const newRule = response.data.data[response.data.data.length - 1]
      if (newRule) {
        await axios.put(`/api/rules/${newRule.id}`, {
          condition: ruleForm.value.condition,
          actions: ruleForm.value.actions
        })
      }
    }
    
    showRuleModal.value = false
    editingRule.value = null
    resetRuleForm()
    await fetchRules()
  } catch (error) {
    console.error('Failed to save rule:', error)
  }
}

const deleteRule = async (ruleId) => {
  if (!confirm('确定要删除这条规则吗？')) return
  
  try {
    await axios.delete(`/api/rules/${ruleId}`)
    await fetchRules()
  } catch (error) {
    console.error('Failed to delete rule:', error)
  }
}

const toggleRule = async (rule) => {
  try {
    await axios.put(`/api/rules/${rule.id}`, {
      enabled: rule.enabled ? 0 : 1
    })
    await fetchRules()
  } catch (error) {
    console.error('Failed to toggle rule:', error)
  }
}

const resetRuleForm = () => {
  ruleForm.value = {
    name: '',
    description: '',
    condition: {
      type: 'AND',
      children: [
        { type: 'COMPARISON', register: 0, operator: '>', value: 50 }
      ]
    },
    actions: [
      { type: 'SET_REGISTER', register: 2, value: 0 }
    ]
  }
}

onMounted(() => {
  fetchRegisterNames()
  initCharts()
  fetchRegisters()
  fetchRules()
  fetchRuleLogs()
  
  pollInterval = setInterval(fetchRegisters, 1000)
  setInterval(fetchRuleLogs, 5000)
  
  window.addEventListener('resize', () => {
    tempChartInstance?.resize()
    pressureChartInstance?.resize()
    speedChartInstance?.resize()
  })
})

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval)
  }
  
  tempChartInstance?.dispose()
  pressureChartInstance?.dispose()
  speedChartInstance?.dispose()
})
</script>
