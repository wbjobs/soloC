<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useKnowledgeStore, SearchResult } from '@/stores/knowledge'
import DOMPurify from 'dompurify'

const store = useKnowledgeStore()
const router = useRouter()

const searchQuery = ref('')
const isSearching = ref(false)

const highlightSnippet = (snippet: string, query: string) => {
  if (!query) return snippet
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return DOMPurify.sanitize(snippet.replace(regex, '<mark>$1</mark>'))
}

const performSearch = async () => {
  if (!searchQuery.value.trim()) {
    store.searchResults = []
    return
  }
  isSearching.value = true
  try {
    await store.search(searchQuery.value.trim())
  } finally {
    isSearching.value = false
  }
}

const openFile = (result: SearchResult) => {
  router.push(`/editor/${encodeURIComponent(result.file.path)}`)
}

watch(searchQuery, async () => {
  if (searchQuery.value.trim()) {
    performSearch()
  } else {
    store.searchResults = []
  }
})
</script>

<template>
  <div class="search">
    <header class="search-header">
      <button class="back-btn" @click="router.push('/')">← 返回</button>
      <h1>全文搜索</h1>
    </header>

    <div class="search-content">
      <div class="search-input-wrapper">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="输入搜索关键词..."
          autofocus
        />
        <div v-if="isSearching" class="searching-indicator">搜索中...</div>
      </div>

      <div v-if="store.searchResults.length > 0" class="results-header">
        找到 {{ store.searchResults.length }} 个结果
      </div>

      <div class="results-list">
        <div
          v-for="(result, index) in store.searchResults"
          :key="index"
          class="result-item"
          @click="openFile(result)"
        >
          <div class="result-header">
            <span class="result-title">{{ result.file.name }}</span>
            <span class="result-score">相关度: {{ (result.score * 100).toFixed(1) }}%</span>
          </div>
          <div class="result-path">{{ result.file.path }}</div>
          <div class="result-snippets">
            <div
              v-for="(match, mIndex) in result.matches"
              :key="mIndex"
              class="snippet"
              v-html="highlightSnippet(match.snippet, searchQuery)"
            ></div>
          </div>
        </div>
      </div>

      <div v-else-if="searchQuery && !isSearching" class="no-results">
        未找到与 "{{ searchQuery }}" 相关的内容
      </div>
    </div>
  </div>
</template>

<style scoped>
.search {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

.search-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.back-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  border-radius: 4px;
}

.back-btn:hover {
  background: #e2e8f0;
}

.search-header h1 {
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
}

.search-content {
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.search-input-wrapper {
  max-width: 800px;
  margin: 0 auto 24px;
  position: relative;
}

.search-input {
  width: 100%;
  padding: 16px 20px;
  font-size: 16px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #3b82f6;
}

.searching-indicator {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  font-size: 14px;
}

.results-header {
  max-width: 800px;
  margin: 0 auto 16px;
  color: #64748b;
  font-size: 14px;
}

.results-list {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-item {
  padding: 20px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.result-item:hover {
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.result-title {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}

.result-score {
  font-size: 12px;
  color: #3b82f6;
  background: #eff6ff;
  padding: 4px 8px;
  border-radius: 4px;
}

.result-path {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 12px;
}

.result-snippets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.snippet {
  font-size: 14px;
  line-height: 1.6;
  color: #334155;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 4px;
}

.snippet :deep(mark) {
  background: #fef08a;
  padding: 1px 2px;
  border-radius: 2px;
}

.no-results {
  text-align: center;
  color: #64748b;
  padding: 40px;
  font-size: 16px;
}
</style>
