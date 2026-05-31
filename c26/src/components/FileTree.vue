<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useKnowledgeStore, MarkdownFile } from '@/stores/knowledge'

const store = useKnowledgeStore()
const router = useRouter()

const files = computed(() => {
  const sourceList = store.selectedTags.length > 0 
    ? store.filteredFilesList 
    : store.filesList.value
  
  return [...sourceList].sort((a, b) => a.name.localeCompare(b.name))
})

const openFile = (file: MarkdownFile) => {
  router.push(`/editor/${encodeURIComponent(file.path)}`)
}

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleDateString()
}
</script>

<template>
  <div class="file-tree">
    <div class="file-list">
      <div
        v-for="file in files"
        :key="file.path"
        class="file-item"
        @click="openFile(file)"
      >
        <div class="file-icon">📄</div>
        <div class="file-info">
          <div class="file-name">{{ file.name }}</div>
          <div v-if="file.tags?.length" class="file-tags">
            <span
              v-for="tag in file.tags.slice(0, 3)"
              :key="tag"
              class="file-tag"
            >
              {{ tag }}
            </span>
            <span v-if="file.tags.length > 3" class="more-tags">
              +{{ file.tags.length - 3 }}
            </span>
          </div>
          <div class="file-meta">{{ formatDate(file.lastModified) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.file-item:hover {
  background: #e2e8f0;
}

.file-icon {
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 13px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 4px;
}

.file-tag {
  padding: 1px 6px;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 8px;
  font-size: 10px;
  white-space: nowrap;
}

.more-tags {
  padding: 1px 6px;
  background: #e2e8f0;
  color: #64748b;
  border-radius: 8px;
  font-size: 10px;
}

.file-meta {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 3px;
}
</style>
