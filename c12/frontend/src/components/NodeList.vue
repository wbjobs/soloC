<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { useNodeStore } from '@/stores/node'
import type { NodeInfo } from '@/types'

const nodeStore = useNodeStore()

function getStatusColor(status: string): string {
  switch (status) {
    case 'ONLINE': return '#67c23a'
    case 'SYNCING': return '#e6a23c'
    case 'OFFLINE': return '#f56c6c'
    case 'ERROR': return '#f56c6c'
    default: return '#909399'
  }
}

function getNodeTypeIcon(type: string): string {
  switch (type) {
    case 'ETHEREUM': return '🔷'
    case 'BITCOIN': return '🟠'
    default: return '📦'
  }
}

function formatNumber(num: number): string {
  if (!num) return '0'
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K'
  }
  return num.toString()
}

async function handleRemove(node: NodeInfo) {
  try {
    await ElMessageBox.confirm(
      `Are you sure you want to remove node "${node.name}"?`,
      'Remove Node',
      {
        confirmButtonText: 'Remove',
        cancelButtonText: 'Cancel',
        type: 'warning'
      }
    )

    const success = await nodeStore.removeNode(node.id)
    if (success) {
      ElMessage.success('Node removed successfully')
    } else {
      ElMessage.error('Failed to remove node')
    }
  } catch {
    // User cancelled
  }
}
</script>

<template>
  <div class="node-list">
    <h3 class="section-title">Connected Nodes</h3>
    
    <el-table 
      :data="nodeStore.nodes" 
      v-loading="nodeStore.loading"
      style="width: 100%; background: transparent;"
      :empty-text="nodeStore.error || 'No nodes connected'"
    >
      <el-table-column label="Node" min-width="200">
        <template #default="{ row }">
          <div class="node-info">
            <span class="node-icon">{{ getNodeTypeIcon(row.type) }}</span>
            <div>
              <div class="node-name">{{ row.name }}</div>
              <div class="node-endpoint">{{ row.endpoint }}</div>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="Status" width="120">
        <template #default="{ row }">
          <el-tag 
            :type="row.status === 'ONLINE' ? 'success' : row.status === 'SYNCING' ? 'warning' : 'danger'"
            size="small"
          >
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="Block Height" width="150">
        <template #default="{ row }">
          <span class="metric-value">{{ formatNumber(row.block_height) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="Tx Rate (tps)" width="130">
        <template #default="{ row }">
          <span class="metric-value">{{ row.tx_rate?.toFixed(2) || '0.00' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="Peers" width="80">
        <template #default="{ row }">
          <span class="metric-value">{{ row.peer_count || 0 }}</span>
        </template>
      </el-table-column>

      <el-table-column label="Latency" width="100">
        <template #default="{ row }">
          <span class="metric-value">{{ row.latency_ms?.toFixed(0) || 0 }}ms</span>
        </template>
      </el-table-column>

      <el-table-column label="Actions" width="100" fixed="right">
        <template #default="{ row }">
          <el-button 
            type="danger" 
            size="small" 
            link
            @click="handleRemove(row)"
          >
            Remove
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.node-list {
  color: #fff;
}

.section-title {
  margin: 0 0 20px 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 18px;
}

:deep(.el-table) {
  background: transparent;
}

:deep(.el-table th.el-table__cell) {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

:deep(.el-table tr.el-table__row:hover > td) {
  background: rgba(255, 255, 255, 0.05);
}

:deep(.el-table td.el-table__cell) {
  background: transparent;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.node-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.node-icon {
  font-size: 28px;
}

.node-name {
  font-weight: 600;
  color: #fff;
}

.node-endpoint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.metric-value {
  font-family: 'Monaco', monospace;
  color: rgba(255, 255, 255, 0.9);
}

:deep(.el-table__empty-text) {
  color: rgba(255, 255, 255, 0.5);
}
</style>
