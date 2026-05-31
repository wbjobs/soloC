<template>
  <div class="workflow-container">
    <div class="workflow-flow">
      <template v-for="(step, index) in processedSteps" :key="`step-${step.step}`">
        <WorkflowStepNode
          :step="step.step"
          :role="step.role"
          :role-label="step.roleLabel"
          :status="step.status"
          :approver-name="step.approverName"
          :config="step.config"
        />
        <WorkflowConnector
          v-if="index < processedSteps.length - 1"
          :status="step.status"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import WorkflowStepNode from './WorkflowStepNode.vue'
import WorkflowConnector from './WorkflowConnector.vue'

const props = defineProps({
  workflowConfig: {
    type: Array,
    required: true,
    default: () => []
  },
  approvals: {
    type: Array,
    default: () => []
  },
  documentStatus: {
    type: String,
    default: 'draft'
  },
  currentStep: {
    type: Number,
    default: 0
  }
})

const roleMap = {
  employee: '员工',
  manager: '直线经理',
  director: '部门主管'
}

const processedSteps = computed(() => {
  if (!props.workflowConfig || props.workflowConfig.length === 0) {
    return []
  }

  const sortedConfig = [...props.workflowConfig].sort((a, b) => a.step - b.step)

  return sortedConfig.map(stepConfig => {
    const approval = props.approvals?.find(a => a.step === stepConfig.step)
    let status = 'pending'

    if (approval) {
      status = approval.status
    }

    if (props.documentStatus === 'pending' && props.currentStep === stepConfig.step) {
      status = 'current'
    } else if (props.documentStatus === 'approved') {
      status = 'approved'
    } else if (props.documentStatus === 'rejected') {
      if (approval && approval.status === 'rejected') {
        status = 'rejected'
      }
    }

    return {
      step: stepConfig.step,
      role: stepConfig.role,
      roleLabel: roleMap[stepConfig.role] || stepConfig.role,
      approverName: approval?.approver?.first_name || approval?.approver?.email || '待分配',
      status,
      config: stepConfig
    }
  })
})
</script>

<style scoped>
.workflow-container {
  padding: 20px 0;
}

.workflow-flow {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  flex-wrap: wrap;
}
</style>
