<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useKnowledgeStore } from '@/stores/knowledge'
import { dialog } from '@tauri-apps/api'
import FileTree from '@/components/FileTree.vue'

const store = useKnowledgeStore()
const showSidebar = ref(true)
const showTagFilters = ref(false)
const commitMessage = ref('')
const showCommitModal = ref(false)

const displayFileCount = computed(() => {
  return store.selectedTags.length > 0 
    ? store.filteredFilesList.length 
    : store.files.size
})

const allFilesCount = computed(() => store.files.size)

onMounted(async () => {
  if (!store.rootDirectory) {
    const selected = await dialog.open({
      directory: true,
      multiple: false,
      title: '选择知识库目录'
    })
    if (selected && typeof selected === 'string') {
      await store.scanDirectory(selected)
    }
  }
})

const selectDirectory = async () => {
  const selected = await dialog.open({
    directory: true,
    multiple: false,
    title: '选择知识库目录'
  })
  if (selected && typeof selected === 'string') {
    await store.scanDirectory(selected)
  }
}

const createNewFile = async () => {
  if (!store.rootDirectory) {
    await selectDirectory()
    return
  }
  const name = prompt('请输入新文件名（不含扩展名）：')
  if (name) {
    await store.createFile(store.rootDirectory, `${name}.md`)
  }
}

const initGit = async () => {
  await store.initGit()
}

const openCommitModal = () => {
  commitMessage.value = `Update at ${new Date().toLocaleString()}`
  showCommitModal.value = true
}

const doCommit = async () => {
  if (!commitMessage.value.trim()) return
  await store.commitChanges(commitMessage.value.trim())
  showCommitModal.value = false
  commitMessage.value = ''
}
</script>

<template>
  <div class="home">
    <header class="header">
      <div class="header-left">
        <button class="icon-btn" @click="showSidebar = !showSidebar">
          ☰
        </button>
        <h1 class="title">Markdown 知识库</h1>
        <div class="status-badges">
          <span 
            v-if="store.gitInitialized" 
            class="status-badge git-badge"
          >
            Git ✓
          </span>
          <span 
            v-if="store.hasUncommittedChanges" 
            class="status-badge changes-badge"
          >
            ⚠ 未提交更改
          </span>
        </div>
      </div>
      <div class="header-right">
        <template v-if="store.rootDirectory && store.gitInitialized">
          <button 
            v-if="store.hasUncommittedChanges"
            class="btn btn-secondary"
            @click="openCommitModal"
          >
            提交更改
          </button>
        </template>
        <template v-else-if="store.rootDirectory">
          <button 
            class="btn btn-secondary"
            @click="initGit"
          >
            初始化 Git
          </button>
        </template>
        <button class="btn btn-secondary" @click="selectDirectory">
          更换目录
        </button>
        <button class="btn btn-primary" @click="createNewFile">
          + 新建文件
        </button>
      </div>
    </header>
    
    <div class="main-content">
      <aside v-if="showSidebar" class="sidebar">
        <div class="sidebar-header">
          <span>文件列表</span>
          <span class="file-count">
            <span v-if="store.selectedTags.length > 0">
              {{ displayFileCount }} / {{ allFilesCount }}
            </span>
            <span v-else>
              {{ allFilesCount }} 个文件
            </span>
          </span>
        </div>
        
        <div v-if="store.allTags.length > 0" class="tag-filter-section">
          <div class="tag-filter-header" @click="showTagFilters = !showTagFilters">
            <span>标签筛选</span>
            <span class="toggle-icon">{{ showTagFilters ? '▲' : '▼' }}</span>
          </div>
          
          <div v-if="showTagFilters" class="tag-filter-body">
            <div class="selected-tags" v-if="store.selectedTags.length > 0">
              <span 
                v-for="tag in store.selectedTags" 
                :key="tag"
                class="tag-filter-chip selected"
                @click="store.toggleTagFilter(tag)"
              >
                {{ tag }} ×
              </span>
              <button 
                class="clear-btn"
                @click="store.clearTagFilters()"
              >
                清除筛选
              </button>
            </div>
            
            <div class="available-tags">
              <span
                v-for="tag in store.allTags"
                :key="tag"
                class="tag-filter-chip"
                :class="{ selected: store.selectedTags.includes(tag) }"
                @click="store.toggleTagFilter(tag)"
              >
                {{ tag }}
                <span class="tag-count">({{ store.tagCounts[tag] }})</span>
              </span>
            </div>
          </div>
        </div>
        
        <FileTree v-if="displayFileCount > 0" />
        <div v-else-if="store.files.size === 0" class="empty-sidebar">
          <p>暂无文件</p>
          <p>请选择一个目录开始</p>
        </div>
        <div v-else class="empty-sidebar">
          <p>没有匹配的文件</p>
          <p>请尝试其他标签组合</p>
        </div>
      </aside>
      
      <main class="content">
        <div v-if="store.isScanning" class="scanning">
          <div class="spinner"></div>
          <p>正在扫描目录...</p>
        </div>
        <div v-else-if="store.files.size === 0" class="welcome">
          <h2>欢迎使用 Markdown 知识库</h2>
          <p>选择一个目录来开始管理你的 Markdown 文件</p>
          <button class="btn btn-primary" @click="selectDirectory">
            选择目录
          </button>
        </div>
        <div v-else class="quick-actions">
          <h3>快速操作</h3>
          <div class="action-grid">
            <router-link to="/search" class="action-card">
              <div class="action-icon">🔍</div>
              <div class="action-title">全文搜索</div>
              <div class="action-desc">搜索所有 Markdown 文件内容</div>
            </router-link>
            <router-link to="/graph" class="action-card">
              <div class="action-icon">🕸️</div>
              <div class="action-title">知识图谱</div>
              <div class="action-desc">查看文件双向链接关系</div>
            </router-link>
            <div class="action-card" @click="createNewFile">
              <div class="action-icon">📝</div>
              <div class="action-title">新建笔记</div>
              <div class="action-desc">创建一个新的 Markdown 文件</div>
            </div>
            <div class="action-card" @click="() => store.toggleTagFilter('')">
              <div class="action-icon">🏷️</div>
              <div class="action-title">标签管理</div>
              <div class="action-desc">{{ store.allTags.length }} 个标签已使用</div>
            </div>
          </div>
          
          <div v-if="store.allTags.length > 0" class="tags-overview">
            <h3>标签概览</h3>
            <div class="tags-cloud">
              <span
                v-for="tag in store.allTags"
                :key="tag"
                class="tag-cloud-item"
                @click="store.toggleTagFilter(tag)"
              >
                {{ tag }}
                <span class="count">{{ store.tagCounts[tag] }}</span>
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>

    <div v-if="showCommitModal" class="modal-overlay" @click.self="showCommitModal = false">
      <div class="modal">
        <header class="modal-header">
          <h3>提交更改</h3>
          <button class="icon-btn" @click="showCommitModal = false">×</button>
        </header>
        <div class="modal-body">
          <label>提交信息</label>
          <input
            v-model="commitMessage"
            type="text"
            class="input"
            placeholder="描述这次更改..."
            @keyup.enter="doCommit"
          />
        </div>
        <footer class="modal-footer">
          <button class="btn btn-secondary" @click="showCommitModal = false">取消</button>
          <button class="btn btn-primary" @click="doCommit">提交</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  border-radius: 4px;
}

.icon-btn:hover {
  background: #e2e8f0;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}

.status-badges {
  display: flex;
  gap: 8px;
  margin-left: 12px;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.git-badge {
  background: #d1fae5;
  color: #065f46;
}

.changes-badge {
  background: #fef3c7;
  color: #92400e;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.header-right {
  display: flex;
  gap: 8px;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  font-weight: 500;
  color: #475569;
}

.file-count {
  font-size: 12px;
  color: #94a3b8;
}

.tag-filter-section {
  border-bottom: 1px solid #e2e8f0;
}

.tag-filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
}

.tag-filter-header:hover {
  background: #f1f5f9;
}

.toggle-icon {
  font-size: 10px;
  color: #94a3b8;
}

.tag-filter-body {
  padding: 8px 12px 16px;
}

.selected-tags {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
}

.clear-btn {
  display: block;
  margin-top: 8px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}

.clear-btn:hover {
  color: #3b82f6;
}

.available-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #e2e8f0;
  color: #475569;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.tag-filter-chip:hover {
  background: #cbd5e1;
}

.tag-filter-chip.selected {
  background: #dbeafe;
  color: #1d4ed8;
}

.tag-filter-chip .tag-count {
  color: #94a3b8;
  font-size: 11px;
}

.empty-sidebar {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #94a3b8;
  font-size: 14px;
}

.content {
  flex: 1;
  overflow: auto;
}

.scanning {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #64748b;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.welcome {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 40px;
}

.welcome h2 {
  font-size: 24px;
  color: #1e293b;
  margin-bottom: 12px;
}

.welcome p {
  color: #64748b;
  margin-bottom: 24px;
}

.quick-actions {
  padding: 32px 48px;
}

.quick-actions h3 {
  font-size: 18px;
  color: #334155;
  margin-bottom: 20px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.action-card {
  padding: 24px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  color: inherit;
}

.action-card:hover {
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
  transform: translateY(-2px);
}

.action-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.action-title {
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
}

.action-desc {
  font-size: 13px;
  color: #64748b;
}

.tags-overview {
  margin-top: 40px;
}

.tags-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tag-cloud-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #f1f5f9;
  color: #334155;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-cloud-item:hover {
  background: #dbeafe;
  color: #1d4ed8;
}

.tag-cloud-item .count {
  padding: 2px 8px;
  background: #cbd5e1;
  color: #475569;
  border-radius: 10px;
  font-size: 12px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #1e293b;
}

.modal-body {
  padding: 24px;
}

.modal-body label {
  display: block;
  font-size: 14px;
  color: #374151;
  margin-bottom: 8px;
}

.modal-body .input {
  width: 100%;
  padding: 10px 12px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid #e2e8f0;
}
</style>
