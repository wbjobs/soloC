<template>
  <div class="search-panel">
    <h3>船舶搜索</h3>
    <div class="search-box">
      <input
        v-model="searchText"
        type="text"
        placeholder="输入MMSI搜索船舶..."
        @keyup.enter="handleSearch"
      />
      <button @click="handleSearch" class="search-btn">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
      </button>
    </div>
    <button v-if="props.modelValue" @click="handleClear" class="clear-btn">
      清除搜索
    </button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: String
})

const emit = defineEmits(['update:modelValue', 'search', 'clear'])

const searchText = ref('')

watch(() => props.modelValue, (newVal) => {
  searchText.value = newVal || ''
})

function handleSearch() {
  if (searchText.value.trim()) {
    emit('update:modelValue', searchText.value.trim())
    emit('search', searchText.value.trim())
  }
}

function handleClear() {
  searchText.value = ''
  emit('update:modelValue', '')
  emit('clear')
}
</script>

<style scoped>
.search-panel {
  background: rgba(20, 20, 50, 0.8);
  border: 1px solid rgba(100, 180, 255, 0.2);
  border-radius: 12px;
  padding: 16px;
}

.search-panel h3 {
  font-size: 14px;
  font-weight: 600;
  color: #64b4ff;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.search-box {
  display: flex;
  gap: 8px;
}

.search-box input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid rgba(100, 180, 255, 0.3);
  border-radius: 8px;
  background: rgba(10, 10, 30, 0.6);
  color: #e0e0e0;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.search-box input:focus {
  border-color: #64b4ff;
  box-shadow: 0 0 10px rgba(100, 180, 255, 0.3);
}

.search-box input::placeholder {
  color: #606080;
}

.search-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #64b4ff, #4a90e2);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.search-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 0 15px rgba(100, 180, 255, 0.5);
}

.search-btn svg {
  width: 20px;
  height: 20px;
}

.clear-btn {
  width: 100%;
  margin-top: 10px;
  padding: 8px;
  border: 1px solid rgba(255, 100, 100, 0.5);
  border-radius: 8px;
  background: transparent;
  color: #ff6464;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  background: rgba(255, 100, 100, 0.1);
}
</style>
