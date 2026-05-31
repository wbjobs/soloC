<script setup lang="ts">
import { Connection, CircleCheck, CircleClose, Loading } from '@element-plus/icons-vue'

defineProps<{
  title: string
  value: number
  icon: string
  color: string
}>()

const iconMap = {
  Connection,
  CircleCheck,
  CircleClose,
  Loading
}
</script>

<template>
  <div class="stats-card" :style="{ '--card-color': color }">
    <div class="card-content">
      <div class="card-info">
        <p class="card-title">{{ title }}</p>
        <p class="card-value">{{ value }}</p>
      </div>
      <div class="card-icon">
        <component :is="iconMap[icon as keyof typeof iconMap]" :size="36" :color="color" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}

.stats-card:hover {
  transform: translateY(-5px);
  border-color: var(--card-color);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.card-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.card-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.card-title {
  margin: 0;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-value {
  margin: 0;
  color: #fff;
  font-size: 32px;
  font-weight: 700;
}

.card-icon {
  opacity: 0.8;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .stats-card {
    padding: 15px;
  }

  .card-value {
    font-size: 24px;
  }

  .card-title {
    font-size: 12px;
  }
}

@media (max-width: 480px) {
  .stats-card {
    padding: 12px;
  }

  .card-value {
    font-size: 20px;
  }

  .card-icon {
    transform: scale(0.8);
  }
}
</style>
