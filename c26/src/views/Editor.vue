<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useKnowledgeStore, MarkdownFile, CommitInfo, FileHistory } from '@/stores/knowledge'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'

marked.setOptions({
  highlight: (code: string, lang: string) => {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
  breaks: true,
  gfm: true,
})

const store = useKnowledgeStore()
const route = useRoute()
const router = useRouter()

const filePath = computed(() => decodeURIComponent(route.params.path as string || ''))
const file = ref<MarkdownFile | null>(null)
const content = ref('')
const showPreview = ref(true)
const showLinks = ref(false)
const showHistory = ref(false)
const showTags = ref(false)
const isExportingPdf = ref(false)

const fileHistory = ref<FileHistory | null>(null)
const selectedCommit = ref<CommitInfo | null>(null)
const previewOldContent = ref('')
const showVersionPreview = ref(false)

const newTag = ref('')
const availableTagsForAdd = ref<string[]>([])

const htmlContent = computed(() => {
  if (!content.value) return ''
  let html = marked.parse(content.value) as string
  html = DOMPurify.sanitize(html)
  return html
})

const previewOldHtml = computed(() => {
  if (!previewOldContent.value) return ''
  let html = marked.parse(previewOldContent.value) as string
  html = DOMPurify.sanitize(html)
  return html
})

const renderKey = ref(0)

const forceReRender = () => {
  renderKey.value++
}

const formatTimestamp = (ts: number) => {
  return new Date(ts * 1000).toLocaleString('zh-CN')
}

onMounted(async () => {
  if (filePath.value) {
    await loadFile()
  }
})

watch(filePath, async () => {
  if (filePath.value) {
    await loadFile()
  }
  fileHistory.value = null
  selectedCommit.value = null
  showHistory.value = false
  showVersionPreview.value = false
})

const loadFile = async () => {
  const loaded = await store.getFile(filePath.value)
  if (loaded) {
    file.value = loaded
    content.value = loaded.content
  }
}

const saveFile = async () => {
  if (filePath.value && file.value) {
    await store.saveFile(filePath.value, content.value)
    file.value = await store.getFile(filePath.value)
    forceReRender()
  }
}

const exportPdf = async () => {
  if (!filePath.value) return
  
  isExportingPdf.value = true
  
  try {
    const title = file.value?.name || 'document'
    const cleanTitle = title.replace(/\.[^/.]+$/, '')
    
    const printHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${cleanTitle}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    @media print {
      html, body {
        width: 210mm;
        height: 297mm;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
      line-height: 1.8;
      color: #333;
      padding: 0;
      margin: 0;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
      line-height: 1.3;
      page-break-after: avoid;
    }
    h1 { font-size: 2em; border-bottom: 2px solid #eaecef; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    h4 { font-size: 1em; }
    p { margin: 1em 0; orphans: 3; widows: 3; }
    ul, ol { padding-left: 2em; margin: 1em 0; }
    li { margin: 0.3em 0; }
    blockquote {
      margin: 1em 0;
      padding: 0.5em 1em;
      border-left: 4px solid #3b82f6;
      background: #f8fafc;
      color: #475569;
    }
    pre {
      background: #f6f8fa;
      padding: 1em;
      border-radius: 6px;
      overflow-x: auto;
      margin: 1em 0;
      page-break-inside: avoid;
    }
    code {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      background: #f6f8fa;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 0.85em;
    }
    pre code {
      padding: 0;
      background: transparent;
      font-size: 0.9em;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #dfe2e5;
      padding: 0.5em 1em;
      text-align: left;
    }
    th { background: #f6f8fa; font-weight: 600; }
    img {
      max-width: 100%;
      height: auto;
      page-break-inside: avoid;
      display: block;
      margin: 1em auto;
    }
    hr {
      border: none;
      border-top: 2px solid #eaecef;
      margin: 2em 0;
    }
    a {
      color: #0366d6;
      text-decoration: none;
    }
    .katex {
      font-size: 1.1em;
    }
  </style>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css">
</head>
<body>
  ${htmlContent.value}
</body>
</html>`

    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (!printWindow) {
      alert('无法打开打印窗口，请检查浏览器弹窗设置')
      return
    }
    
    printWindow.document.open()
    printWindow.document.write(printHtml)
    printWindow.document.close()
    
    await new Promise<void>((resolve) => {
      const checkReady = () => {
        if (printWindow.document.readyState === 'complete') {
          resolve()
        } else {
          setTimeout(checkReady, 100)
        }
      }
      printWindow.onload = () => {
        setTimeout(() => resolve(), 500)
      }
      checkReady()
    })
    
    printWindow.focus()
    printWindow.print()
    
  } catch (error) {
    console.error('PDF export error:', error)
    alert('导出 PDF 失败: ' + (error as Error).message)
  } finally {
    isExportingPdf.value = false
  }
}

const openHistory = async () => {
  showHistory.value = true
  fileHistory.value = null
  selectedCommit.value = null
  
  if (filePath.value) {
    try {
      fileHistory.value = await store.getFileHistory(filePath.value)
    } catch (e) {
      console.error('Failed to load history:', e)
    }
  }
}

const selectCommit = async (commit: CommitInfo) => {
  selectedCommit.value = commit
  if (filePath.value) {
    previewOldContent.value = await store.getFileVersion(filePath.value, commit.id)
    showVersionPreview.value = true
  }
}

const restoreToVersion = async (commit: CommitInfo) => {
  if (!filePath.value) return
  
  const confirmed = confirm(
    `确定要回退到该版本吗？\n提交: ${commit.message}\n时间: ${formatTimestamp(commit.timestamp)}`
  )
  
  if (confirmed) {
    await store.restoreVersion(filePath.value, commit.id, true)
    await loadFile()
    showHistory.value = false
    showVersionPreview.value = false
    selectedCommit.value = null
    forceReRender()
  }
}

const addTag = async () => {
  if (!newTag.value.trim() || !filePath.value) return
  
  await store.addTag(filePath.value, newTag.value.trim())
  if (file.value) {
    file.value.tags = await store.getFileTags(filePath.value)
  }
  newTag.value = ''
  availableTagsForAdd.value = []
}

const removeTag = async (tag: string) => {
  if (!filePath.value) return
  
  await store.removeTag(filePath.value, tag)
  if (file.value) {
    file.value.tags = file.value.tags.filter(t => t !== tag)
  }
}

const openTagPanel = async () => {
  showTags.value = true
  if (store.rootDirectory) {
    await store.loadTags()
  }
}

const goBack = () => {
  router.push('/')
}
</script>

<template>
  <div class="editor" :key="renderKey">
    <header class="editor-header">
      <div class="header-left">
        <button class="icon-btn" @click="goBack">←</button>
        <h2 class="file-title">{{ file?.name || '未命名' }}</h2>
        <div v-if="file?.tags?.length" class="file-tags-small">
          <span 
            v-for="tag in file.tags" 
            :key="tag"
            class="tag-chip-small"
          >
            {{ tag }}
          </span>
        </div>
      </div>
      <div class="header-right">
        <button class="btn btn-secondary" @click="showPreview = !showPreview">
          {{ showPreview ? '隐藏预览' : '显示预览' }}
        </button>
        <button class="btn btn-secondary" @click="showLinks = !showLinks">
          链接 ({{ file?.backlinks?.length || 0 }})
        </button>
        <button 
          class="btn btn-secondary" 
          @click="openTagPanel"
          :class="{ active: showTags }"
        >
          标签 ({{ file?.tags?.length || 0 }})
        </button>
        <button 
          class="btn btn-secondary" 
          @click="openHistory"
          :class="{ active: showHistory }"
        >
          版本历史
        </button>
        <button class="btn btn-primary" @click="saveFile">保存</button>
        <button class="btn btn-secondary" @click="exportPdf" :disabled="isExportingPdf">
          {{ isExportingPdf ? '导出中...' : '导出 PDF' }}
        </button>
      </div>
    </header>

    <div class="editor-body">
      <div class="editor-pane">
        <textarea
          v-model="content"
          class="markdown-editor"
          placeholder="在此输入 Markdown 内容...

支持的语法：
- 图片: ![描述](路径或URL)
- 公式: $E=mc^2$ (行内) 或 $$...$$ (块级)
- 代码块: ```语言 代码 ```
- 链接: [[文件名]] 或 [文本](文件.md)
"
          spellcheck="false"
        ></textarea>
      </div>

      <div v-if="showPreview" class="preview-pane">
        <div class="preview-content markdown-body" v-html="htmlContent"></div>
      </div>

      <aside v-if="showLinks" class="links-panel">
        <h3>反向链接</h3>
        <div v-if="file?.backlinks?.length" class="links-list">
          <div
            v-for="link in file.backlinks"
            :key="link"
            class="link-item"
            @click="router.push(`/editor/${encodeURIComponent(link)}`)"
          >
            {{ link.split(/[\\/]/).pop() }}
          </div>
        </div>
        <p v-else class="no-links">暂无反向链接</p>

        <h3 style="margin-top: 24px;">导出链接</h3>
        <div v-if="file?.outgoingLinks?.length" class="links-list">
          <div
            v-for="link in file.outgoingLinks"
            :key="link"
            class="link-item"
            @click="router.push(`/editor/${encodeURIComponent(link)}`)"
          >
            {{ link.split(/[\\/]/).pop() }}
          </div>
        </div>
        <p v-else class="no-links">暂无导出链接</p>
      </aside>

      <aside v-if="showTags" class="tags-panel">
        <h3>文件标签</h3>
        
        <div class="add-tag-section">
          <input
            v-model="newTag"
            type="text"
            class="input"
            placeholder="输入新标签名..."
            @keyup.enter="addTag"
          />
          <button class="btn btn-primary btn-sm" @click="addTag">添加</button>
        </div>
        
        <div v-if="store.allTags.length" class="available-tags">
          <p class="section-label">可用标签：</p>
          <div class="tag-list">
            <span
              v-for="tag in store.allTags"
              :key="tag"
              class="tag-available"
              @click="newTag = tag"
            >
              {{ tag }} ({{ store.tagCounts[tag] }})
            </span>
          </div>
        </div>

        <h3 style="margin-top: 24px;">当前标签</h3>
        <div v-if="file?.tags?.length" class="current-tags">
          <span
            v-for="tag in file.tags"
            :key="tag"
            class="tag-chip"
          >
            {{ tag }}
            <button class="tag-remove" @click="removeTag(tag)">×</button>
          </span>
        </div>
        <p v-else class="no-tags">暂无标签</p>
      </aside>

      <aside v-if="showHistory" class="history-panel">
        <h3>版本历史</h3>
        
        <div v-if="!store.gitInitialized" class="git-notice">
          <p>Git 未初始化</p>
          <button class="btn btn-primary btn-sm" @click="store.initGit()">
            初始化 Git
          </button>
        </div>

        <div v-else-if="fileHistory" class="history-list">
          <div v-if="fileHistory.commits.length === 0" class="no-history">
            <p>暂无历史记录</p>
            <p class="hint">保存文件后点击"提交更改"来创建版本</p>
          </div>
          
          <div
            v-for="commit in fileHistory.commits"
            :key="commit.id"
            class="commit-item"
            :class="{ selected: selectedCommit?.id === commit.id }"
            @click="selectCommit(commit)"
          >
            <div class="commit-header">
              <span class="commit-id">{{ commit.id.substring(0, 7) }}</span>
              <span class="commit-time">{{ formatTimestamp(commit.timestamp) }}</span>
            </div>
            <div class="commit-message">{{ commit.message || '无提交信息' }}</div>
            <div class="commit-actions">
              <button 
                class="btn btn-secondary btn-sm"
                @click.stop="restoreToVersion(commit)"
              >
                回退到此版本
              </button>
            </div>
          </div>
        </div>

        <div v-if="store.hasUncommittedChanges" class="uncommitted-section">
          <p class="section-label">有未提交的更改</p>
          <button 
            class="btn btn-primary btn-sm"
            @click="async () => {
              const msg = prompt('输入提交信息：')
              if (msg !== null) {
                await store.commitChanges(msg || 'Auto commit')
                await openHistory()
              }
            }"
          >
            提交更改
          </button>
        </div>
      </aside>
    </div>

    <div v-if="showVersionPreview && selectedCommit" class="version-preview-overlay" @click.self="showVersionPreview = false">
      <div class="version-preview-modal">
        <header class="modal-header">
          <h3>版本预览: {{ selectedCommit.id.substring(0, 7) }}</h3>
          <button class="icon-btn" @click="showVersionPreview = false">×</button>
        </header>
        <div class="modal-body">
          <div class="preview-content markdown-body" v-html="previewOldHtml"></div>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-secondary" @click="showVersionPreview = false">关闭</button>
          <button 
            class="btn btn-primary"
            @click="restoreToVersion(selectedCommit)"
          >
            回退到此版本
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

.editor-header {
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
  font-size: 18px;
  cursor: pointer;
  border-radius: 4px;
}

.icon-btn:hover {
  background: #e2e8f0;
}

.file-title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.file-tags-small {
  display: flex;
  gap: 4px;
}

.tag-chip-small {
  padding: 2px 8px;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 12px;
  font-size: 11px;
}

.header-right {
  display: flex;
  gap: 8px;
}

.header-right .btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.header-right .btn.active {
  background: #3b82f6;
  color: white;
}

.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  display: flex;
  min-width: 0;
}

.markdown-editor {
  flex: 1;
  padding: 20px;
  border: none;
  outline: none;
  resize: none;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.8;
  background: #fafafa;
  color: #334155;
  white-space: pre-wrap;
}

.preview-pane {
  flex: 1;
  overflow: auto;
  border-left: 1px solid #e2e8f0;
  min-width: 0;
}

.preview-content {
  padding: 24px 32px;
  max-width: 800px;
  margin: 0 auto;
}

:deep(.markdown-body) {
  line-height: 1.8;
  word-wrap: break-word;
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3),
:deep(.markdown-body h4),
:deep(.markdown-body h5),
:deep(.markdown-body h6) {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

:deep(.markdown-body h1) { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
:deep(.markdown-body h2) { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
:deep(.markdown-body h3) { font-size: 1.25em; }
:deep(.markdown-body h4) { font-size: 1em; }

:deep(.markdown-body p) {
  margin-top: 0;
  margin-bottom: 16px;
}

:deep(.markdown-body pre) {
  padding: 16px;
  overflow: auto;
  background: #f6f8fa;
  border-radius: 6px;
  margin-bottom: 16px;
  line-height: 1.45;
}

:deep(.markdown-body code) {
  padding: 0.2em 0.4em;
  background: #f6f8fa;
  border-radius: 3px;
  font-size: 85%;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

:deep(.markdown-body pre code) {
  padding: 0;
  background: transparent;
}

:deep(.markdown-body blockquote) {
  padding: 0 1em;
  color: #6a737d;
  border-left: 0.25em solid #dfe2e5;
  margin: 0 0 16px;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  padding-left: 2em;
  margin-bottom: 16px;
}

:deep(.markdown-body table) {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 16px;
}

:deep(.markdown-body table th),
:deep(.markdown-body table td) {
  padding: 6px 13px;
  border: 1px solid #dfe2e5;
}

:deep(.markdown-body table th) {
  background: #f6f8fa;
  font-weight: 600;
}

:deep(.markdown-body a) {
  color: #0366d6;
  text-decoration: none;
}

:deep(.markdown-body a:hover) {
  text-decoration: underline;
}

:deep(.markdown-body img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 8px 0;
}

:deep(.markdown-body hr) {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: #e1e4e8;
  border: 0;
}

.links-panel,
.tags-panel,
.history-panel {
  width: 300px;
  border-left: 1px solid #e2e8f0;
  padding: 16px;
  overflow-y: auto;
  background: #fafafa;
}

.links-panel h3,
.tags-panel h3,
.history-panel h3 {
  font-size: 14px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 12px;
}

.links-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.link-item {
  padding: 8px 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #334155;
  transition: all 0.15s;
}

.link-item:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.no-links,
.no-tags,
.no-history {
  font-size: 13px;
  color: #94a3b8;
  text-align: center;
  padding: 16px;
}

.add-tag-section {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.add-tag-section .input {
  flex: 1;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.section-label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 8px;
}

.available-tags {
  margin-bottom: 16px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-available {
  padding: 4px 10px;
  background: #e2e8f0;
  color: #475569;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.tag-available:hover {
  background: #cbd5e1;
}

.current-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 14px;
  font-size: 12px;
}

.tag-remove {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: #60a5fa;
  cursor: pointer;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tag-remove:hover {
  background: #bfdbfe;
}

.git-notice {
  padding: 16px;
  background: #fef3c7;
  border-radius: 6px;
  text-align: center;
}

.git-notice p {
  font-size: 13px;
  color: #92400e;
  margin-bottom: 12px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.commit-item {
  padding: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.commit-item:hover {
  border-color: #3b82f6;
}

.commit-item.selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.commit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.commit-id {
  font-family: monospace;
  font-size: 12px;
  color: #6b7280;
}

.commit-time {
  font-size: 11px;
  color: #9ca3af;
}

.commit-message {
  font-size: 13px;
  color: #334155;
  margin-bottom: 8px;
}

.commit-actions {
  display: flex;
  gap: 4px;
}

.uncommitted-section {
  margin-top: 16px;
  padding: 12px;
  background: #fef3c7;
  border-radius: 6px;
}

.no-history .hint {
  font-size: 11px;
  margin-top: 4px;
}

.version-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.version-preview-modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
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
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid #e2e8f0;
}
</style>
