<template>
  <div class="home-container">
    <div class="home-content">
      <h1 class="title">WebRTC AR 视频通话</h1>
      <p class="subtitle">支持AR标注的实时视频通话系统</p>
      
      <div class="role-selection">
        <button class="role-btn caller-btn" @click="goToCaller">
          <span class="role-icon">📱</span>
          <span class="role-title">主叫方 (手机)</span>
          <span class="role-desc">使用摄像头 + AR标注</span>
        </button>
        
        <button class="role-btn callee-btn" @click="goToCallee">
          <span class="role-icon">💻</span>
          <span class="role-title">被叫方 (Web端)</span>
          <span class="role-desc">接收视频和标注</span>
        </button>
      </div>
      
      <div class="history-section">
        <h3>📸 截图历史</h3>
        <button class="load-history-btn" @click="loadHistory">加载历史记录</button>
        <div v-if="screenshots.length > 0" class="screenshots-grid">
          <div v-for="shot in screenshots" :key="shot.id" class="screenshot-item">
            <img :src="'/api/screenshots/' + shot.filename" :alt="'Screenshot ' + shot.id" />
            <p>{{ new Date(shot.timestamp).toLocaleString() }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const screenshots = ref([])

const goToCaller = () => {
  router.push('/caller')
}

const goToCallee = () => {
  router.push('/callee')
}

const loadHistory = async () => {
  try {
    const response = await fetch('/api/screenshots')
    screenshots.value = await response.json()
  } catch (error) {
    console.error('Failed to load history:', error)
  }
}
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  padding: 20px;
}

.home-content {
  text-align: center;
  max-width: 900px;
}

.title {
  font-size: 3rem;
  margin-bottom: 10px;
  background: linear-gradient(90deg, #e94560, #00d9ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 1.2rem;
  color: #a0a0a0;
  margin-bottom: 40px;
}

.role-selection {
  display: flex;
  gap: 30px;
  justify-content: center;
  margin-bottom: 50px;
  flex-wrap: wrap;
}

.role-btn {
  padding: 40px 50px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 250px;
}

.caller-btn {
  background: linear-gradient(135deg, #e94560, #ff6b6b);
}

.callee-btn {
  background: linear-gradient(135deg, #00d9ff, #0099cc);
}

.role-btn:hover {
  transform: translateY(-5px) scale(1.02);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
}

.role-icon {
  font-size: 3rem;
}

.role-title {
  font-size: 1.3rem;
  font-weight: bold;
  color: white;
}

.role-desc {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
}

.history-section {
  background: rgba(255, 255, 255, 0.05);
  padding: 30px;
  border-radius: 20px;
}

.history-section h3 {
  margin-bottom: 20px;
  font-size: 1.5rem;
}

.load-history-btn {
  padding: 12px 30px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 1rem;
  cursor: pointer;
  margin-bottom: 20px;
  transition: all 0.3s ease;
}

.load-history-btn:hover {
  transform: scale(1.05);
}

.screenshots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
  max-height: 400px;
  overflow-y: auto;
}

.screenshot-item {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  padding: 10px;
}

.screenshot-item img {
  width: 100%;
  border-radius: 8px;
  margin-bottom: 8px;
}

.screenshot-item p {
  font-size: 0.8rem;
  color: #a0a0a0;
}
</style>
