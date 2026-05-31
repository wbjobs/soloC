<template>
  <div class="container">
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">仪表盘</h2>
      </div>
      <div class="card-body">
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px;">
          <div class="card" style="margin-bottom: 0;">
            <div style="font-size: 32px; font-weight: 700; color: #409eff;">{{ stats.draft }}</div>
            <div style="color: #909399; margin-top: 4px;">草稿</div>
          </div>
          <div class="card" style="margin-bottom: 0;">
            <div style="font-size: 32px; font-weight: 700; color: #e6a23c;">{{ stats.pending }}</div>
            <div style="color: #909399; margin-top: 4px;">待审批</div>
          </div>
          <div class="card" style="margin-bottom: 0;">
            <div style="font-size: 32px; font-weight: 700; color: #67c23a;">{{ stats.approved }}</div>
            <div style="color: #909399; margin-top: 4px;">已通过</div>
          </div>
          <div class="card" style="margin-bottom: 0;">
            <div style="font-size: 32px; font-weight: 700; color: #f56c6c;">{{ stats.rejected }}</div>
            <div style="color: #909399; margin-top: 4px;">已拒绝</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">待我审批</h2>
        <button class="btn btn-primary" @click="router.push('/kanban')">查看看板</button>
      </div>
      <div v-if="pendingApprovals.length === 0" class="empty-state">
        <div class="empty-state-icon">✅</div>
        <p>暂无待审批文档</p>
      </div>
      <table v-else>
        <thead>
          <tr>
            <th>文档标题</th>
            <th>提交人</th>
            <th>状态</th>
            <th>当前步骤</th>
            <th>提交时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in pendingApprovals" :key="doc.id">
            <td>{{ doc.title }}</td>
            <td>{{ doc.uploaded_by?.first_name || doc.uploaded_by?.email }}</td>
            <td><span :class="['status-badge', `status-${doc.status}`]">{{ statusLabel(doc.status) }}</span></td>
            <td>第 {{ doc.current_step }} 步</td>
            <td>{{ formatDate(doc.created_at) }}</td>
            <td>
              <button class="btn btn-primary" @click="router.push(`/documents/${doc.id}`)">查看</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">我的文档</h2>
        <button class="btn btn-primary" @click="showCreateModal = true">新建文档</button>
      </div>
      <div v-if="myDocuments.length === 0" class="empty-state">
        <div class="empty-state-icon">📄</div>
        <p>暂无文档，点击"新建文档"创建第一个文档</p>
      </div>
      <table v-else>
        <thead>
          <tr>
            <th>标题</th>
            <th>状态</th>
            <th>当前步骤</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in myDocuments.slice(0, 5)" :key="doc.id">
            <td>{{ doc.title }}</td>
            <td><span :class="['status-badge', `status-${doc.status}`]">{{ statusLabel(doc.status) }}</span></td>
            <td>{{ doc.current_step > 0 ? `第 ${doc.current_step} 步` : '-' }}</td>
            <td>{{ formatDate(doc.created_at) }}</td>
            <td>
              <button class="btn btn-primary" @click="router.push(`/documents/${doc.id}`)">查看</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">新建文档</h3>
          <button class="modal-close" @click="showCreateModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">文档标题</label>
            <input type="text" class="form-input" v-model="newDoc.title" placeholder="请输入文档标题" />
          </div>
          <div class="form-group">
            <label class="form-label">文档内容</label>
            <textarea class="form-textarea" v-model="newDoc.content" placeholder="请输入文档内容"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-default" @click="showCreateModal = false">取消</button>
          <button class="btn btn-primary" @click="createDocument">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'

const router = useRouter()

const stats = ref({ draft: 0, pending: 0, approved: 0, rejected: 0 })
const pendingApprovals = ref([])
const myDocuments = ref([])
const showCreateModal = ref(false)
const newDoc = ref({ title: '', content: '' })

const statusLabel = (status) => {
  const map = {
    draft: '草稿',
    pending: '待审批',
    approved: '已通过',
    rejected: '已拒绝'
  }
  return map[status] || status
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const loadData = async () => {
  try {
    const [docsRes, pendingRes] = await Promise.all([
      api.get('/api/documents/'),
      api.get('/api/documents/pending/')
    ])
    
    const docs = docsRes.data
    stats.value = {
      draft: docs.filter(d => d.status === 'draft').length,
      pending: docs.filter(d => d.status === 'pending').length,
      approved: docs.filter(d => d.status === 'approved').length,
      rejected: docs.filter(d => d.status === 'rejected').length
    }
    
    pendingApprovals.value = pendingRes.data
    myDocuments.value = docs
  } catch (e) {
    console.error('加载数据失败', e)
  }
}

const createDocument = async () => {
  if (!newDoc.value.title.trim()) return
  try {
    await api.post('/api/documents/', newDoc.value)
    showCreateModal.value = false
    newDoc.value = { title: '', content: '' }
    await loadData()
  } catch (e) {
    console.error('创建失败', e)
  }
}

onMounted(() => {
  loadData()
})
</script>
