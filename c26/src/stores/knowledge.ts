import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'

export interface MarkdownFile {
  path: string
  name: string
  content: string
  lastModified: number
  backlinks: string[]
  outgoingLinks: string[]
  tags: string[]
}

export interface SearchResult {
  file: MarkdownFile
  score: number
  matches: Array<{
    snippet: string
    positions: number[]
  }>
}

interface FileNode {
  id: string
  name: string
  path: string
}

interface FileLink {
  source: string
  target: string
}

export interface CommitInfo {
  id: string
  message: string
  author: string
  timestamp: number
  files: string[]
}

export interface FileHistory {
  filePath: string
  commits: CommitInfo[]
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  const filesMap = ref<Map<string, MarkdownFile>>(new Map())
  const filesList = ref<MarkdownFile[]>([])
  const rootDirectory = ref('')
  const isScanning = ref(false)
  const searchResults = ref<SearchResult[]>([])
  const nodes = ref<FileNode[]>([])
  const links = ref<FileLink[]>([])
  const lastSearchQuery = ref('')
  
  const allTags = ref<string[]>([])
  const tagCounts = ref<Record<string, number>>({})
  const selectedTags = ref<string[]>([])
  
  const gitInitialized = ref(false)
  const hasUncommittedChanges = ref(false)

  const files = computed(() => filesMap.value)
  
  const filteredFilesList = computed(() => {
    if (selectedTags.value.length === 0) {
      return filesList.value
    }
    return filesList.value.filter(file => 
      selectedTags.value.every(tag => file.tags.includes(tag))
    )
  })

  async function scanDirectory(path: string) {
    isScanning.value = true
    try {
      await invoke('scan_directory', { directory: path })
      rootDirectory.value = path
      await loadFiles()
      await buildGraph()
      await loadTags()
      await checkGitStatus()
      if (lastSearchQuery.value) {
        await search(lastSearchQuery.value)
      }
    } finally {
      isScanning.value = false
    }
  }

  async function loadFiles() {
    const filesRecord: Record<string, MarkdownFile> = await invoke('get_all_files')
    const entries = Object.entries(filesRecord)
    filesMap.value = new Map(entries)
    filesList.value = entries.map(([_, file]) => file)
  }

  async function search(query: string) {
    lastSearchQuery.value = query
    if (!query.trim()) {
      searchResults.value = []
      return []
    }
    const results: SearchResult[] = await invoke('search_files', { query })
    searchResults.value = [...results]
    return results
  }

  async function getFile(path: string): Promise<MarkdownFile | null> {
    if (filesMap.value.has(path)) {
      return filesMap.value.get(path)!
    }
    const file: MarkdownFile | null = await invoke('get_file', { path })
    if (file) {
      filesMap.value.set(path, file)
    }
    return file
  }

  async function saveFile(path: string, content: string) {
    await invoke('save_file', { path, content })
    const existing = filesMap.value.get(path)
    if (existing) {
      existing.content = content
      existing.lastModified = Date.now()
    }
    await loadFiles()
    await buildGraph()
    await checkGitStatus()
    if (lastSearchQuery.value) {
      await search(lastSearchQuery.value)
    }
  }

  async function createFile(path: string, name: string) {
    await invoke('create_file', { directory: path, name })
    await loadFiles()
    await checkGitStatus()
    if (lastSearchQuery.value) {
      await search(lastSearchQuery.value)
    }
  }

  async function deleteFile(path: string) {
    await invoke('delete_file', { path })
    filesMap.value.delete(path)
    await loadFiles()
    await buildGraph()
    await checkGitStatus()
    if (lastSearchQuery.value) {
      await search(lastSearchQuery.value)
    }
  }

  async function buildGraph() {
    const graphData = await invoke('build_graph')
    const data = graphData as { nodes: FileNode[]; links: FileLink[] }
    nodes.value = [...data.nodes]
    links.value = [...data.links]
  }

  async function exportToPdf(filePath: string, htmlContent: string) {
    await invoke('export_to_pdf', { filePath, htmlContent })
  }

  async function initGit() {
    await invoke('git_init')
    gitInitialized.value = true
  }

  async function checkGitStatus() {
    if (!rootDirectory.value) return
    try {
      gitInitialized.value = await invoke('git_is_initialized')
      if (gitInitialized.value) {
        hasUncommittedChanges.value = await invoke('git_has_changes')
      }
    } catch (e) {
      console.error('Git status check failed:', e)
    }
  }

  async function commitChanges(message: string) {
    const commitId = await invoke('git_commit', { message })
    await checkGitStatus()
    return commitId
  }

  async function getFileHistory(filePath: string): Promise<FileHistory> {
    return await invoke('git_get_history', { filePath })
  }

  async function getFileVersion(filePath: string, commitId: string): Promise<string> {
    return await invoke('git_get_version', { filePath, commitId })
  }

  async function restoreVersion(
    filePath: string, 
    commitId: string, 
    commitRestore: boolean = false
  ): Promise<string | null> {
    const result = await invoke('git_restore', { 
      filePath, 
      commitId, 
      commitRestore 
    })
    await loadFiles()
    await checkGitStatus()
    return result as string | null
  }

  async function loadTags() {
    try {
      allTags.value = await invoke('tag_get_all')
      tagCounts.value = await invoke('tag_get_counts')
    } catch (e) {
      console.error('Load tags failed:', e)
      allTags.value = []
      tagCounts.value = {}
    }
  }

  async function getFileTags(filePath: string): Promise<string[]> {
    return await invoke('tag_get_for_file', { filePath })
  }

  async function addTag(filePath: string, tag: string) {
    await invoke('tag_add', { filePath, tag })
    const file = filesMap.value.get(filePath)
    if (file && !file.tags.includes(tag)) {
      file.tags.push(tag)
      file.tags.sort()
    }
    await loadTags()
    await loadFiles()
  }

  async function removeTag(filePath: string, tag: string) {
    await invoke('tag_remove', { filePath, tag })
    const file = filesMap.value.get(filePath)
    if (file) {
      file.tags = file.tags.filter(t => t !== tag)
    }
    await loadTags()
    await loadFiles()
  }

  async function setFileTags(filePath: string, tags: string[]) {
    await invoke('tag_set', { filePath, tags })
    const file = filesMap.value.get(filePath)
    if (file) {
      file.tags = [...tags].sort()
    }
    await loadTags()
    await loadFiles()
  }

  async function getFilesByTag(tag: string): Promise<string[]> {
    return await invoke('tag_get_files', { tag })
  }

  function toggleTagFilter(tag: string) {
    const index = selectedTags.value.indexOf(tag)
    if (index === -1) {
      selectedTags.value.push(tag)
    } else {
      selectedTags.value.splice(index, 1)
    }
  }

  function clearTagFilters() {
    selectedTags.value = []
  }

  return {
    files,
    filesList,
    filteredFilesList,
    rootDirectory,
    isScanning,
    searchResults,
    nodes,
    links,
    lastSearchQuery,
    allTags,
    tagCounts,
    selectedTags,
    gitInitialized,
    hasUncommittedChanges,
    scanDirectory,
    loadFiles,
    search,
    getFile,
    saveFile,
    createFile,
    deleteFile,
    buildGraph,
    exportToPdf,
    initGit,
    checkGitStatus,
    commitChanges,
    getFileHistory,
    getFileVersion,
    restoreVersion,
    loadTags,
    getFileTags,
    addTag,
    removeTag,
    setFileTags,
    getFilesByTag,
    toggleTagFilter,
    clearTagFilters,
  }
})
