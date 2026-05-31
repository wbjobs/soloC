<script>
  import { onMount, onDestroy } from 'svelte'
  import Chart from 'chart.js/auto'

  const API_BASE = 'http://localhost:8080/api'

  let devices = []
  let selectedDevice = ''
  let sensorData = []
  let stats = { count_last_hour: 0 }
  let chart = null
  let canvas = null
  let loading = false
  let error = ''
  let activeTab = 'dashboard'

  let rules = []
  let editingRule = null
  let newRule = {
    name: '',
    description: '',
    condition: 'value > 70 && device_id in [1..10]',
    action: {
      type: 'actuator',
      actuator: 'fan_01'
    },
    enabled: true
  }

  const sensorColors = {
    temperature: 'rgb(255, 99, 132)',
    humidity: 'rgb(54, 162, 235)',
    pressure: 'rgb(75, 192, 192)'
  }

  const sensorLabels = {
    temperature: '温度 (°C)',
    humidity: '湿度 (%)',
    pressure: '气压 (hPa)'
  }

  const ruleTemplates = [
    { name: '高温告警', condition: 'value > 70', actuator: 'fan_01', desc: '温度超过70度启动风扇' },
    { name: '高湿告警', condition: 'value > 85', actuator: 'dehumidifier_01', desc: '湿度超过85%启动除湿机' },
    { name: '设备范围告警', condition: 'value > 60 && device_id in [1..20]', actuator: 'alarm_01', desc: '1-20号设备温度告警' }
  ]

  async function fetchDevices() {
    try {
      const res = await fetch(`${API_BASE}/devices`)
      devices = await res.json()
      if (devices.length > 0 && !selectedDevice) {
        selectedDevice = devices[0]
      }
    } catch (e) {
      error = '获取设备列表失败'
    }
  }

  async function fetchSensorData() {
    if (!selectedDevice) return
    loading = true
    try {
      const res = await fetch(`${API_BASE}/sensors?device_id=${selectedDevice}&limit=50`)
      sensorData = await res.json()
      updateChart()
    } catch (e) {
      error = '获取传感器数据失败'
    }
    loading = false
  }

  async function fetchStats() {
    try {
      const res = await fetch(`${API_BASE}/stats`)
      stats = await res.json()
    } catch (e) {}
  }

  async function fetchRules() {
    try {
      const res = await fetch(`${API_BASE}/rules`)
      rules = await res.json()
    } catch (e) {
      console.error('获取规则失败:', e)
    }
  }

  async function saveRule() {
    try {
      const ruleToSave = editingRule || newRule
      const url = editingRule 
        ? `${API_BASE}/rules/${editingRule.id}` 
        : `${API_BASE}/rules`
      const method = editingRule ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleToSave)
      })

      if (res.ok) {
        await fetchRules()
        resetRuleForm()
      }
    } catch (e) {
      error = '保存规则失败'
    }
  }

  async function deleteRule(id) {
    if (!confirm('确定要删除这条规则吗？')) return
    try {
      await fetch(`${API_BASE}/rules/${id}`, { method: 'DELETE' })
      await fetchRules()
    } catch (e) {
      error = '删除规则失败'
    }
  }

  function editRule(rule) {
    editingRule = { ...rule }
  }

  function resetRuleForm() {
    editingRule = null
    newRule = {
      name: '',
      description: '',
      condition: 'value > 70 && device_id in [1..10]',
      action: {
        type: 'actuator',
        actuator: 'fan_01'
      },
      enabled: true
    }
  }

  function applyTemplate(template) {
    if (editingRule) {
      editingRule.condition = template.condition
      editingRule.action.actuator = template.actuator
      if (!editingRule.name) editingRule.name = template.name
      if (!editingRule.description) editingRule.description = template.desc
    } else {
      newRule.condition = template.condition
      newRule.action.actuator = template.actuator
      newRule.name = template.name
      newRule.description = template.desc
    }
  }

  function updateChart() {
    if (!canvas) return

    const bySensor = {}
    sensorData.forEach(d => {
      if (!bySensor[d.sensor_type]) {
        bySensor[d.sensor_type] = []
      }
      bySensor[d.sensor_type].push({
        x: new Date(d.timestamp),
        y: d.value
      })
    })

    Object.keys(bySensor).forEach(key => {
      bySensor[key].sort((a, b) => a.x - b.x)
    })

    const datasets = Object.keys(bySensor).map(sensor => ({
      label: sensorLabels[sensor] || sensor,
      data: bySensor[sensor],
      borderColor: sensorColors[sensor] || 'gray',
      backgroundColor: (sensorColors[sensor] || 'gray').replace('rgb', 'rgba').replace(')', ', 0.1)'),
      tension: 0.4,
      fill: true
    }))

    if (chart) {
      chart.data.datasets = datasets
      chart.update('none')
    } else {
      chart = new Chart(canvas, {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          scales: {
            x: {
              type: 'time',
              display: true,
              title: {
                display: true,
                text: '时间'
              },
              ticks: {
                maxTicksLimit: 10
              }
            },
            y: {
              display: true,
              title: {
                display: true,
                text: '数值'
              }
            }
          },
          plugins: {
            legend: {
              position: 'top',
            }
          }
        }
      })
    }
  }

  $: if (selectedDevice) {
    fetchSensorData()
  }

  let intervalId

  onMount(() => {
    fetchDevices()
    fetchStats()
    fetchSensorData()
    fetchRules()
    
    intervalId = setInterval(() => {
      fetchSensorData()
      fetchStats()
    }, 2000)
  })

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId)
    if (chart) chart.destroy()
  })
</script>

<main>
  <header>
    <h1>🌐 IoT 实时监控面板</h1>
    <div class="stats">
      <div class="stat-card">
        <span class="stat-value">{stats.count_last_hour}</span>
        <span class="stat-label">近1小时数据点</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{devices.length}</span>
        <span class="stat-label">在线设备数</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{rules.length}</span>
        <span class="stat-label">边缘规则数</span>
      </div>
    </div>
  </header>

  <div class="tabs">
    <button 
      class="tab {activeTab === 'dashboard' ? 'active' : ''}"
      on:click={() => activeTab = 'dashboard'}
    >
      📊 监控面板
    </button>
    <button 
      class="tab {activeTab === 'rules' ? 'active' : ''}"
      on:click={() => activeTab = 'rules'}
    >
      ⚙️ 边缘规则
    </button>
  </div>

  {#if activeTab === 'dashboard'}
    <div class="controls">
      <select bind:value={selectedDevice} disabled={devices.length === 0}>
        <option value="">选择设备</option>
        {#each devices as device}
          <option value={device}>{device}</option>
        {/each}
      </select>
      <button on:click={fetchSensorData} disabled={loading}>
        {loading ? '刷新中...' : '🔄 刷新'}
      </button>
    </div>

    {#if error}
      <div class="error">{error}</div>
    {/if}

    <div class="chart-container">
      <canvas bind:this={canvas}></canvas>
    </div>

    <div class="sensor-stats">
      {#each ['temperature', 'humidity', 'pressure'] as sensor}
        {@const data = sensorData.filter(d => d.sensor_type === sensor)}
        {@const latest = data[0]}
        <div class="sensor-card" style="--color: {sensorColors[sensor]}">
          <div class="sensor-icon">
            {#if sensor === 'temperature'}🌡️
            {:else if sensor === 'humidity'}💧
            {:else}⚡{/if}
          </div>
          <div class="sensor-info">
            <h3>{sensorLabels[sensor]}</h3>
            <p class="sensor-value">
              {latest ? latest.value.toFixed(2) : '--'}
              {#if sensor === 'temperature'}°C
              {:else if sensor === 'humidity'}%
              {:else}hPa
              {/if}
            </p>
          </div>
        </div>
      {/each}
    </div>

    {#if sensorData.length > 0}
      <div class="data-table">
        <h3>📊 最近数据</h3>
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>传感器</th>
              <th>数值</th>
            </tr>
          </thead>
          <tbody>
            {#each sensorData.slice(0, 10) as d}
              <tr>
                <td>{new Date(d.timestamp).toLocaleTimeString('zh-CN')}</td>
                <td>{sensorLabels[d.sensor_type] || d.sensor_type}</td>
                <td>{d.value.toFixed(2)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  {#if activeTab === 'rules'}
    <div class="rules-container">
      <div class="rule-form">
        <h3>{editingRule ? '📝 编辑规则' : '➕ 新建规则'}</h3>
        
        <div class="form-group">
          <label>规则名称</label>
          <input 
            bind:value={editingRule ? editingRule.name : newRule.name}
            placeholder="例如：高温告警"
          />
        </div>

        <div class="form-group">
          <label>描述</label>
          <input 
            bind:value={editingRule ? editingRule.description : newRule.description}
            placeholder="规则用途说明"
          />
        </div>

        <div class="form-group">
          <label>条件表达式</label>
          <textarea 
            bind:value={editingRule ? editingRule.condition : newRule.condition}
            rows="2"
            placeholder="例如：value > 70 && device_id in [1..10]"
          />
          <div class="templates">
            <span class="template-label">快速模板:</span>
            {#each ruleTemplates as template}
              <button 
                class="template-btn"
                on:click={() => applyTemplate(template)}
              >
                {template.name}
              </button>
            {/each}
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>动作类型</label>
            <select bind:value={editingRule ? editingRule.action.type : newRule.action.type}>
              <option value="actuator">切换执行器</option>
              <option value="on">开启执行器</option>
              <option value="off">关闭执行器</option>
            </select>
          </div>

          <div class="form-group">
            <label>执行器名称</label>
            <input 
              bind:value={editingRule ? editingRule.action.actuator : newRule.action.actuator}
              placeholder="例如：fan_01"
            />
          </div>
        </div>

        <div class="form-group checkbox">
          <label>
            <input 
              type="checkbox" 
              bind:checked={editingRule ? editingRule.enabled : newRule.enabled}
            />
            启用规则
          </label>
        </div>

        <div class="form-actions">
          {#if editingRule}
            <button class="btn-secondary" on:click={resetRuleForm}>取消编辑</button>
          {/if}
          <button class="btn-primary" on:click={saveRule}>
            {editingRule ? '更新规则' : '创建规则'}
          </button>
        </div>
      </div>

      <div class="rules-list">
        <h3>📋 已有规则 ({rules.length})</h3>
        {#if rules.length === 0}
          <p class="empty-state">暂无规则，创建第一条规则开始使用边缘计算</p>
        {:else}
          {#each rules as rule}
            <div class="rule-card {!rule.enabled ? 'disabled' : ''}">
              <div class="rule-header">
                <span class="rule-name">{rule.name}</span>
                <span class="rule-status {rule.enabled ? 'enabled' : 'disabled'}">
                  {rule.enabled ? '✅ 已启用' : '❌ 已禁用'}
                </span>
              </div>
              {#if rule.description}
                <p class="rule-desc">{rule.description}</p>
              {/if}
              <div class="rule-detail">
                <code>IF {rule.condition}</code>
                <br />
                <code>THEN {rule.action.type} {rule.action.actuator}</code>
              </div>
              <div class="rule-actions">
                <button class="btn-small" on:click={() => editRule(rule)}>编辑</button>
                <button class="btn-small btn-danger" on:click={() => deleteRule(rule.id)}>删除</button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</main>

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  }

  header {
    text-align: center;
    margin-bottom: 30px;
  }

  h1 {
    color: #1e293b;
    font-size: 2rem;
    margin-bottom: 20px;
  }

  h3 {
    margin-top: 0;
    color: #1e293b;
  }

  .stats {
    display: flex;
    justify-content: center;
    gap: 20px;
    flex-wrap: wrap;
  }

  .stat-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px 40px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  }

  .stat-value {
    font-size: 2rem;
    font-weight: bold;
  }

  .stat-label {
    font-size: 0.9rem;
    opacity: 0.9;
  }

  .tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 10px;
  }

  .tab {
    padding: 10px 20px;
    border: none;
    background: none;
    font-size: 1rem;
    cursor: pointer;
    border-radius: 8px 8px 0 0;
    transition: all 0.2s;
  }

  .tab.active {
    background: #3b82f6;
    color: white;
  }

  .tab:hover:not(.active) {
    background: #f1f5f9;
  }

  .controls {
    display: flex;
    gap: 15px;
    margin-bottom: 20px;
    align-items: center;
    flex-wrap: wrap;
  }

  select, button, input, textarea {
    padding: 12px 20px;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    font-family: inherit;
  }

  input, textarea {
    cursor: text;
  }

  textarea {
    resize: vertical;
    min-height: 60px;
  }

  button {
    background: #3b82f6;
    color: white;
    border: none;
    transition: background 0.2s;
  }

  button:hover:not(:disabled) {
    background: #2563eb;
  }

  button:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #10b981;
  }

  .btn-primary:hover {
    background: #059669;
  }

  .btn-secondary {
    background: #64748b;
  }

  .btn-secondary:hover {
    background: #475569;
  }

  .btn-small {
    padding: 6px 12px;
    font-size: 0.875rem;
  }

  .btn-danger {
    background: #ef4444;
  }

  .btn-danger:hover {
    background: #dc2626;
  }

  .error {
    background: #fee2e2;
    color: #dc2626;
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .chart-container {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    margin-bottom: 20px;
    height: 400px;
  }

  .sensor-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .sensor-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 15px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    border-left: 4px solid var(--color);
  }

  .sensor-icon {
    font-size: 2.5rem;
  }

  .sensor-info h3 {
    margin: 0;
    color: #64748b;
    font-size: 0.9rem;
  }

  .sensor-value {
    margin: 5px 0 0;
    font-size: 1.8rem;
    font-weight: bold;
    color: #1e293b;
  }

  .data-table {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th, td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }

  th {
    background: #f8fafc;
    font-weight: 600;
    color: #475569;
  }

  tr:hover {
    background: #f8fafc;
  }

  .rules-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  @media (max-width: 768px) {
    .rules-container {
      grid-template-columns: 1fr;
    }
  }

  .rule-form, .rules-list {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }

  .form-group {
    margin-bottom: 15px;
  }

  .form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
    color: #475569;
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    box-sizing: border-box;
  }

  .form-group.checkbox label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
  }

  .templates {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .template-label {
    font-size: 0.875rem;
    color: #64748b;
  }

  .template-btn {
    padding: 4px 10px;
    font-size: 0.8rem;
    background: #e0f2fe;
    color: #0284c7;
    border: none;
    border-radius: 4px;
  }

  .template-btn:hover {
    background: #bae6fd;
  }

  .form-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 20px;
  }

  .rule-card {
    background: #f8fafc;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 10px;
    border-left: 4px solid #3b82f6;
  }

  .rule-card.disabled {
    opacity: 0.6;
    border-left-color: #94a3b8;
  }

  .rule-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .rule-name {
    font-weight: 600;
    color: #1e293b;
  }

  .rule-status {
    font-size: 0.875rem;
  }

  .rule-status.enabled {
    color: #059669;
  }

  .rule-status.disabled {
    color: #64748b;
  }

  .rule-desc {
    margin: 0 0 10px 0;
    color: #64748b;
    font-size: 0.9rem;
  }

  .rule-detail {
    background: white;
    padding: 10px;
    border-radius: 6px;
    font-family: 'Fira Code', monospace;
    font-size: 0.875rem;
    color: #1e293b;
    margin-bottom: 10px;
  }

  .rule-detail code {
    display: block;
  }

  .rule-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .empty-state {
    text-align: center;
    color: #64748b;
    padding: 40px;
  }
</style>
