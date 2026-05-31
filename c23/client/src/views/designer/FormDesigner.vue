<template>
  <div class="designer-container">
    <div class="designer-header">
      <el-button @click="router.back()">返回</el-button>
      <el-input
        v-model="formName"
        placeholder="表单名称"
        style="width: 300px"
      />
      <el-input
        v-model="formDescription"
        placeholder="表单描述"
        style="width: 400px"
      />
      <div class="header-actions">
        <el-button type="primary" @click="saveForm" :loading="saving">
          保存
        </el-button>
      </div>
    </div>

    <div class="designer-content">
      <ComponentPanel
        @add-component="handleAddComponent"
        @add-template="handleAddTemplate"
      />
      
      <div class="canvas-area">
        <h4>设计区域（拖拽组件到此处）</h4>
        <div
          class="canvas"
          @dragover.prevent
          @drop="handleDrop"
        >
          <div
            v-for="(component, index) in components"
            :key="component.id"
            class="canvas-item"
            :class="{ active: selectedComponent?.id === component.id }"
            @click="selectComponent(index)"
            @dragover.prevent
            @drop.stop="handleReorder($event, index)"
            draggable="true"
            @dragstart="handleReorderDragStart($event, index)"
          >
            <div class="component-preview">
              <span class="component-label">{{ component.label }}</span>
              <span class="component-type" :class="component.type">
                [{{ getTypeLabel(component.type) }}]
              </span>
            </div>
            <div class="component-actions">
              <el-button
                type="primary"
                link
                size="small"
                @click.stop="moveUp(index)"
                :disabled="index === 0"
              >
                上移
              </el-button>
              <el-button
                type="primary"
                link
                size="small"
                @click.stop="moveDown(index)"
                :disabled="index === components.length - 1"
              >
                下移
              </el-button>
            </div>
          </div>
          <el-empty
            v-if="components.length === 0"
            description="从左侧拖拽组件到此处"
          />
        </div>
      </div>
      
      <ComponentConfig
        :selected-component="selectedComponent"
        :all-components="components"
        @delete="deleteSelectedComponent"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import ComponentPanel from '@/components/designer/ComponentPanel.vue';
import ComponentConfig from '@/components/designer/ComponentConfig.vue';
import { formsApi } from '@/api';
import type { FormComponent, ComponentTemplate } from '@/types';

const router = useRouter();
const route = useRoute();

const formName = ref('');
const formDescription = ref('');
const components = ref<FormComponent[]>([]);
const selectedComponent = ref<FormComponent | null>(null);
const saving = ref(false);

const editId = route.params.id as string | undefined;
let dragIndex = -1;

const typeLabels: Record<string, string> = {
  text: '文本框',
  textarea: '多行文本',
  number: '数字框',
  select: '下拉框',
  radio: '单选框',
  checkbox: '多选框',
  date: '日期',
  cascader: '级联',
};

function generateId() {
  return `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getTypeLabel(type: string) {
  return typeLabels[type] || type;
}

function createComponent(type: string): FormComponent {
  const baseComponent: FormComponent = {
    id: generateId(),
    type: type as FormComponent['type'],
    label: `未命名${typeLabels[type] || '组件'}`,
    placeholder: '',
    required: false,
    rules: [],
    defaultValue: '',
    disabled: false,
  };

  if (type === 'cascader') {
    baseComponent.options = [
      {
        label: '北京市',
        value: 'beijing',
        children: [
          { label: '海淀区', value: 'haidian' },
          { label: '朝阳区', value: 'chaoyang' },
        ],
      },
      {
        label: '上海市',
        value: 'shanghai',
        children: [
          { label: '浦东新区', value: 'pudong' },
          { label: '黄浦区', value: 'huangpu' },
        ],
      },
    ];
  } else if (['select', 'radio', 'checkbox'].includes(type)) {
    baseComponent.options = [
      { label: '选项1', value: 'option1' },
      { label: '选项2', value: 'option2' },
    ];
  }

  if (type === 'checkbox') {
    baseComponent.defaultValue = [];
  }

  if (type === 'cascader') {
    baseComponent.defaultValue = [];
  }

  return baseComponent;
}

function handleDrop(event: DragEvent) {
  if (event.dataTransfer) {
    const componentType = event.dataTransfer.getData('componentType');
    if (componentType) {
      const newComponent = createComponent(componentType);
      components.value.push(newComponent);
      selectedComponent.value = newComponent;
    }
  }
}

function handleAddComponent(type: string) {
  const newComponent = createComponent(type);
  components.value.push(newComponent);
  selectedComponent.value = newComponent;
}

function handleAddTemplate(template: ComponentTemplate) {
  if (template.components && template.components.length > 0) {
    let lastAddedComponent: FormComponent | null = null;
    template.components.forEach((templateComp) => {
      const newComponent = createComponentFromTemplate(templateComp);
      components.value.push(newComponent);
      lastAddedComponent = newComponent;
    });
    if (lastAddedComponent) {
      selectedComponent.value = lastAddedComponent;
    }
    ElMessage.success(`已添加模板"${template.name}"`);
  } else if (template.component) {
    const newComponent = createComponentFromTemplate(template.component);
    components.value.push(newComponent);
    selectedComponent.value = newComponent;
    ElMessage.success(`已添加模板"${template.name}"`);
  }
}

function createComponentFromTemplate(templateComp: Partial<FormComponent>): FormComponent {
  const baseComponent: FormComponent = {
    id: generateId(),
    type: templateComp.type || 'text',
    label: templateComp.label || '未命名组件',
    placeholder: templateComp.placeholder || '',
    required: templateComp.required || false,
    rules: templateComp.rules ? [...templateComp.rules] : [],
    options: templateComp.options ? JSON.parse(JSON.stringify(templateComp.options)) : undefined,
    defaultValue: templateComp.defaultValue !== undefined ? templateComp.defaultValue : '',
    disabled: templateComp.disabled || false,
  };

  if (baseComponent.type === 'checkbox' && !Array.isArray(baseComponent.defaultValue)) {
    baseComponent.defaultValue = [];
  }
  if (baseComponent.type === 'cascader' && !Array.isArray(baseComponent.defaultValue)) {
    baseComponent.defaultValue = [];
  }

  return baseComponent;
}

function handleReorderDragStart(_event: DragEvent, index: number) {
  dragIndex = index;
}

function handleReorder(_event: DragEvent, targetIndex: number) {
  if (dragIndex !== -1 && dragIndex !== targetIndex) {
    const item = components.value[dragIndex];
    components.value.splice(dragIndex, 1);
    components.value.splice(targetIndex, 0, item);
  }
  dragIndex = -1;
}

function selectComponent(index: number) {
  selectedComponent.value = components.value[index];
}

function moveUp(index: number) {
  if (index > 0) {
    const temp = components.value[index];
    components.value[index] = components.value[index - 1];
    components.value[index - 1] = temp;
  }
}

function moveDown(index: number) {
  if (index < components.value.length - 1) {
    const temp = components.value[index];
    components.value[index] = components.value[index + 1];
    components.value[index + 1] = temp;
  }
}

function deleteSelectedComponent() {
  if (selectedComponent.value) {
    const index = components.value.findIndex((c) => c.id === selectedComponent.value?.id);
    if (index !== -1) {
      components.value.splice(index, 1);
      selectedComponent.value = null;
    }
  }
}

async function loadForm() {
  if (editId) {
    const form: any = await formsApi.get(editId);
    formName.value = form.name;
    formDescription.value = form.description;
    components.value = form.components;
  }
}

async function saveForm() {
  if (!formName.value.trim()) {
    ElMessage.warning('请输入表单名称');
    return;
  }

  saving.value = true;
  try {
    if (editId) {
      await formsApi.update(editId, {
        name: formName.value,
        description: formDescription.value,
        components: components.value,
      });
      ElMessage.success('更新成功');
    } else {
      await formsApi.create({
        name: formName.value,
        description: formDescription.value,
        components: components.value,
      });
      ElMessage.success('创建成功');
    }
    router.push('/forms');
  } catch (error) {
    console.error(error);
  } finally {
    saving.value = false;
  }
}

onMounted(loadForm);
</script>

<style scoped>
.designer-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px);
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.designer-header {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px 20px;
  border-bottom: 1px solid #e4e7ed;
  background: #f5f7fa;
}

.header-actions {
  margin-left: auto;
}

.designer-content {
  display: flex;
  flex: 1;
  min-height: 0;
}

.canvas-area {
  flex: 1;
  padding: 15px;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.canvas-area h4 {
  margin: 0 0 10px 0;
  color: #606266;
  font-size: 13px;
  font-weight: normal;
}

.canvas {
  flex: 1;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  padding: 20px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.canvas:hover {
  border-color: #409eff;
  background: #ecf5ff;
}

.canvas-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.canvas-item:hover {
  border-color: #409eff;
}

.canvas-item.active {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.component-preview {
  display: flex;
  align-items: center;
  gap: 10px;
}

.component-label {
  font-weight: 500;
  color: #303133;
}

.component-type {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
}

.component-type.text,
.component-type.textarea {
  background: #e1f3d8;
  color: #67c23a;
}

.component-type.select,
.component-type.radio,
.component-type.checkbox,
.component-type.cascader {
  background: #fde2e2;
  color: #f56c6c;
}

.component-type.date,
.component-type.number {
  background: #ebeef5;
  color: #909399;
}

.component-actions {
  display: flex;
  gap: 5px;
}
</style>
