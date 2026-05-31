<script setup lang="ts">
import { RouterView } from 'vue-router'
import { invoke } from '@tauri-apps/api/tauri'
import { onMounted } from 'vue'

onMounted(async () => {
  try {
    await invoke('initialize_app')
  } catch (e) {
    console.error('初始化失败:', e)
  }
})
</script>

<template>
  <div class="app">
    <RouterView />
  </div>
</template>

<style scoped>
.app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
