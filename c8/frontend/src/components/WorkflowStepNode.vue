<template>
  <div class="workflow-step">
    <div :class="['workflow-step-node', `workflow-step-${status}`]">
      <svg v-if="status === 'approved'" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <svg v-else-if="status === 'rejected'" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span v-else>{{ step }}</span>
    </div>
    <div class="workflow-step-label">{{ roleLabel }}</div>
    <div class="workflow-step-role">{{ approverName }}</div>
    <div v-if="config && Object.keys(config).length > 1" class="workflow-step-config">
      <details>
        <summary>配置详情</summary>
        <pre>{{ JSON.stringify(config, null, 2) }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup>
defineProps({
  step: {
    type: Number,
    required: true
  },
  role: {
    type: String,
    default: ''
  },
  roleLabel: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    default: 'pending'
  },
  approverName: {
    type: String,
    default: ''
  },
  config: {
    type: Object,
    default: () => ({})
  }
})
</script>

<style scoped>
.workflow-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 2;
}

.workflow-step-node {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  border: 3px solid;
  background: white;
  transition: all 0.3s ease;
}

.workflow-step-pending {
  border-color: #dcdfe6;
  color: #c0c4cc;
  background: #fafafa;
}

.workflow-step-current {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 0 0 4px rgba(64, 158, 255, 0.1);
  animation: pulse 2s infinite;
}

.workflow-step-approved {
  border-color: #67c23a;
  color: #67c23a;
  background: #f0f9eb;
}

.workflow-step-rejected {
  border-color: #f56c6c;
  color: #f56c6c;
  background: #fef0f0;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 0 4px rgba(64, 158, 255, 0.1);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(64, 158, 255, 0.05);
  }
}

.workflow-step-label {
  margin-top: 14px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  text-align: center;
}

.workflow-step-role {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.workflow-step-config {
  margin-top: 8px;
  font-size: 11px;
}

.workflow-step-config details {
  cursor: pointer;
  color: #409eff;
}

.workflow-step-config details summary {
  outline: none;
}

.workflow-step-config pre {
  margin-top: 8px;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 10px;
  max-width: 200px;
  overflow-x: auto;
  color: #606266;
}
</style>
