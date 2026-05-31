<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useNodeStore } from '@/stores/node'
import StatsCard from '@/components/StatsCard.vue'
import NodeList from '@/components/NodeList.vue'
import MetricsChart from '@/components/MetricsChart.vue'
import PredictionPanel from '@/components/PredictionPanel.vue'
import RegisterNodeDialog from '@/components/RegisterNodeDialog.vue'

const nodeStore = useNodeStore()
const showRegisterDialog = ref(false)

const statsCards = computed(() => [
  {
    title: 'Total Nodes',
    value: nodeStore.stats.totalNodes,
    icon: 'Connection',
    color: '#409eff'
  },
  {
    title: 'Online',
    value: nodeStore.stats.onlineNodes,
    icon: 'CircleCheck',
    color: '#67c23a'
  },
  {
    title: 'Offline',
    value: nodeStore.stats.offlineNodes,
    icon: 'CircleClose',
    color: '#f56c6c'
  },
  {
    title: 'Syncing',
    value: nodeStore.stats.syncingNodes,
    icon: 'Loading',
    color: '#e6a23c'
  }
])

async function handleRegister(formData: any) {
  const success = await nodeStore.registerNode(formData)
  if (success) {
    showRegisterDialog.value = false
  }
  return success
}

onMounted(() => {
  nodeStore.fetchNodes()
})
</script>

<template>
  <div class="dashboard">
    <div class="dashboard-header">
      <div>
        <h2>Node Dashboard</h2>
        <p class="subtitle">Monitor and manage your blockchain nodes</p>
      </div>
      <el-button type="primary" @click="showRegisterDialog = true">
        <el-icon><Plus /></el-icon>
        Add Node
      </el-button>
    </div>

    <div class="stats-grid">
      <StatsCard
        v-for="card in statsCards"
        :key="card.title"
        :title="card.title"
        :value="card.value"
        :icon="card.icon"
        :color="card.color"
      />
    </div>

    <div class="dashboard-content">
      <div class="section">
        <NodeList />
      </div>
      
      <div class="section charts-section" v-if="nodeStore.nodes.length > 0">
        <h3>Transaction Rate</h3>
        <MetricsChart type="tx_rate" />
      </div>

      <div class="section charts-section" v-if="nodeStore.nodes.length > 0">
        <h3>Block Height</h3>
        <MetricsChart type="block_height" />
      </div>

      <div class="section prediction-section" v-if="nodeStore.nodes.length > 0">
        <PredictionPanel />
      </div>
    </div>

    <RegisterNodeDialog
      v-model="showRegisterDialog"
      @submit="handleRegister"
    />
  </div>
</template>

<style scoped>
.dashboard {
  color: #fff;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
  flex-wrap: wrap;
  gap: 15px;
}

.dashboard-header h2 {
  margin: 0 0 5px 0;
  font-size: 28px;
  color: #fff;
}

.subtitle {
  margin: 0;
  color: rgba(255, 255, 255, 0.7);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.section {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 25px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.charts-section h3 {
  margin: 0 0 20px 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 18px;
}

@media (max-width: 768px) {
  .dashboard-header {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 20px;
  }

  .dashboard-header h2 {
    font-size: 24px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }

  .section {
    padding: 15px;
  }

  .dashboard-content {
    gap: 20px;
  }
}

@media (max-width: 480px) {
  .dashboard-header h2 {
    font-size: 20px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
