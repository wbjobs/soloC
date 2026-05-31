<template>
  <div class="container">
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">文档列表</h2>
        <button class="btn btn-primary" @click="showCreateModal = true">新建文档</button>
      </div>

      <div class="filter-bar">
        <label>状态筛选：</label>
        <select v-model="statusFilter" @change="loadDocuments">
          <option value="">全部</option>
          <option value="draft">草稿</option>
          <option value="pending">待审批</option>
          <option value="approved">已通过</option>
          <option value="rejected">已拒绝</option>
        </select>
      </div>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>标题</th>
            <th>状态</th>
            <th>上传人</th>
            <th>当前步骤</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in documents" :key="doc.id">
            <td>#{{ doc.id }}</td>
            <td>{{ doc.title }}</td>
            <td><span :class="['status-badge', `status-${doc.status}`]">{{ statusLabel(doc.status) }}</span></td>
            <td>{{ doc.uploaded_by?.first_name || doc.uploaded_by?.email }}</td>
            <td>{{ doc.current_step > 0 ? `第 ${doc.current_step} 步` : '-' }}</td>
            <td>{{ formatDate(doc.created_at) }}</td>
            <td>
              <div class="action-buttons">
                <button class="btn btn-primary" @click="router.push(`/documents/${doc.id}`)">查看</button>
                <button class="btn btn-danger" @click="confirmDelete(doc)" v-if="doc.status === 'draft'">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="documents.length === 0" class="empty-state">
        <div class="empty-state-icon">📄</div>
        <p>暂无文档</p>
      </div>
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

    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
      <div class="modal" style="max-width: 400px;">
        <div class="modal-header">
          <h3 class="modal-title">确认删除</h3>
          <button class="modal-close" @click="showDeleteConfirm = false">&times;</button>
        </div>
        <div class="modal-body">
          <p>确定要删除文档「{{ documentToDelete?.title }}」吗？</p>
          <p style="color: #909399; margin-top: 8px; font-size: 13px;">删除后，关联的审批记录和评论也将被删除。</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-default" @click="showDeleteConfirm = false">取消</button>
          <button class="btn btn-danger" @click="deleteDocument">确认删除</button>
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

const documents = ref([])
const statusFilter = ref('')
const showCreateModal = ref(false)
const newDoc = ref({ title: '', content: '' })
const showDeleteConfirm = ref(false)
const documentToDelete = ref(null)

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

const loadDocuments = async () => {
  try {
    let url = '/api/documents/'
    if (statusFilter.value) {
      url += `?status=${statusFilter.value}`
    }
    const res = await api.get(url)
    documents.value = res.data
  } catch (e) {
    console.error('加载文档失败', e)
  }
}

const createDocument = async () => {
  if (!newDoc.value.title.trim()) return
  try {
    await api.post('/api/documents/', newDoc.value)
    showCreateModal.value = false
    newDoc.value = { title: '', content: '' }
    await loadDocuments()
  } catch (e) {
    console.error('创建失败', e)
  }
}

const confirmDelete = (doc) => {
  documentToDelete.value = doc
  showDeleteConfirm.value = true
}

const deleteDocument = async () => {
  if (!documentToDelete.value) return
  try {
    await api.delete(`/api/documents/${documentToDelete.value.id}/`)
    showDeleteConfirm.value = false
    documentToDelete.value = null
    await loadDocuments()
  } catch (e) {
    console.error('删除失败', e)
  }
}

onMounted(() => {
  loadDocuments()
})
</script>
