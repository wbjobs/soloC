<template>
  <div class="component-panel">
    <el-tabs v-model="activeTab" class="custom-tabs">
      <el-tab-pane label="基础组件" name="components">
        <div class="component-list">
          <div
            v-for="comp in basicComponents"
            :key="comp.type"
            class="component-item"
            draggable="true"
            @dragstart="handleDragStart($event, comp)"
            @dblclick="handleDoubleClick(comp.type)"
          >
            <el-icon><component :is="comp.icon" /></el-icon>
            <span>{{ comp.label }}</span>
          </div>
        </div>
        <div class="tip">
          <el-text type="info" size="small">拖拽或双击添加组件</el-text>
        </div>
      </el-tab-pane>
      
      <el-tab-pane label="组件模板" name="templates">
        <div class="template-categories">
          <div v-for="category in categories" :key="category" class="category-section">
            <div class="category-title">{{ category }}</div>
            <div class="template-list">
              <div
                v-for="template in getTemplatesByCategory(category)"
                :key="template.id"
                class="template-item"
                @click="handleTemplateClick(template)"
                :title="template.description"
              >
                <div class="template-header">
                  <el-icon class="template-icon">
                    <component :is="getIconComponent(template.icon)" />
                  </el-icon>
                  <span class="template-name">{{ template.name }}</span>
                </div>
                <div class="template-desc">{{ template.description }}</div>
                <div class="template-count">
                  {{ template.components?.length || 1 }} 个组件
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  Edit,
  Document,
  List,
  Calendar,
  Connection,
  Plus,
  Select,
  Check,
  User,
  UserFilled,
  Location,
  Postcard,
  Reading,
  OfficeBuilding,
  Wallet,
  ChatDotRound,
  ChatLineRound,
  Star,
  PictureFilled,
  PhoneFilled,
  Document as DocumentIcon,
} from '@element-plus/icons-vue';
import { componentTemplates, getTemplateCategories, getTemplatesByCategory as getTemplates } from '@/utils/componentTemplates';
import type { ComponentTemplate } from '@/types';

const emit = defineEmits<{
  (e: 'add-component', type: string): void;
  (e: 'add-template', template: ComponentTemplate): void;
}>();

const activeTab = ref('components');

const basicComponents = [
  { type: 'text', label: '文本框', icon: Edit },
  { type: 'textarea', label: '多行文本', icon: Document },
  { type: 'number', label: '数字框', icon: Plus },
  { type: 'select', label: '下拉框', icon: List },
  { type: 'radio', label: '单选框', icon: Select },
  { type: 'checkbox', label: '多选框', icon: Check },
  { type: 'date', label: '日期选择', icon: Calendar },
  { type: 'cascader', label: '级联选择', icon: Connection },
];

const iconMap: Record<string, any> = {
  User,
  UserFilled,
  Location,
  Postcard,
  Reading,
  OfficeBuilding,
  Wallet,
  ChatDotRound,
  ChatLineRound,
  Star,
  PictureFilled,
  PhoneFilled,
  Document: DocumentIcon,
  Calendar,
};

const categories = getTemplateCategories();

function getTemplatesByCategory(category: string) {
  return getTemplates(category);
}

function getIconComponent(iconName: string) {
  return iconMap[iconName] || DocumentIcon;
}

function handleDragStart(event: DragEvent, comp: typeof basicComponents[0]) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('componentType', comp.type);
    event.dataTransfer.effectAllowed = 'copy';
  }
}

function handleDoubleClick(type: string) {
  emit('add-component', type);
}

function handleTemplateClick(template: ComponentTemplate) {
  emit('add-template', template);
}
</script>

<style scoped>
.component-panel {
  width: 260px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
}

.custom-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.custom-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 10px;
  border-bottom: 1px solid #e4e7ed;
}

.custom-tabs :deep(.el-tabs__item) {
  height: 40px;
  line-height: 40px;
  font-size: 13px;
}

.custom-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
  padding: 10px;
}

.component-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.component-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.2s;
}

.component-item:hover {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}

.component-item:active {
  cursor: grabbing;
}

.component-item .el-icon {
  font-size: 20px;
}

.tip {
  text-align: center;
  margin-top: 15px;
}

.template-categories {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.category-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  padding: 5px 0;
  border-bottom: 1px dashed #e4e7ed;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.template-item {
  padding: 10px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.template-item:hover {
  background: #ecf5ff;
  border-color: #409eff;
}

.template-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.template-icon {
  font-size: 18px;
  color: #409eff;
}

.template-name {
  font-weight: 500;
  color: #303133;
  font-size: 13px;
}

.template-desc {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-count {
  font-size: 11px;
  color: #67c23a;
  background: #f0f9eb;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
}
</style>
