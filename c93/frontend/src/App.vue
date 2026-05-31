<template>
  <div class="app-container">
    <el-header class="header">
      <h1><el-icon><Document /></el-icon> 多模态古籍文字识别与修复系统</h1>
      <div class="user-section">
        <span v-if="currentUser" class="username">{{ currentUser.username }} ({{ getRoleText(currentUser.role) }})</span>
        <el-button v-if="!currentUser" type="primary" size="small" @click="showLoginDialog = true">登录</el-button>
        <el-button v-else type="default" size="small" @click="logout">退出</el-button>
      </div>
    </el-header>
    
    <el-container class="main-container">
      <el-aside width="300px" class="sidebar">
        <el-card class="upload-card">
          <template #header>
            <div class="card-header">
              <span>图片上传</span>
            </div>
          </template>
          <el-upload
            ref="uploadRef"
            action="/api/upload"
            multiple
            :auto-upload="true"
            :on-success="handleUploadSuccess"
            :on-error="handleUploadError"
            :before-upload="beforeUpload"
            :on-progress="handleUploadProgress"
            drag
            accept="image/*"
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">
              拖拽古籍图片到此处或 <em>点击上传</em>
            </div>
            <template #tip>
              <div class="el-upload__tip">
                支持 jpg、png 格式，单张不超过 20MB
              </div>
            </template>
          </el-upload>
        </el-card>
        
        <el-card class="image-list-card" style="margin-top: 20px;">
          <template #header>
            <div class="card-header">
              <span>图片列表</span>
              <el-badge :value="images.length" class="item" />
            </div>
          </template>
          <div class="image-list">
            <div
              v-for="img in images"
              :key="img.id"
              class="image-item"
              :class="{ active: selectedImage?.id === img.id }"
              @click="selectImage(img)"
            >
              <div class="img-wrapper">
                <el-skeleton v-if="img.loading" :loading="true" animated />
                <img
                  v-else
                  :src="img.thumbUrl || img.url"
                  :alt="img.filename"
                  loading="lazy"
                  @error="handleImageError($event, img)"
                />
              </div>
              <div class="image-info">
                <span class="filename">{{ img.filename }}</span>
                <el-tag :type="getStatusType(img.status)" size="small">{{ img.status }}</el-tag>
              </div>
            </div>
          </div>
        </el-card>
      </el-aside>
      
      <el-main class="content-area">
        <el-tabs v-model="activeTab" class="main-tabs">
          <el-tab-pane label="OCR 文字识别" name="ocr">
            <div v-if="selectedImage" class="ocr-panel">
              <div class="image-viewer">
                <h4>原始图片（可框选局部放大识别）</h4>
                <div class="image-adjust-tools">
                  <span class="tool-label">对比度:</span>
                  <el-slider v-model="contrast" :min="50" :max="200" @input="applyImageAdjust" style="width: 120px;" />
                  <span class="tool-label" style="margin-left: 15px;">亮度:</span>
                  <el-slider v-model="brightness" :min="50" :max="200" @input="applyImageAdjust" style="width: 120px;" />
                  <el-button size="small" @click="resetImageAdjust" style="margin-left: 15px;">重置</el-button>
                </div>
                <div class="image-container" ref="imageContainer">
                  <el-skeleton v-if="imageLoading" :loading="true" animated />
                  <img
                    v-else
                    :src="selectedImage.url"
                    ref="ocrImage"
                    @mousedown="startSelection"
                    @mousemove="updateSelection"
                    @mouseup="endSelection"
                    @load="handleImageLoad"
                    @error="handleMainImageError"
                    :style="imageAdjustStyle"
                    style="max-width: 100%; cursor: crosshair;"
                  />
                  <div
                    v-if="selectionBox"
                    class="selection-box"
                    :style="selectionBoxStyle"
                  ></div>
                </div>
                <div class="action-buttons" style="margin-top: 15px;">
                  <el-button type="primary" @click="performOCR" :loading="ocrLoading">
                    <el-icon><Search /></el-icon> 全文识别
                  </el-button>
                  <el-button type="success" @click="performRegionOCR" :disabled="!selectionBox" :loading="ocrLoading">
                    <el-icon><ZoomIn /></el-icon> 局部识别
                  </el-button>
                  <el-button @click="clearSelection">清除选框</el-button>
                </div>
              </div>
              
              <div class="ocr-result">
                <h4>识别结果</h4>
                <div class="completion-hint" v-if="textSuggestions.length > 0">
                  <span class="hint-label">智能补全建议:</span>
                  <el-tag
                    v-for="(suggestion, idx) in textSuggestions"
                    :key="idx"
                    class="suggestion-tag"
                    @click="applySuggestion(suggestion.text)"
                  >
                    {{ suggestion.context }} → {{ suggestion.text }}
                  </el-tag>
                </div>
                <el-input
                  v-model="ocrText"
                  type="textarea"
                  :rows="12"
                  placeholder="识别结果将显示在这里，可在任意位置输入获得补全建议..."
                  @input="onTextInput"
                  ref="ocrTextArea"
                />
                <div v-if="ocrResult" class="ocr-meta" style="margin-top: 10px;">
                  <el-tag type="info">置信度: {{ (ocrResult.confidence * 100).toFixed(1) }}%</el-tag>
                  <el-button size="small" type="primary" @click="saveEditedText" style="margin-left: 10px;">保存编辑</el-button>
                </div>
              </div>
            </div>
            <el-empty v-else description="请先选择一张图片" />
          </el-tab-pane>
          
          <el-tab-pane label="图像修复" name="restore">
            <div v-if="selectedImage" class="restore-panel">
              <div class="restore-images">
                <div class="restore-image-card">
                  <h4>原始图片</h4>
                  <img :src="selectedImage.url" style="max-width: 100%;" />
                </div>
                <div class="restore-image-card">
                  <h4>修复结果</h4>
                  <img v-if="restoredImageUrl" :src="restoredImageUrl" style="max-width: 100%;" />
                  <el-empty v-else description="等待修复" :image-size="100" />
                </div>
              </div>
              
              <div class="restore-controls" style="margin-top: 20px;">
                <el-radio-group v-model="restoreType" style="margin-right: 20px;">
                  <el-radio label="denoise">去噪</el-radio>
                  <el-radio label="inpainting">污渍修复</el-radio>
                  <el-radio label="enhance">对比度增强</el-radio>
                  <el-radio label="complete">完整修复</el-radio>
                </el-radio-group>
                <el-button type="primary" @click="startRestoration" :loading="restoring">
                  <el-icon><MagicStick /></el-icon> 开始修复
                </el-button>
              </div>
              
              <div v-if="restoreTask" class="task-info" style="margin-top: 15px; padding: 15px; background: #f5f7fa; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <span style="font-weight: bold;">任务状态:</span>
                  <el-tag :type="getStatusTagType(restoreTask.status)">{{ getStatusText(restoreTask.status) }}</el-tag>
                </div>
                <el-progress :percentage="restoreTask.progress" :status="restoreTask.status === 'completed' ? 'success' : (restoreTask.status === 'failed' ? 'exception' : '')" />
              </div>
            </div>
            <el-empty v-else description="请先选择一张图片" />
          </el-tab-pane>
          
          <el-tab-pane label="批量导出" name="export">
            <div class="export-panel">
              <h4>选择要导出的图片</h4>
              <el-checkbox-group v-model="selectedExportImages">
                <div class="export-image-list">
                  <div v-for="img in images" :key="img.id" class="export-image-item">
                    <el-checkbox :label="img.id">
                      <img :src="img.url" :alt="img.filename" style="width: 100px; height: 100px; object-fit: cover; margin-right: 10px;" />
                      <span>{{ img.filename }}</span>
                    </el-checkbox>
                  </div>
                </div>
              </el-checkbox-group>
              
              <div class="export-controls" style="margin-top: 20px;">
                <el-radio-group v-model="exportFormat">
                  <el-radio label="txt">TXT 格式</el-radio>
                  <el-radio label="md">Markdown 格式</el-radio>
                </el-radio-group>
                <el-button
                  type="primary"
                  @click="exportResults"
                  :disabled="selectedExportImages.length === 0"
                  style="margin-left: 20px;"
                >
                  <el-icon><Download /></el-icon> 导出选中
                </el-button>
              </div>
            </div>
          </el-tab-pane>
          
          <el-tab-pane label="审核管理" name="audit" v-if="currentUser?.role === 'admin'">
            <div class="audit-panel">
              <h4>待审核图片</h4>
              <div v-if="pendingImages.length === 0" class="empty-audit">
                <el-empty description="暂无待审核图片" />
              </div>
              <div v-else class="audit-list">
                <div v-for="img in pendingImages" :key="img.id" class="audit-item">
                  <img :src="img.url" :alt="img.filename" />
                  <div class="audit-info">
                    <p><strong>文件名:</strong> {{ img.filename }}</p>
                    <p><strong>上传时间:</strong> {{ formatDate(img.upload_time) }}</p>
                    <div class="audit-actions">
                      <el-button type="success" size="small" @click="auditImage(img.id, 'approve')">通过</el-button>
                      <el-button type="danger" size="small" @click="showRejectDialog(img.id)">拒绝</el-button>
                    </div>
                  </div>
                </div>
              </div>
              
              <h4 style="margin-top: 30px;">审核日志</h4>
              <div class="audit-logs">
                <el-table :data="auditLogs" style="width: 100%">
                  <el-table-column prop="image_id" label="图片ID" width="100" />
                  <el-table-column prop="action" label="操作" width="100">
                    <template #default="scope">
                      <el-tag :type="scope.row.action === 'approve' ? 'success' : 'danger'">
                        {{ scope.row.action === 'approve' ? '通过' : '拒绝' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="comment" label="备注" />
                  <el-table-column prop="created_time" label="时间" width="200" />
                </el-table>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-main>
    </el-container>
    
    <el-dialog v-model="showLoginDialog" title="用户登录" width="400px">
      <el-form :model="loginForm" label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="loginForm.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="loginForm.password" type="password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showLoginDialog = false">取消</el-button>
        <el-button type="primary" @click="login" :loading="loginLoading">登录</el-button>
      </template>
    </el-dialog>
    
    <el-dialog v-model="showRejectDialog" title="拒绝原因" width="400px">
      <el-input v-model="rejectReason" type="textarea" :rows="4" placeholder="请输入拒绝原因..." />
      <template #footer>
        <el-button @click="showRejectDialog = false">取消</el-button>
        <el-button type="danger" @click="confirmReject">确认拒绝</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const activeTab = ref('ocr')
const images = ref([])
const selectedImage = ref(null)
const ocrText = ref('')
const ocrResult = ref(null)
const ocrLoading = ref(false)
const restoreType = ref('denoise')
const restoring = ref(false)
const restoreTask = ref(null)
const restoredImageUrl = ref('')
const selectedExportImages = ref([])
const exportFormat = ref('txt')
const imageLoading = ref(false)

const contrast = ref(100)
const brightness = ref(100)
const textSuggestions = ref([])
const ocrTextArea = ref(null)

const currentUser = ref(null)
const showLoginDialog = ref(false)
const loginLoading = ref(false)
const loginForm = reactive({ username: '', password: '' })
const pendingImages = ref([])
const auditLogs = ref([])
const showRejectDialog = ref(false)
const rejectReason = ref('')
const currentRejectImageId = ref(null)

const isSelecting = ref(false)
const startPos = reactive({ x: 0, y: 0 })
const selectionBox = ref(null)
const imageContainer = ref(null)
const ocrImage = ref(null)

const imageAdjustStyle = computed(() => ({
  filter: `contrast(${contrast.value}%) brightness(${brightness.value}%)`
}))

const selectionBoxStyle = computed(() => {
  if (!selectionBox.value) return {}
  return {
    left: selectionBox.value.x + 'px',
    top: selectionBox.value.y + 'px',
    width: selectionBox.value.width + 'px',
    height: selectionBox.value.height + 'px'
  }
})

const getStatusType = (status) => {
  const types = {
    uploaded: 'info',
    approved: 'success',
    processing: 'warning',
    pending: 'info',
    rejected: 'danger'
  }
  return types[status] || 'info'
}

const getStatusTagType = (status) => {
  const types = {
    pending: 'info',
    processing: 'warning',
    completed: 'success',
    failed: 'danger'
  }
  return types[status] || 'info'
}

const getStatusText = (status) => {
  const texts = {
    pending: '等待中',
    processing: '处理中',
    completed: '已完成',
    failed: '失败'
  }
  return texts[status] || status
}

const getRoleText = (role) => {
  const roles = {
    admin: '管理员',
    user: '用户',
    guest: '访客'
  }
  return roles[role] || role
}

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleString()
}

const beforeUpload = async (file) => {
  const isImage = file.type.startsWith('image/')
  if (!isImage) {
    ElMessage.error('只能上传图片文件！')
    return false
  }
  
  const isLt20M = file.size / 1024 / 1024 < 20
  if (!isLt20M) {
    ElMessage.error('图片大小不能超过 20MB！')
    return false
  }
  
  return true
}

const handleUploadProgress = () => {}

const handleUploadSuccess = (response) => {
  if (response.success) {
    const newImages = response.data.map(img => ({
      ...img,
      loading: false,
      thumbUrl: img.thumb_url
    }))
    images.value = [...newImages, ...images.value]
    ElMessage.success('上传成功')
  }
}

const handleUploadError = () => {
  ElMessage.error('上传失败')
}

const handleImageError = (event, img) => {
  event.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5Ij7liIbpkp/nvZHlvIg8L3RleHQ+PC9zdmc+'
}

const handleMainImageError = (event) => {
  event.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpIiBmb250LXNpemU9IjE2IiBmaWxsPSIjOTk5Ij7lt6XnroDliIbpkp/ogIPnoJ88L3RleHQ+PC9zdmc+'
  imageLoading.value = false
}

const handleImageLoad = () => {
  imageLoading.value = false
}

const selectImage = (img) => {
  imageLoading.value = true
  selectedImage.value = img
  ocrText.value = ''
  ocrResult.value = null
  restoredImageUrl.value = ''
  restoreTask.value = null
  selectionBox.value = null
  contrast.value = 100
  brightness.value = 100
  loadOCRResult(img.id)
}

const loadOCRResult = async (imageId) => {
  try {
    const res = await axios.get(`/api/ocr/${imageId}`)
    if (res.data.success && res.data.data) {
      ocrResult.value = res.data.data
      ocrText.value = res.data.data.text
    }
  } catch (e) {
    console.error(e)
  }
}

const startSelection = (e) => {
  if (!ocrImage.value) return
  isSelecting.value = true
  const rect = ocrImage.value.getBoundingClientRect()
  startPos.x = e.clientX - rect.left
  startPos.y = e.clientY - rect.top
  selectionBox.value = { x: startPos.x, y: startPos.y, width: 0, height: 0 }
}

const updateSelection = (e) => {
  if (!isSelecting.value || !ocrImage.value) return
  const rect = ocrImage.value.getBoundingClientRect()
  const currentX = e.clientX - rect.left
  const currentY = e.clientY - rect.top
  
  selectionBox.value.x = Math.min(startPos.x, currentX)
  selectionBox.value.y = Math.min(startPos.y, currentY)
  selectionBox.value.width = Math.abs(currentX - startPos.x)
  selectionBox.value.height = Math.abs(currentY - startPos.y)
}

const endSelection = () => {
  isSelecting.value = false
}

const clearSelection = () => {
  selectionBox.value = null
}

const performOCR = async () => {
  if (!selectedImage.value) return
  ocrLoading.value = true
  try {
    const res = await axios.post(`/api/ocr/${selectedImage.value.id}`)
    if (res.data.success) {
      ocrResult.value = res.data.data
      ocrText.value = res.data.data.text
      ElMessage.success('识别完成')
    }
  } catch (e) {
    ElMessage.error('识别失败')
  } finally {
    ocrLoading.value = false
  }
}

const performRegionOCR = async () => {
  if (!selectedImage.value || !selectionBox.value) return
  ocrLoading.value = true
  try {
    const res = await axios.post(`/api/ocr/${selectedImage.value.id}`, null, {
      params: { region: JSON.stringify(selectionBox.value) }
    })
    if (res.data.success) {
      ocrResult.value = res.data.data
      ocrText.value = res.data.data.text
      ElMessage.success('局部识别完成')
    }
  } catch (e) {
    ElMessage.error('识别失败')
  } finally {
    ocrLoading.value = false
  }
}

const onTextInput = async () => {
  const text = ocrText.value
  if (!text || text.length < 2) {
    textSuggestions.value = []
    return
  }
  
  try {
    const res = await axios.post('/api/text/complete', {
      text: text,
      max_candidates: 5
    })
    if (res.data.success) {
      textSuggestions.value = res.data.data
    }
  } catch (e) {
    console.error(e)
  }
}

const applySuggestion = (suggestionText) => {
  ocrText.value += suggestionText
  textSuggestions.value = []
  ElMessage.success('已应用补全')
}

const saveEditedText = async () => {
  if (!selectedImage.value) return
  try {
    await axios.put(`/api/ocr/${selectedImage.value.id}/edit`, {
      edited_text: ocrText.value
    })
    ElMessage.success('保存成功')
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

const applyImageAdjust = () => {}

const resetImageAdjust = () => {
  contrast.value = 100
  brightness.value = 100
}

const startRestoration = async () => {
  if (!selectedImage.value) return
  restoring.value = true
  try {
    const res = await axios.post(`/api/restore/${selectedImage.value.id}`, null, {
      params: { task_type: restoreType.value }
    })
    if (res.data.success) {
      ElMessage.success('修复任务已启动')
      pollRestorationStatus(res.data.task_id)
    }
  } catch (e) {
    ElMessage.error('启动修复失败')
    restoring.value = false
  }
}

const pollRestorationStatus = async (taskId) => {
  const poll = async () => {
    try {
      const res = await axios.get(`/api/restore/${taskId}`)
      if (res.data.success) {
        restoreTask.value = res.data.data
        if (res.data.data.status === 'completed') {
          restoredImageUrl.value = res.data.data.result_url
          restoring.value = false
          ElMessage.success('修复完成')
        } else if (res.data.data.status === 'failed') {
          restoring.value = false
          ElMessage.error('修复失败')
        } else {
          setTimeout(poll, 1000)
        }
      }
    } catch (e) {
      restoring.value = false
    }
  }
  poll()
}

const exportResults = async () => {
  if (selectedExportImages.value.length === 0) return
  try {
    const res = await axios.post('/api/export', selectedExportImages.value, {
      params: { format: exportFormat.value }
    })
    if (res.data.success) {
      window.open(res.data.download_url, '_blank')
      ElMessage.success('导出成功')
    }
  } catch (e) {
    ElMessage.error('导出失败')
  }
}

const loadImages = async () => {
  try {
    const res = await axios.get('/api/images')
    if (res.data.success) {
      images.value = res.data.data
    }
  } catch (e) {
    console.error(e)
  }
}

const login = async () => {
  if (!loginForm.username || !loginForm.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  
  loginLoading.value = true
  try {
    const res = await axios.post('/api/auth/login', {
      username: loginForm.username,
      password: loginForm.password
    })
    
    if (res.data.success) {
      currentUser.value = res.data.data
      showLoginDialog.value = false
      ElMessage.success('登录成功')
      loginForm.username = ''
      loginForm.password = ''
      
      if (currentUser.value.role === 'admin') {
        loadPendingAudit()
        loadAuditLogs()
      }
    }
  } catch (e) {
    ElMessage.error('登录失败：用户名或密码错误')
  } finally {
    loginLoading.value = false
  }
}

const logout = () => {
  currentUser.value = null
  ElMessage.success('已退出登录')
}

const loadPendingAudit = async () => {
  try {
    const res = await axios.get('/api/audit/pending')
    if (res.data.success) {
      pendingImages.value = res.data.data
    }
  } catch (e) {
    console.error(e)
  }
}

const loadAuditLogs = async () => {
  try {
    const res = await axios.get('/api/audit/logs')
    if (res.data.success) {
      auditLogs.value = res.data.data
    }
  } catch (e) {
    console.error(e)
  }
}

const auditImage = async (imageId, action) => {
  try {
    await axios.post(`/api/audit/${imageId}`, {
      action: action,
      comment: '',
      admin_id: currentUser.value.user_id
    })
    ElMessage.success(action === 'approve' ? '已通过' : '已拒绝')
    loadPendingAudit()
    loadAuditLogs()
    loadImages()
  } catch (e) {
    ElMessage.error('审核操作失败')
  }
}

const showRejectDialog = (imageId) => {
  currentRejectImageId.value = imageId
  rejectReason.value = ''
  showRejectDialog.value = true
}

const confirmReject = () => {
  if (currentRejectImageId.value) {
    auditImage(currentRejectImageId.value, 'reject')
  }
  showRejectDialog.value = false
  currentRejectImageId.value = null
}

onMounted(() => {
  loadImages()
})
</script>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.header h1 {
  margin: 0;
  font-size: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-section {
  display: flex;
  align-items: center;
  gap: 15px;
}

.username {
  font-size: 14px;
}

.main-container {
  flex: 1;
  overflow: hidden;
}

.sidebar {
  background: #f5f7fa;
  padding: 20px;
  overflow-y: auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.image-list {
  max-height: 400px;
  overflow-y: auto;
}

.image-item {
  padding: 10px;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 10px;
  transition: all 0.3s;
}

.image-item:hover {
  background: #e8f4ff;
}

.image-item.active {
  border-color: #409eff;
  background: #e8f4ff;
}

.img-wrapper {
  width: 100%;
  height: 80px;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 5px;
}

.img-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.el-upload__tip {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.image-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filename {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}

.content-area {
  padding: 20px;
  overflow-y: auto;
}

.main-tabs {
  height: 100%;
}

.ocr-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
}

.image-adjust-tools {
  display: flex;
  align-items: center;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 8px;
  margin-bottom: 15px;
}

.tool-label {
  font-size: 13px;
  color: #606266;
}

.image-container {
  position: relative;
  display: inline-block;
}

.selection-box {
  position: absolute;
  border: 2px dashed #409eff;
  background: rgba(64, 158, 255, 0.1);
  pointer-events: none;
}

.action-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.completion-hint {
  padding: 10px;
  background: #ecf5ff;
  border: 1px solid #d9ecff;
  border-radius: 4px;
  margin-bottom: 10px;
}

.hint-label {
  font-size: 13px;
  color: #409eff;
  margin-right: 10px;
}

.suggestion-tag {
  margin: 2px 5px;
  cursor: pointer;
  transition: all 0.2s;
}

.suggestion-tag:hover {
  transform: scale(1.05);
}

.restore-panel .restore-images {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
}

.restore-image-card {
  text-align: center;
}

.restore-image-card h4 {
  margin-bottom: 15px;
}

.export-image-list {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.export-image-item {
  width: 200px;
}

.export-image-item .el-checkbox {
  display: flex;
  align-items: center;
}

.audit-panel h4 {
  margin-bottom: 15px;
  color: #303133;
}

.audit-list {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.audit-item {
  width: 280px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.audit-item img {
  width: 100%;
  height: 180px;
  object-fit: cover;
}

.audit-info {
  padding: 15px;
}

.audit-info p {
  margin: 5px 0;
  font-size: 13px;
  color: #606266;
}

.audit-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.empty-audit {
  padding: 40px;
}

.audit-logs {
  margin-top: 15px;
}
</style>
