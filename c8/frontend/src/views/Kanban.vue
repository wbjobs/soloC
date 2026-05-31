<template>
  <div class="container">
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">审批看板</h2>
      </div>

      <div class="kanban">
        <div class="kanban-column">
          <div class="kanban-column-header">
            <span class="kanban-column-title">📝 草稿</span>
            <span class="kanban-count">{{ documentsByStatus.draft.length }}</span>
          </div>
          <div v-for="doc in documentsByStatus.draft" :key="doc.id">
            <div class="document-card" @click="router.push(`/documents/${doc.id}`)">
              <div class="document-card-title">{{ doc.title }}</div>
              <div class="document-card-meta">
                {{ doc.uploaded_by?.first_name || doc.uploaded_by?.email }}
              </div>
              <div class="document-card-footer">
                <span>{{ formatDate(doc.created_at) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="kanban-column">
          <div class="kanban-column-header">
            <span class="kanban-column-title">⏳ 待审批</span>
            <span class="kanban-count">{{ documentsByStatus.pending.length }}</span>
          </div>
          <div v-for="doc in documentsByStatus.pending" :key="doc.id">
            <div class="document-card" @click="router.push(`/documents/${doc.id}`)">
              <div class="document-card-title">{{ doc.title }}</div>
              <div class="document-card-meta">
                {{ doc.uploaded_by?.first_name || doc.uploaded_by?.email }}
              </div>
              <div class="document-card-footer">
                <span class="tag tag-info">第 {{ doc.current_step }} 步</span>
                <span>{{ formatDate(doc.created_at) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="kanban-column">
          <div class="kanban-column-header">
            <span class="kanban-column-title">✅ 已通过</span>
            <span class="kanban-count">{{ documentsByStatus.approved.length }}</span>
          </div>
          <div v-for="doc in documentsByStatus.approved" :key="doc.id">
            <div class="document-card" @click="router.push(`/documents/${doc.id}`)">
              <div class="document-card-title">{{ doc.title }}</div>
              <div class="document-card-meta">
                {{ doc.uploaded_by?.first_name || doc.uploaded_by?.email }}
              </div>
              <div class="document-card-footer">
                <span>{{ formatDate(doc.created_at) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="kanban-column">
          <div class="kanban-column-header">
            <span class="kanban-column-title">❌ 已拒绝</span>
            <span class="kanban-count">{{ documentsByStatus.rejected.length }}</span>
          </div>
          <div v-for="doc in documentsByStatus.rejected" :key="doc.id">
            <div class="document-card" @click="router.push(`/documents/${doc.id}`)">
              <div class="document-card-title">{{ doc.title }}</div>
              <div class="document-card-meta">
                {{ doc.uploaded_by?.first_name || doc.uploaded_by?.email }}
              </div>
              <div class="document-card-footer">
                <span>{{ formatDate(doc.created_at) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'

const router = useRouter()
const documents = ref([])

const documentsByStatus = computed(() => ({
  draft: documents.value.filter(d => d.status === 'draft'),
  pending: documents.value.filter(d => d.status === 'pending'),
  approved: documents.value.filter(d => d.status === 'approved'),
  rejected: documents.value.filter(d => d.status === 'rejected')
}))

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

const loadDocuments = async () => {
  try {
    const res = await api.get('/api/documents/')
    documents.value = res.data
  } catch (e) {
    console.error('加载文档失败', e)
  }
}

onMounted(() => {
  loadDocuments()
})
</script>
