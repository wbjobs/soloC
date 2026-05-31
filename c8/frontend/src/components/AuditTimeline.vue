<template>
  <div class="audit-timeline">
    <div v-if="loading" class="timeline-loading">
      <span>⏳ 加载审计日志...</span>
    </div>

    <div v-else-if="logs.length === 0" class="timeline-empty">
      <div class="empty-state-icon">📋</div>
      <p>暂无审计记录</p>
    </div>

    <div v-else class="timeline-container">
      <div
        v-for="(log, index) in logs"
        :key="log.id"
        class="timeline-item"
        :class="`timeline-item-${log.action}`"
      >
        <div class="timeline-left">
          <div class="timeline-dot" :class="`dot-${log.action}`">
            <span class="timeline-icon">{{ getActionIcon(log.action) }}</span>
          </div>
          <div v-if="index < logs.length - 1" class="timeline-line"></div>
        </div>

        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-action" :class="`action-${log.action}`">
              {{ log.action_display || log.action }}
            </span>
            <span class="timeline-time">
              {{ formatTime(log.created_at) }}
            </span>
          </div>

          <div class="timeline-message" v-if="log.message">
            {{ log.message }}
          </div>

          <div class="timeline-details" v-if="hasDetails(log)">
            <div class="detail-item" v-if="log.old_status || log.new_status">
              <span class="detail-label">状态:</span>
              <span class="status-badge" :class="`status-${log.old_status}`" v-if="log.old_status">
                {{ getStatusLabel(log.old_status) }}
              </span>
              <span v-if="log.old_status && log.new_status" class="arrow">→</span>
              <span class="status-badge" :class="`status-${log.new_status}`" v-if="log.new_status">
                {{ getStatusLabel(log.new_status) }}
              </span>
            </div>

            <div class="detail-item" v-if="log.old_step || log.new_step">
              <span class="detail-label">步骤:</span>
              <span v-if="log.old_step">{{ log.old_step }}</span>
              <span v-if="log.old_step && log.new_step" class="arrow">→</span>
              <span v-if="log.new_step">{{ log.new_step }}</span>
            </div>

            <div class="detail-item" v-if="log.user">
              <span class="detail-label">操作人:</span>
              <span>{{ log.user.first_name || log.user.email }}</span>
              <span v-if="log.user.role" class="role-tag">
                {{ getRoleLabel(log.user.role) }}
              </span>
            </div>

            <div class="detail-item" v-if="log.ip_address">
              <span class="detail-label">IP:</span>
              <span>{{ log.ip_address }}</span>
            </div>

            <div class="detail-meta" v-if="log.meta_data && Object.keys(log.meta_data).length > 0">
              <details class="meta-details">
                <summary>元数据</summary>
                <pre>{{ JSON.stringify(log.meta_data, null, 2) }}</pre>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  logs: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const actionIcons = {
  create: '📝',
  update: '✏️',
  submit: '📤',
  approve: '✅',
  reject: '❌',
  comment: '💬',
  delete: '🗑️',
  restore: '↩️',
  status_change: '🔄',
  step_change: '⏭️'
}

const statusLabels = {
  draft: '草稿',
  pending: '待审批',
  approved: '已通过',
  rejected: '已拒绝'
}

const roleLabels = {
  employee: '员工',
  manager: '直线经理',
  director: '部门主管'
}

const getActionIcon = (action) => {
  return actionIcons[action] || '📋'
}

const getStatusLabel = (status) => {
  return statusLabels[status] || status
}

const getRoleLabel = (role) => {
  return roleLabels[role] || role
}

const hasDetails = (log) => {
  return log.old_status || log.new_status ||
         log.old_step || log.new_step ||
         log.user || log.ip_address ||
         (log.meta_data && Object.keys(log.meta_data).length > 0)
}

const formatTime = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
</script>

<style scoped>
.audit-timeline {
  padding: 10px 0;
}

.timeline-loading,
.timeline-empty {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.timeline-empty .empty-state-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.timeline-container {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  gap: 16px;
  padding: 4px 0;
}

.timeline-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.timeline-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 2px solid;
  z-index: 2;
  transition: all 0.2s;
}

.timeline-dot:hover {
  transform: scale(1.1);
}

.dot-create { border-color: #409eff; color: #409eff; }
.dot-update { border-color: #e6a23c; color: #e6a23c; }
.dot-submit { border-color: #909399; color: #909399; }
.dot-approve { border-color: #67c23a; color: #67c23a; background: #f0f9eb; }
.dot-reject { border-color: #f56c6c; color: #f56c6c; background: #fef0f0; }
.dot-comment { border-color: #9b59b6; color: #9b59b6; }
.dot-delete { border-color: #f56c6c; color: #f56c6c; }
.dot-restore { border-color: #67c23a; color: #67c23a; }
.dot-status_change { border-color: #409eff; color: #409eff; }
.dot-step_change { border-color: #e6a23c; color: #e6a23c; }

.timeline-icon {
  font-size: 16px;
}

.timeline-line {
  width: 2px;
  flex: 1;
  background: #e4e7ed;
  margin: 4px 0;
}

.timeline-content {
  flex: 1;
  background: #fafafa;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 8px;
  border: 1px solid #ebeef5;
  transition: all 0.2s;
}

.timeline-content:hover {
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.timeline-action {
  font-weight: 600;
  font-size: 14px;
  padding: 2px 10px;
  border-radius: 4px;
}

.action-create { background: #ecf5ff; color: #409eff; }
.action-update { background: #fdf6ec; color: #e6a23c; }
.action-submit { background: #f4f4f5; color: #606266; }
.action-approve { background: #f0f9eb; color: #67c23a; }
.action-reject { background: #fef0f0; color: #f56c6c; }
.action-comment { background: #f9f0ff; color: #9b59b6; }
.action-delete { background: #fef0f0; color: #f56c6c; }
.action-restore { background: #f0f9eb; color: #67c23a; }
.action-status_change { background: #ecf5ff; color: #409eff; }
.action-step_change { background: #fdf6ec; color: #e6a23c; }

.timeline-time {
  font-size: 12px;
  color: #909399;
}

.timeline-message {
  font-size: 14px;
  color: #303133;
  margin-bottom: 8px;
  line-height: 1.5;
}

.timeline-details {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #e4e7ed;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
  color: #606266;
  flex-wrap: wrap;
}

.detail-label {
  color: #909399;
  font-weight: 500;
}

.arrow {
  color: #c0c4cc;
  font-weight: bold;
}

.role-tag {
  background: #e6f7ff;
  color: #1890ff;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-draft { background: #f4f4f5; color: #909399; }
.status-pending { background: #ecf5ff; color: #409eff; }
.status-approved { background: #f0f9eb; color: #67c23a; }
.status-rejected { background: #fef0f0; color: #f56c6c; }

.detail-meta {
  margin-top: 8px;
}

.meta-details {
  font-size: 12px;
}

.meta-details summary {
  cursor: pointer;
  color: #409eff;
  outline: none;
}

.meta-details summary:hover {
  text-decoration: underline;
}

.meta-details pre {
  margin-top: 8px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 11px;
  color: #606266;
  overflow-x: auto;
  max-height: 150px;
}
</style>
