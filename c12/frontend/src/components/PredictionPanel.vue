<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useNodeStore } from '@/stores/node'
import PredictionChart from './PredictionChart.vue'
import type { NodeInfo } from '@/types'

const nodeStore = useNodeStore()

const selectedNodeIndex = ref(0)

const availableNodes = computed(() => {
  return nodeStore.nodes.filter(n => n.status === 'ONLINE')
})

const selectedNode = computed<NodeInfo | null>(() => {
  if (availableNodes.value.length === 0) return null
  if (selectedNodeIndex.value >= availableNodes.value.length) {
    selectedNodeIndex.value = 0
  }
  return availableNodes.value[selectedNodeIndex.value] || null
})

watch(availableNodes, (nodes) => {
  if (nodes.length > 0 && selectedNodeIndex.value >= nodes.length) {
    selectedNodeIndex.value = 0
  }
})
</script>

<template>
  <div class="prediction-panel">
    <div class="panel-header">
      <h3 class="panel-title">
        <el-icon><TrendCharts /></el-icon>
        Performance Prediction
      </h3>
      <div class="node-selector" v-if="availableNodes.length > 1">
        <el-select 
          v-model="selectedNodeIndex" 
          style="width: 200px;"
          placeholder="Select node"
          size="small"
        >
          <el-option
            v-for="(node, index) in availableNodes"
            :key="node.id"
            :label="node.name"
            :value="index"
          />
        </el-select>
      </div>
    </div>

    <div v-if="selectedNode" class="panel-content">
      <PredictionChart :node="selectedNode" :key="selectedNode.id" />
    </div>

    <div v-else class="no-nodes">
      <el-icon :size="48"><DataAnalysis /></el-icon>
      <p>Prediction requires at least one online node</p>
      <p class="hint">Connect a node and wait for some historical data to be collected</p>
    </div>
  </div>
</template>

<style scoped>
.prediction-panel {
  color: #fff;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 15px;
}

.panel-title {
  margin: 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-selector {
  flex-shrink: 0;
}

.panel-content {
  min-height: 200px;
}

.no-nodes {
  text-align: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.5);
}

.no-nodes p {
  margin: 10px 0 0;
}

.no-nodes .hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

@media (max-width: 768px) {
  .panel-header {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 15px;
  }

  .node-selector {
    width: 100%;
  }

  .node-selector :deep(.el-select) {
    width: 100% !important;
  }

  .no-nodes {
    padding: 20px;
  }
}
</style>
