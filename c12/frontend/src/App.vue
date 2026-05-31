<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { useNodeStore } from '@/stores/node'

const nodeStore = useNodeStore()

onMounted(() => {
  nodeStore.fetchNodes()
  nodeStore.startMetricsStream()
})

onUnmounted(() => {
  nodeStore.stopMetricsStream()
})
</script>

<template>
  <div class="app">
    <el-container>
      <el-header class="header">
        <div class="header-content">
          <h1 class="title">
            <el-icon :size="24" style="margin-right: 10px; vertical-align: middle;">
              <Monitor />
            </el-icon>
            Blockchain Node Monitor
          </h1>
        </div>
      </el-header>
      <el-main>
        <RouterView />
      </el-main>
    </el-container>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.header {
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
}

.title {
  margin: 0;
  color: #fff;
  font-size: 24px;
  font-weight: 600;
}

:deep(.el-main) {
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  padding: 30px;
}

@media (max-width: 768px) {
  .title {
    font-size: 18px;
  }

  .header {
    padding: 0 15px;
  }

  :deep(.el-main) {
    padding: 15px;
  }

  :deep(.el-header) {
    height: 50px !important;
    line-height: 50px !important;
  }
}

@media (max-width: 480px) {
  .title {
    font-size: 16px;
  }

  :deep(.el-icon) {
    font-size: 20px !important;
  }
}
</style>
