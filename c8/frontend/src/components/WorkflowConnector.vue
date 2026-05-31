<template>
  <div class="workflow-connector-wrapper">
    <div :class="['workflow-connector', { completed: isCompleted }]">
      <svg width="100%" height="100%" viewBox="0 0 80 6" preserveAspectRatio="none">
        <line
          x1="0" y1="3"
          x2="80" y2="3"
          :stroke="isCompleted ? '#67c23a' : '#dcdfe6'"
          stroke-width="3"
        />
        <polygon
          v-if="isCompleted"
          points="70,0 80,3 70,6"
          fill="#67c23a"
        />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: {
    type: String,
    default: 'pending'
  }
})

const isCompleted = computed(() => props.status === 'approved')
</script>

<style scoped>
.workflow-connector-wrapper {
  display: flex;
  align-items: center;
  padding: 0 4px;
  margin-top: 32px;
}

.workflow-connector {
  width: 80px;
  height: 6px;
  transition: all 0.3s ease;
}

.workflow-connector.completed svg line {
  stroke-dasharray: 80;
  stroke-dashoffset: 0;
  animation: drawLine 0.6s ease-out forwards;
}

@keyframes drawLine {
  from {
    stroke-dashoffset: 80;
  }
  to {
    stroke-dashoffset: 0;
  }
}
</style>
