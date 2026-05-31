<template>
  <div class="container">
    <div v-if="loading" class="card">
      <div class="empty-state" style="padding: 60px;">
        <div style="font-size: 48px; margin-bottom: 16px;">⏳</div>
        <p>加载中...</p>
      </div>
    </div>

    <div v-else-if="errorMessage && !document" class="card">
      <div class="empty-state" style="padding: 60px;">
        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
        <p>{{ errorMessage }}</p>
        <button class="btn btn-primary" style="margin-top: 16px;" @click="loadDocument">重试</button>
      </div>
    </div>

    <template v-else-if="document">
      <div class="card">
        <div v-if="errorMessage" style="background: #fef0f0; color: #f56c6c; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px;">
          ⚠️ {{ errorMessage }}
        </div>

        <div class="card-header">
          <h2 class="card-title">{{ document.title }}</h2>
          <div style="display: flex; gap: 8px;">
            <span :class="['status-badge', `status-${document.status}`]">{{ statusLabel }}</span>
            <button class="btn btn-default" @click="router.back()">返回</button>
          </div>
        </div>

        <div style="margin-bottom: 20px;">
          <div style="display: flex; gap: 16px; margin-bottom: 16px; color: #909399; font-size: 13px; flex-wrap: wrap;">
            <span>📋 文档 #{{ document.id }}</span>
            <span>👤 上传人：{{ document.uploaded_by?.first_name || document.uploaded_by?.email }}</span>
            <span>🕐 创建时间：{{ formatDate(document.created_at) }}</span>
            <span v-if="document.current_step > 0">📍 当前步骤：第 {{ document.current_step }} 步</span>
          </div>
          <div v-if="document.content" style="background: #fafafa; padding: 16px; border-radius: 6px; white-space: pre-wrap; line-height: 1.8;">
            {{ document.content }}
          </div>
          <div v-else style="color: #c0c4cc; font-style: italic;">
            （无文档内容）
          </div>
        </div>

        <div v-if="document.workflow_config?.length">
          <h3 style="margin-bottom: 16px; color: #303133; font-size: 16px;">
            🔄 审批流程
            <span style="font-weight: normal; font-size: 13px; color: #909399; margin-left: 8px;">
              (共 {{ document.workflow_config.length }} 个步骤)
            </span>
          </h3>
          <WorkflowFlowchart
            :workflow-config="document.workflow_config"
            :approvals="document.approvals"
            :document-status="document.status"
            :current-step="document.current_step"
          />
        </div>
        <div v-else class="empty-state" style="padding: 30px;">
          <p>⚠️ 该文档未配置审批流程</p>
        </div>

        <div v-if="document.approvals?.length">
          <h3 style="margin-bottom: 16px; color: #303133; font-size: 16px;">📜 审批历史</h3>
          <div class="approval-history">
            <div v-for="approval in document.approvals" :key="approval.id" class="approval-history-item">
              <div :class="['approval-indicator', `approval-${approval.status}`]"></div>
              <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: 600; color: #303133;">
                    Step {{ approval.step }} - {{ roleLabel(approval.role) }}
                  </span>
                  <span style="color: #909399; font-size: 12px;">
                    {{ formatDate(approval.approved_at || approval.created_at) }}
                  </span>
                </div>
                <div style="color: #606266; font-size: 14px; margin-top: 4px;">
                  审批人：{{ approval.approver?.first_name || approval.approver?.email }}
                </div>
                <div v-if="approval.comment" style="color: #909399; font-size: 13px; margin-top: 8px; font-style: italic;">
                  " {{ approval.comment }} "
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 20px;">
          <button 
            class="btn btn-warning" 
            v-if="canSubmit"
            @click="submitForApproval"
            :disabled="submitting"
          >
            {{ submitting ? '提交中...' : '提交审批' }}
          </button>
          <button 
            class="btn btn-success" 
            v-if="canApprove"
            @click="showApproveModal = true"
          >
            审批通过
          </button>
          <button 
            class="btn btn-danger" 
            v-if="canApprove"
            @click="showRejectModal = true"
          >
            审批拒绝
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">� 审计日志</h2>
        </div>
        <AuditTimeline :logs="auditLogs" :loading="auditLoading" />
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">� 评论 ({{ document.comments?.length || 0 }})</h2>
        </div>

        <div class="form-group">
          <textarea 
            class="form-textarea" 
            v-model="newComment"
            placeholder="添加评论..."
          ></textarea>
          <div style="text-align: right; margin-top: 8px;">
            <button class="btn btn-primary" @click="addComment" :disabled="!newComment.trim()">
              发表评论
            </button>
          </div>
        </div>

        <div v-for="comment in document.comments" :key="comment.id" class="comment-item">
          <span class="comment-author">{{ comment.author?.first_name || comment.author?.email }}</span>
          <span class="comment-time">{{ formatDate(comment.created_at) }}</span>
          <div class="comment-content">{{ comment.content }}</div>
        </div>

        <div v-if="!document.comments?.length" class="empty-state" style="padding: 30px;">
          <p>暂无评论</p>
        </div>
      </div>
    </template>

    <div v-if="showApproveModal" class="modal-overlay" @click.self="showApproveModal = false">
      <div class="modal" style="max-width: 400px;">
        <div class="modal-header">
          <h3 class="modal-title">审批通过</h3>
          <button class="modal-close" @click="showApproveModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">审批意见（可选）</label>
            <textarea class="form-textarea" v-model="approveComment" placeholder="请输入审批意见"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-default" @click="showApproveModal = false">取消</button>
          <button class="btn btn-success" @click="handleApprove">确认通过</button>
        </div>
      </div>
    </div>

    <div v-if="showRejectModal" class="modal-overlay" @click.self="showRejectModal = false">
      <div class="modal" style="max-width: 400px;">
        <div class="modal-header">
          <h3 class="modal-title">审批拒绝</h3>
          <button class="modal-close" @click="showRejectModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">拒绝原因</label>
            <textarea class="form-textarea" v-model="rejectComment" placeholder="请输入拒绝原因"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-default" @click="showRejectModal = false">取消</button>
          <button class="btn btn-danger" @click="handleReject" :disabled="!rejectComment.trim()">确认拒绝</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../api'
import WorkflowFlowchart from '../components/WorkflowFlowchart.vue'
import AuditTimeline from '../components/AuditTimeline.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const document = ref(null)
const loading = ref(false)
const submitting = ref(false)
const newComment = ref('')
const showApproveModal = ref(false)
const showRejectModal = ref(false)
const approveComment = ref('')
const rejectComment = ref('')
const errorMessage = ref('')
const auditLogs = ref([])
const auditLoading = ref(false)

const statusMap = {
  draft: '草稿',
  pending: '待审批',
  approved: '已通过',
  rejected: '已拒绝'
}

const roleMap = {
  employee: '员工',
  manager: '直线经理',
  director: '部门主管'
}

const statusLabel = computed(() => {
  return statusMap[document.value?.status] || document.value?.status || '未知'
})

const roleLabel = (role) => roleMap[role] || role

const canSubmit = computed(() => {
  if (!document.value || !authStore.user) return false
  return document.value.status === 'draft' &&
         document.value.uploaded_by?.id === authStore.user.id
})

const canApprove = computed(() => {
  if (!document.value || !authStore.user) return false
  if (document.value.status !== 'pending') return false
  return document.value.approvals?.some(
    a => a.approver?.id === authStore.user.id && a.status === 'pending'
  )
})

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const loadAuditLogs = async () => {
  if (!route.params.id) return
  auditLoading.value = true
  try {
    const res = await api.get(`/api/documents/${route.params.id}/audit_log/`)
    auditLogs.value = res.data || []
  } catch (e) {
    console.error('加载审计日志失败', e)
    auditLogs.value = []
  } finally {
    auditLoading.value = false
  }
}

const loadDocument = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await api.get(`/api/documents/${route.params.id}/`)
    document.value = res.data
    loadAuditLogs()
  } catch (e) {
    console.error('加载文档失败', e)
    errorMessage.value = '加载文档失败：' + (e.response?.data?.detail || e.message)
  } finally {
    loading.value = false
  }
}

const submitForApproval = async () => {
  if (submitting.value) return
  submitting.value = true
  errorMessage.value = ''

  try {
    const res = await api.post(`/api/documents/${document.value.id}/submit/`, {
      message: ''
    })
    document.value = res.data
    loadAuditLogs()
  } catch (e) {
    console.error('提交失败', e)
    errorMessage.value = e.response?.data?.error || '提交失败，请检查审批流程配置和组织架构'
  } finally {
    submitting.value = false
  }
}

const handleApprove = async () => {
  try {
    const res = await api.post(`/api/documents/${document.value.id}/approve/`, {
      comment: approveComment.value
    })
    document.value = res.data
    showApproveModal.value = false
    approveComment.value = ''
    errorMessage.value = ''
    loadAuditLogs()
  } catch (e) {
    console.error('审批失败', e)
    errorMessage.value = e.response?.data?.error || '审批失败'
  }
}

const handleReject = async () => {
  if (!rejectComment.value.trim()) return
  try {
    const res = await api.post(`/api/documents/${document.value.id}/reject/`, {
      comment: rejectComment.value
    })
    document.value = res.data
    showRejectModal.value = false
    rejectComment.value = ''
    errorMessage.value = ''
    loadAuditLogs()
  } catch (e) {
    console.error('拒绝失败', e)
    errorMessage.value = e.response?.data?.error || '操作失败'
  }
}

const addComment = async () => {
  if (!newComment.value.trim()) return
  try {
    await api.post(`/api/documents/${document.value.id}/comment/`, {
      content: newComment.value
    })
    newComment.value = ''
    await loadDocument()
  } catch (e) {
    console.error('评论失败', e)
    errorMessage.value = '评论失败'
  }
}

onMounted(() => {
  loadDocument()
})
</script>
