<template>
  <div class="app-container">
    <div class="panel">
      <h2 class="panel-title">量子门</h2>
      <div class="gates-panel">
        <div v-for="gate in availableGates" :key="gate.type" 
             class="gate-item" 
             draggable="true"
             @dragstart="onDragStart($event, gate)">
          <div class="gate-icon">{{ gate.type }}</div>
          <span class="gate-name">{{ gate.name }}</span>
        </div>
      </div>
      
      <div class="error-correction-section">
        <h3 class="panel-subtitle">🔬 Steane码纠错演示</h3>
        <div class="ec-controls">
          <div class="control-group">
            <label>错误概率:</label>
            <input type="range" v-model="errorProbability" min="0" max="0.5" step="0.01">
            <span>{{ (errorProbability * 100).toFixed(0) }}%</span>
          </div>
          <div class="control-group">
            <label>逻辑门类型:</label>
            <select v-model="selectedGate">
              <option value="H">Hadamard</option>
              <option value="X">Pauli-X</option>
              <option value="CNOT">CNOT</option>
            </select>
          </div>
          <button class="ec-btn" @click="runErrorCorrectionDemo">
            🚀 运行纠错演示
          </button>
        </div>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel-title">电路编辑器</h2>
      <div class="circuit-editor">
        <button class="add-qubit-btn" @click="addQubit">+ 添加量子比特</button>
        <div v-for="(qubit, qIndex) in qubits" :key="qIndex" class="qubit-row">
          <span class="qubit-label">q{{ qIndex }}</span>
          <div class="qubit-line" @dragover.prevent @drop="onDrop($event, qIndex, 0)">
            <div v-for="(gate, gIndex) in qubit.gates" :key="gIndex"
                 class="gate-slot"
                 :class="{ cnot: gate.type === 'CNOT' }"
                 :style="{ left: (gIndex * 70 + 10) + 'px' }"
                 @click="removeGate(qIndex, gIndex)">
              {{ gate.type }}
            </div>
          </div>
        </div>
        <button class="execute-btn" @click="executeCircuit">▶ 执行电路</button>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel-title">态矢量可视化 & 纠错对比</h2>
      <div class="visualization-panel">
        <div ref="canvasContainer" id="three-canvas"></div>
        
        <div v-if="ecResult" class="fidelity-comparison">
          <h4>🎯 保真度对比</h4>
          <div class="fidelity-bars">
            <div class="fidelity-item">
              <span class="fidelity-label">❌ 无纠错</span>
              <div class="fidelity-bar">
                <div class="fidelity-fill no-ec" :style="{width: (ecResult.fidelityWithout * 100) + '%'}"></div>
              </div>
              <span class="fidelity-value">{{ (ecResult.fidelityWithout * 100).toFixed(1) }}%</span>
            </div>
            <div class="fidelity-item">
              <span class="fidelity-label">✅ 有Steane纠错</span>
              <div class="fidelity-bar">
                <div class="fidelity-fill with-ec" :style="{width: (ecResult.fidelityWith * 100) + '%'}"></div>
              </div>
              <span class="fidelity-value">{{ (ecResult.fidelityWith * 100).toFixed(1) }}%</span>
            </div>
          </div>
          <div class="improvement" v-if="ecResult.improvement > 0">
            📈 提升: +{{ ecResult.improvement.toFixed(1) }}%
          </div>
        </div>

        <div class="expectations-grid" v-if="currentResult">
          <div v-for="(exp, q) in currentResult.expectations.X" :key="'x'+q" class="expectation-item">
            <div class="expectation-label">⟨X{{ q }}⟩</div>
            <div class="expectation-value x">{{ exp.toFixed(3) }}</div>
          </div>
          <div v-for="(exp, q) in currentResult.expectations.Y" :key="'y'+q" class="expectation-item">
            <div class="expectation-label">⟨Y{{ q }}⟩</div>
            <div class="expectation-value y">{{ exp.toFixed(3) }}</div>
          </div>
          <div v-for="(exp, q) in currentResult.expectations.Z" :key="'z'+q" class="expectation-item">
            <div class="expectation-label">⟨Z{{ q }}⟩</div>
            <div class="expectation-value z">{{ exp.toFixed(3) }}</div>
          </div>
        </div>
        <div class="probability-list" v-if="currentResult">
          <div v-for="(prob, i) in currentResult.probabilities" :key="i" class="probability-item">
            <span class="state-label">|{{ toBinary(i, qubits.length) }}⟩</span>
            <span class="prob-value">{{ (prob * 100).toFixed(1) }}%</span>
          </div>
        </div>
      </div>
    </div>

    <div class="panel history-panel">
      <h2 class="panel-title">执行历史</h2>
      <div class="chart-container">
        <canvas ref="chartCanvas"></canvas>
      </div>
      <div class="history-list">
        <div v-for="item in history" :key="item.id" class="history-item" @click="loadHistory(item)">
          <div>执行 #{{ item.id }} - {{ item.circuit.gates.length }} 个门</div>
          <div class="history-time">{{ new Date(item.timestamp).toLocaleString() }}</div>
        </div>
      </div>
      <button class="clear-history-btn" @click="clearHistory">清除历史</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const availableGates = [
  { type: 'H', name: 'Hadamard' },
  { type: 'X', name: 'Pauli-X' },
  { type: 'Y', name: 'Pauli-Y' },
  { type: 'Z', name: 'Pauli-Z' },
  { type: 'CNOT', name: 'CNOT' },
  { type: 'RX', name: 'Rotation-X' }
]

const qubits = ref([{ gates: [] }, { gates: [] }])
const currentResult = ref(null)
const history = ref([])
const canvasContainer = ref(null)
const chartCanvas = ref(null)
const errorProbability = ref(0.1)
const selectedGate = ref("H")
const ecResult = ref(null)

let scene, camera, renderer, spheres = []
let chart = null

const onDragStart = (event, gate) => {
  event.dataTransfer.setData('gateType', gate.type)
}

const onDrop = (event, qubitIndex, position) => {
  const gateType = event.dataTransfer.getData('gateType')
  if (gateType === 'CNOT') {
    const targetQubit = qubitIndex === 0 ? 1 : 0
    qubits.value[qubitIndex].gates.push({ type: 'CNOT', qubits: [qubitIndex, targetQubit] })
    qubits.value[targetQubit].gates.push({ type: 'CNOT_target', qubits: [qubitIndex, targetQubit], sourceQubit: qubitIndex })
  } else {
    qubits.value[qubitIndex].gates.push({ type: gateType, qubits: [qubitIndex], angle: Math.PI / 2 })
  }
}

const addQubit = () => {
  qubits.value.push({ gates: [] })
}

const removeGate = (qubitIndex, gateIndex) => {
  qubits.value[qubitIndex].gates.splice(gateIndex, 1)
}

const toBinary = (num, bits) => {
  return num.toString(2).padStart(bits, '0')
}

const executeCircuit = async () => {
  const allGates = []
  qubits.value.forEach((qubit, qIndex) => {
    qubit.gates.forEach(gate => {
      if (!gate.type.includes('target')) {
        allGates.push(gate)
      }
    })
  })

  try {
    const response = await fetch('http://localhost:8080/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qubitCount: qubits.value.length,
        gates: allGates
      })
    })
    const result = await response.json()
    currentResult.value = result
    updateVisualization(result.probabilities, result.stateVector)
    loadHistoryData()
  } catch (e) {
    console.error('执行失败:', e)
  }
}

const runErrorCorrectionDemo = async () => {
  try {
    const response = await fetch('http://localhost:8080/api/error-correction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorProbability: errorProbability.value,
        gateType: selectedGate.value
      })
    })
    const result = await response.json()
    ecResult.value = result
    currentResult.value = result.withCorrection
    
    // 更新可视化，显示纠错后的状态
    updateVisualization(result.withCorrection.probabilities, result.withCorrection.stateVector)
    
    // 更新qubit数量用于显示
    while (qubits.value.length < 7) {
      qubits.value.push({ gates: [] })
    }
  } catch (e) {
    console.error('纠错演示失败:', e)
  }
}

const loadHistoryData = async () => {
  try {
    const response = await fetch('http://localhost:8080/api/history')
    history.value = await response.json()
    updateChart()
  } catch (e) {
    console.error('加载历史失败:', e)
  }
}

const clearHistory = async () => {
  try {
    await fetch('http://localhost:8080/api/history', { method: 'DELETE' })
    history.value = []
    updateChart()
  } catch (e) {
    console.error('清除历史失败:', e)
  }
}

const loadHistory = (item) => {
  currentResult.value = item
  updateVisualization(item.probabilities, item.stateVector)
}

const initThreeJS = () => {
  if (!canvasContainer.value) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0a1a)
  
  camera = new THREE.PerspectiveCamera(60, canvasContainer.value.clientWidth / 300, 1, 100)
  camera.position.z = 5

  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    logarithmicDepthBuffer: true
  })
  renderer.setSize(canvasContainer.value.clientWidth, 300)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  canvasContainer.value.appendChild(renderer.domElement)

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambientLight)
  
  const pointLight = new THREE.PointLight(0xffffff, 1)
  pointLight.position.set(5, 5, 5)
  scene.add(pointLight)

  const sphereGeometry = new THREE.SphereGeometry(2, 48, 48)
  const sphereMaterial = new THREE.MeshPhongMaterial({ 
    color: 0x333366, 
    transparent: true, 
    opacity: 0.3,
    wireframe: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  })
  const blochSphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
  scene.add(blochSphere)

  const axesMaterial = new THREE.LineBasicMaterial({ 
    color: 0x666666,
    depthTest: true
  })
  const axesGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2.2, 0, 0), new THREE.Vector3(2.2, 0, 0),
    new THREE.Vector3(0, -2.2, 0), new THREE.Vector3(0, 2.2, 0),
    new THREE.Vector3(0, 0, -2.2), new THREE.Vector3(0, 0, 2.2)
  ])
  const axes = new THREE.LineSegments(axesGeometry, axesMaterial)
  scene.add(axes)

  animate()
}

const updateVisualization = (probabilities, stateVector) => {
  spheres.forEach(s => {
    scene.remove(s)
    s.geometry.dispose()
    s.material.dispose()
  })
  spheres = []

  const n = probabilities.length
  for (let i = 0; i < n; i++) {
    const prob = probabilities[i]
    if (prob < 0.01) continue

    const phi = (i / n) * Math.PI * 2
    const theta = Math.acos(1 - 2 * (i / n))
    
    const r = 2 * Math.sqrt(prob)
    const x = r * Math.sin(theta) * Math.cos(phi)
    const y = r * Math.sin(theta) * Math.sin(phi)
    const z = r * Math.cos(theta)

    const geometry = new THREE.SphereGeometry(0.08 + prob * 0.15, 24, 24)
    const hue = i / n
    const material = new THREE.MeshPhongMaterial({ 
      color: new THREE.Color().setHSL(hue, 0.8, 0.5),
      transparent: true,
      opacity: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1 - i * 0.1,
      polygonOffsetUnits: -1
    })
    const sphere = new THREE.Mesh(geometry, material)
    sphere.position.set(x, y, z)
    sphere.renderOrder = i
    scene.add(sphere)
    spheres.push(sphere)
  }
}

const animate = () => {
  requestAnimationFrame(animate)
  spheres.forEach((s, i) => {
    s.rotation.y += 0.01
    s.position.y += Math.sin(Date.now() * 0.002 + i) * 0.002
  })
  renderer.render(scene, camera)
}

const updateChart = () => {
  if (!chartCanvas.value) return

  if (chart) {
    chart.destroy()
  }

  const labels = history.value.map((_, i) => `执行${i + 1}`)
  const datasets = []

  if (history.value.length > 0) {
    const qubitCount = history.value[0].expectations.X.length
    
    for (let q = 0; q < qubitCount; q++) {
      datasets.push({
        label: `⟨X${q}⟩`,
        data: history.value.map(h => h.expectations.X[q]),
        borderColor: `hsl(0, 70%, ${50 + q * 10}%)`,
        tension: 0.4
      })
      datasets.push({
        label: `⟨Y${q}⟩`,
        data: history.value.map(h => h.expectations.Y[q]),
        borderColor: `hsl(180, 70%, ${50 + q * 10}%)`,
        tension: 0.4
      })
      datasets.push({
        label: `⟨Z${q}⟩`,
        data: history.value.map(h => h.expectations.Z[q]),
        borderColor: `hsl(60, 70%, ${50 + q * 10}%)`,
        tension: 0.4
      })
    }
  }

  chart = new Chart(chartCanvas.value, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: -1, max: 1 },
        x: { ticks: { color: '#888' } }
      },
      plugins: {
        legend: { labels: { color: '#ccc' } }
      }
    }
  })
}

onMounted(async () => {
  await nextTick()
  initThreeJS()
  loadHistoryData()
  
  window.addEventListener('resize', () => {
    if (canvasContainer.value && renderer) {
      renderer.setSize(canvasContainer.value.clientWidth, 300)
      camera.aspect = canvasContainer.value.clientWidth / 300
      camera.updateProjectionMatrix()
    }
  })
})

onUnmounted(() => {
  if (renderer && canvasContainer.value) {
    canvasContainer.value.removeChild(renderer.domElement)
  }
})
</script>
