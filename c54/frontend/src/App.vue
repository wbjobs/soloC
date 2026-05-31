<template>
  <div class="app">
    <div ref="canvasContainer" id="canvas-container"></div>
    
    <div class="controls">
      <div class="render-mode-controls">
        <span>渲染模式:</span>
        <button 
          v-for="mode in renderModes" 
          :key="mode.value"
          :class="{ active: currentRenderMode === mode.value }"
          @click="setRenderMode(mode.value)"
        >
          {{ mode.label }}
        </button>
      </div>
      
      <template v-if="currentRenderMode === 'slice'">
        <div class="axis-controls">
          <span>坐标轴:</span>
          <button 
            v-for="axis in ['X', 'Y', 'Z']" 
            :key="axis"
            :class="{ active: currentAxis === axis }"
            @click="setAxis(axis)"
          >
            {{ axis }}
          </button>
        </div>
        
        <div class="slice-control">
          <span>切片位置:</span>
          <input 
            type="range" 
            min="0" 
            max="511" 
            :value="slicePosition"
            @input="updateSlicePosition($event.target.value)"
          />
          <span class="value">{{ slicePosition }}</span>
        </div>
      </template>
      
      <template v-else>
        <div class="volume-params">
          <div class="param-item">
            <span>等值线阈值:</span>
            <input 
              type="range" 
              min="0.01" 
              max="1.0" 
              step="0.01"
              :value="volumeIsoValue"
              @input="updateVolumeIsoValue($event.target.value)"
            />
            <span class="value">{{ parseFloat(volumeIsoValue).toFixed(2) }}</span>
          </div>
          <div class="param-item">
            <span>步进大小:</span>
            <input 
              type="range" 
              min="0.001" 
              max="0.05" 
              step="0.001"
              :value="volumeStepSize"
              @input="updateVolumeStepSize($event.target.value)"
            />
            <span class="value">{{ parseFloat(volumeStepSize).toFixed(3) }}</span>
          </div>
          <div class="param-item">
            <span>最大步数:</span>
            <input 
              type="range" 
              min="32" 
              max="256" 
              step="16"
              :value="volumeMaxSteps"
              @input="updateVolumeMaxSteps($event.target.value)"
            />
            <span class="value">{{ volumeMaxSteps }}</span>
          </div>
          <div class="param-item">
            <span>不透明度:</span>
            <input 
              type="range" 
              min="0.1" 
              max="1.0" 
              step="0.1"
              :value="volumeOpacity"
              @input="updateVolumeOpacity($event.target.value)"
            />
            <span class="value">{{ parseFloat(volumeOpacity).toFixed(1) }}</span>
          </div>
        </div>
      </template>
      
      <div class="timeline-control">
        <div class="timeline-header">
          <span>时间步: {{ Math.floor(currentTimestep) }} / {{ totalTimesteps }}</span>
          <div class="play-controls">
            <button :class="{ pause: isPlaying }" @click="togglePlay">
              {{ isPlaying ? '暂停' : '播放' }}
            </button>
          </div>
        </div>
        
        <input 
          type="range" 
          class="timeline-slider"
          min="0" 
          :max="totalTimesteps - 1" 
          :value="currentTimestep"
          @input="updateTimestep($event.target.value)"
        />
        
        <div class="speed-control">
          <span>播放速度:</span>
          <input 
            type="range" 
            min="0.1" 
            max="5" 
            step="0.1"
            :value="playSpeed"
            @input="updatePlaySpeed($event.target.value)"
          />
          <span class="value">{{ playSpeed.toFixed(1) }}x</span>
        </div>
      </div>
    </div>
    
    <div class="performance-info">
      <div>FPS: {{ performanceStats.fps }}</div>
      <div>帧时间: {{ performanceStats.frameTime.toFixed(2) }}ms</div>
      <div>纹理上传: {{ performanceStats.textureUploadTime.toFixed(2) }}ms</div>
      <div>数据处理: {{ performanceStats.dataFetchTime.toFixed(2) }}ms</div>
      <div v-if="performanceStats.uploadStats">
        平均上传: {{ performanceStats.uploadStats.avgUploadTime.toFixed(2) }}ms
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import { GalaxyVisualizer } from './components/GalaxyVisualizer.js'

export default {
  name: 'App',
  setup() {
    const canvasContainer = ref(null)
    let visualizer = null
    
    const renderModes = [
      { label: '切片', value: 'slice' },
      { label: '体渲染', value: 'volume' },
      { label: 'MIP', value: 'mip' },
      { label: '等值面', value: 'iso' }
    ]
    
    const currentRenderMode = ref('slice')
    const currentAxis = ref('Z')
    const slicePosition = ref(256)
    const currentTimestep = ref(0)
    const totalTimesteps = ref(100)
    const isPlaying = ref(false)
    const playSpeed = ref(1)
    
    const volumeIsoValue = ref(0.3)
    const volumeStepSize = ref(0.01)
    const volumeMaxSteps = ref(128)
    const volumeOpacity = ref(1.0)
    
    const performanceStats = ref({
      fps: 0,
      frameTime: 0,
      textureUploadTime: 0,
      dataFetchTime: 0,
      uploadStats: null
    })
    
    let statsInterval = null
    
    onMounted(() => {
      visualizer = new GalaxyVisualizer(canvasContainer.value)
      
      statsInterval = setInterval(() => {
        performanceStats.value = visualizer.getPerformanceStats()
      }, 500)
    })
    
    onUnmounted(() => {
      if (statsInterval) {
        clearInterval(statsInterval)
      }
      if (visualizer) {
        visualizer.dispose()
      }
    })
    
    const setRenderMode = (mode) => {
      currentRenderMode.value = mode
      visualizer.setRenderMode(mode)
    }
    
    const setAxis = (axis) => {
      currentAxis.value = axis
      visualizer.setAxis(axis)
    }
    
    const updateSlicePosition = (value) => {
      slicePosition.value = parseInt(value)
      visualizer.setSlicePosition(slicePosition.value)
    }
    
    const updateTimestep = (value) => {
      currentTimestep.value = parseFloat(value)
      visualizer.updateTimestep(Math.floor(currentTimestep.value))
    }
    
    const togglePlay = () => {
      isPlaying.value = visualizer.togglePlay()
    }
    
    const updatePlaySpeed = (value) => {
      playSpeed.value = parseFloat(value)
      visualizer.setPlaySpeed(playSpeed.value)
    }
    
    const updateVolumeIsoValue = (value) => {
      volumeIsoValue.value = parseFloat(value)
      visualizer.setVolumeIsoValue(volumeIsoValue.value)
    }
    
    const updateVolumeStepSize = (value) => {
      volumeStepSize.value = parseFloat(value)
      visualizer.setVolumeStepSize(volumeStepSize.value)
    }
    
    const updateVolumeMaxSteps = (value) => {
      volumeMaxSteps.value = parseInt(value)
      visualizer.setVolumeMaxSteps(volumeMaxSteps.value)
    }
    
    const updateVolumeOpacity = (value) => {
      volumeOpacity.value = parseFloat(value)
      visualizer.setVolumeOpacity(volumeOpacity.value)
    }
    
    return {
      canvasContainer,
      renderModes,
      currentRenderMode,
      currentAxis,
      slicePosition,
      currentTimestep,
      totalTimesteps,
      isPlaying,
      playSpeed,
      volumeIsoValue,
      volumeStepSize,
      volumeMaxSteps,
      volumeOpacity,
      performanceStats,
      setRenderMode,
      setAxis,
      updateSlicePosition,
      updateTimestep,
      togglePlay,
      updatePlaySpeed,
      updateVolumeIsoValue,
      updateVolumeStepSize,
      updateVolumeMaxSteps,
      updateVolumeOpacity,
      Math
    }
  }
}
</script>
