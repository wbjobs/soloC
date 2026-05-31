<template>
  <div class="config-panel" v-if="selectedComponent">
    <h4>组件配置</h4>
    
    <el-form label-width="80px" size="small">
      <el-form-item label="字段ID">
        <el-input v-model="selectedComponent.id" :disabled="true" />
      </el-form-item>
      
      <el-form-item label="标签">
        <el-input v-model="selectedComponent.label" placeholder="请输入标签" />
      </el-form-item>
      
      <el-form-item label="占位符">
        <el-input
          v-model="selectedComponent.placeholder"
          placeholder="请输入占位符"
        />
      </el-form-item>
      
      <el-form-item label="是否必填">
        <el-switch v-model="selectedComponent.required" />
      </el-form-item>
      
      <el-form-item label="是否禁用">
        <el-switch v-model="selectedComponent.disabled" />
      </el-form-item>
      
      <el-form-item v-if="hasOptions" label="选项配置">
        <div class="options-editor">
          <div v-if="isCascader" class="cascader-info">
            <el-alert
              title="级联选择器支持嵌套选项，请使用JSON格式配置"
              type="info"
              :closable="false"
              size="small"
            />
          </div>
          
          <div v-else>
            <div
              v-for="(option, index) in selectedComponent.options"
              :key="index"
              class="option-item"
            >
              <el-input
                v-model="option.label"
                placeholder="标签"
                size="small"
              />
              <el-input
                v-model="option.value"
                placeholder="值"
                size="small"
              />
              <el-button
                type="danger"
                link
                size="small"
                @click="removeOption(index)"
              >
                删除
              </el-button>
            </div>
            <el-button type="primary" link size="small" @click="addOption">
              + 添加选项
            </el-button>
          </div>
          
          <div v-if="isCascader" class="cascader-options">
            <div class="action-row">
              <el-button type="primary" link size="small" @click="toggleJsonEditor">
                {{ showJsonEditor ? '收起JSON编辑器' : '打开JSON编辑器' }}
              </el-button>
              <el-button type="success" link size="small" @click="loadCascaderExample">
                加载示例
              </el-button>
            </div>
            
            <div v-if="showJsonEditor">
              <el-input
                v-model="cascaderJson"
                type="textarea"
                :rows="15"
                placeholder="输入级联选项的JSON格式..."
                size="small"
                @change="updateCascaderFromJson"
              />
              <div class="json-tips">
                格式示例：
                <pre>{{ jsonExample }}</pre>
              </div>
            </div>
            
            <div v-else class="cascader-tree">
              <el-tree
                :data="selectedComponent.options"
                :props="{ label: 'label', children: 'children' }"
                node-key="value"
                default-expand-all
              >
                <template #default="{ data }">
                  <div class="tree-node">
                    <span class="node-label">{{ data.label }}</span>
                    <span class="node-value">({{ data.value }})</span>
                    <span v-if="data.children?.length" class="node-children">
                      [{{ data.children.length }}个子项]
                    </span>
                  </div>
                </template>
              </el-tree>
            </div>
          </div>
        </div>
      </el-form-item>
      
      <el-form-item label="校验规则">
        <div class="rules-editor">
          <div
            v-for="(rule, index) in selectedComponent.rules"
            :key="index"
            class="rule-item"
          >
            <el-select v-model="rule.type" placeholder="规则类型" size="small">
              <el-option label="必填" value="required" />
              <el-option label="最小长度" value="min" />
              <el-option label="最大长度" value="max" />
              <el-option label="正则" value="pattern" />
              <el-option label="邮箱" value="email" />
            </el-select>
            <el-input
              v-if="rule.type === 'min' || rule.type === 'max'"
              v-model.number="rule.value"
              placeholder="值"
              size="small"
              type="number"
            />
            <el-input
              v-else-if="rule.type === 'pattern'"
              v-model="rule.value"
              placeholder="正则表达式"
              size="small"
            />
            <el-input
              v-model="rule.message"
              placeholder="错误提示"
              size="small"
            />
            <el-button
              type="danger"
              link
              size="small"
              @click="removeRule(index)"
            >
              删除
            </el-button>
          </div>
          <el-button type="primary" link size="small" @click="addRule">
            + 添加规则
          </el-button>
        </div>
      </el-form-item>
      
      <el-form-item label="默认值">
        <el-input
          v-model="selectedComponent.defaultValue"
          placeholder="默认值"
        />
      </el-form-item>
      
      <el-form-item label="条件渲染">
        <el-switch v-model="conditionalEnabled" @change="handleConditionalEnabledChange" />
      </el-form-item>
      
      <template v-if="conditionalEnabled">
        <el-divider />
        <div class="conditional-config">
          <div class="config-header">
            <span class="config-title">显示条件配置</span>
            <el-select v-model="conditionalAction" size="small" style="width: 120px">
              <el-option label="满足时显示" value="show" />
              <el-option label="满足时隐藏" value="hide" />
            </el-select>
          </div>
          
          <div class="logic-selector">
            <el-radio-group v-model="conditionalLogic" size="small">
              <el-radio-button value="and">全部满足</el-radio-button>
              <el-radio-button value="or">任意满足</el-radio-button>
            </el-radio-group>
          </div>
          
          <div class="conditions-list">
            <div
              v-for="(condition, index) in conditionalConditions"
              :key="index"
              class="condition-item"
            >
              <el-select
                v-model="condition.fieldId"
                placeholder="选择字段"
                size="small"
                style="width: 100px"
              >
                <el-option
                  v-for="comp in availableFields"
                  :key="comp.id"
                  :label="comp.label"
                  :value="comp.id"
                />
              </el-select>
              
              <el-select
                v-model="condition.operator"
                placeholder="操作符"
                size="small"
                style="width: 80px"
              >
                <el-option label="等于" value="==" />
                <el-option label="不等于" value="!=" />
                <el-option label="大于" value=">" />
                <el-option label="小于" value="<" />
                <el-option label="大于等于" value=">=" />
                <el-option label="小于等于" value="<=" />
                <el-option label="包含" value="contains" />
                <el-option label="在范围内" value="in" />
              </el-select>
              
              <el-input
                v-model="condition.value"
                placeholder="值"
                size="small"
                style="width: 60px"
              />
              
              <el-button
                type="danger"
                link
                size="small"
                @click="removeCondition(index)"
              >
                删除
              </el-button>
            </div>
            
            <el-button type="primary" link size="small" @click="addCondition">
              + 添加条件
            </el-button>
          </div>
        </div>
      </template>
    </el-form>
    
    <el-divider />
    
    <el-button
      type="danger"
      size="small"
      @click="$emit('delete')"
      style="width: 100%"
    >
      删除此组件
    </el-button>
  </div>
  
  <div v-else class="config-panel empty">
    <el-empty description="选择一个组件进行配置" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FormComponent, ComponentOption, ConditionItem } from '@/types';
import { ElMessage } from 'element-plus';

const props = defineProps<{
  selectedComponent: FormComponent | null;
  allComponents?: FormComponent[];
}>();

const emit = defineEmits<{
  (e: 'delete'): void;
}>();

const hasOptions = computed(() => {
  return (
    props.selectedComponent &&
    ['select', 'radio', 'checkbox', 'cascader'].includes(
      props.selectedComponent.type,
    )
  );
});

const isCascader = computed(() => {
  return props.selectedComponent?.type === 'cascader';
});

const availableFields = computed(() => {
  if (!props.allComponents || !props.selectedComponent) return [];
  return props.allComponents.filter(c => c.id !== props.selectedComponent!.id);
});

const showJsonEditor = ref(false);
const cascaderJson = ref('');

const conditionalEnabled = ref(false);
const conditionalAction = ref<'show' | 'hide'>('show');
const conditionalLogic = ref<'and' | 'or'>('and');
const conditionalConditions = ref<ConditionItem[]>([]);

const jsonExample = `[
  {
    "label": "北京市",
    "value": "beijing",
    "children": [
      {
        "label": "海淀区",
        "value": "haidian"
      },
      {
        "label": "朝阳区",
        "value": "chaoyang"
      }
    ]
  }
]`;

watch(
  () => props.selectedComponent,
  (newVal) => {
    if (newVal?.type === 'cascader' && newVal.options) {
      cascaderJson.value = JSON.stringify(newVal.options, null, 2);
    }
    
    if (newVal?.conditionalRender) {
      conditionalEnabled.value = newVal.conditionalRender.enabled;
      conditionalAction.value = newVal.conditionalRender.action || 'show';
      conditionalLogic.value = newVal.conditionalRender.logic || 'and';
      conditionalConditions.value = [...(newVal.conditionalRender.conditions || [])];
    } else {
      conditionalEnabled.value = false;
      conditionalAction.value = 'show';
      conditionalLogic.value = 'and';
      conditionalConditions.value = [];
    }
  },
  { immediate: true },
);

function addOption() {
  if (props.selectedComponent) {
    if (!props.selectedComponent.options) {
      props.selectedComponent.options = [];
    }
    props.selectedComponent.options.push({
      label: '',
      value: '',
    });
  }
}

function removeOption(index: number) {
  if (props.selectedComponent?.options) {
    props.selectedComponent.options.splice(index, 1);
  }
}

function addRule() {
  if (props.selectedComponent) {
    if (!props.selectedComponent.rules) {
      props.selectedComponent.rules = [];
    }
    props.selectedComponent.rules.push({
      type: 'required',
      message: '',
    });
  }
}

function removeRule(index: number) {
  if (props.selectedComponent?.rules) {
    props.selectedComponent.rules.splice(index, 1);
  }
}

function toggleJsonEditor() {
  showJsonEditor.value = !showJsonEditor.value;
  if (showJsonEditor.value && props.selectedComponent?.options) {
    cascaderJson.value = JSON.stringify(props.selectedComponent.options, null, 2);
  }
}

function updateCascaderFromJson() {
  if (!props.selectedComponent || !cascaderJson.value.trim()) return;
  
  try {
    const parsed = JSON.parse(cascaderJson.value);
    if (Array.isArray(parsed)) {
      props.selectedComponent.options = parsed as ComponentOption[];
      ElMessage.success('级联选项已更新');
    } else {
      ElMessage.error('JSON格式错误：必须是数组格式');
    }
  } catch (e) {
    ElMessage.error('JSON解析失败：请检查格式');
  }
}

function loadCascaderExample() {
  const example: ComponentOption[] = [
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
    {
      label: '广东省',
      value: 'guangdong',
      children: [
        {
          label: '广州市',
          value: 'guangzhou',
          children: [
            { label: '天河区', value: 'tianhe' },
            { label: '越秀区', value: 'yuexiu' },
          ],
        },
        {
          label: '深圳市',
          value: 'shenzhen',
          children: [
            { label: '南山区', value: 'nanshan' },
            { label: '福田区', value: 'futian' },
          ],
        },
      ],
    },
  ];
  
  if (props.selectedComponent) {
    props.selectedComponent.options = example;
    cascaderJson.value = JSON.stringify(example, null, 2);
    ElMessage.success('示例数据已加载');
  }
}

function handleConditionalEnabledChange(enabled: boolean) {
  if (props.selectedComponent) {
    if (enabled) {
      props.selectedComponent.conditionalRender = {
        enabled: true,
        action: conditionalAction.value,
        logic: conditionalLogic.value,
        conditions: conditionalConditions.value.length > 0 
          ? conditionalConditions.value 
          : [],
      };
    } else {
      props.selectedComponent.conditionalRender = undefined;
    }
  }
}

function updateConditionalRender() {
  if (props.selectedComponent && conditionalEnabled.value) {
    props.selectedComponent.conditionalRender = {
      enabled: true,
      action: conditionalAction.value,
      logic: conditionalLogic.value,
      conditions: [...conditionalConditions.value],
    };
  }
}

function addCondition() {
  conditionalConditions.value.push({
    fieldId: '',
    operator: '==',
    value: '',
  });
  updateConditionalRender();
}

function removeCondition(index: number) {
  conditionalConditions.value.splice(index, 1);
  updateConditionalRender();
}

watch(
  () => [conditionalAction.value, conditionalLogic.value, conditionalConditions.value],
  () => {
    updateConditionalRender();
  },
  { deep: true },
);
</script>

<style scoped>
.config-panel {
  width: 300px;
  background: #fff;
  border-left: 1px solid #e4e7ed;
  padding: 15px;
  overflow-y: auto;
}

.config-panel h4 {
  margin: 0 0 15px 0;
  color: #303133;
  font-size: 14px;
}

.options-editor,
.rules-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-item,
.rule-item {
  display: flex;
  gap: 5px;
  align-items: center;
}

.option-item .el-input,
.rule-item .el-input,
.rule-item .el-select {
  flex: 1;
  min-width: 0;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.cascader-info {
  margin-bottom: 10px;
}

.cascader-options {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #dcdfe6;
}

.action-row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.json-tips {
  margin-top: 10px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
  color: #909399;
}

.json-tips pre {
  margin: 5px 0 0 0;
  white-space: pre-wrap;
  word-break: break-all;
  background: #fff;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
  font-size: 11px;
}

.cascader-tree {
  max-height: 300px;
  overflow-y: auto;
  background: #f5f7fa;
  padding: 10px;
  border-radius: 4px;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-label {
  font-weight: 500;
  color: #303133;
}

.node-value {
  color: #909399;
  font-size: 12px;
}

.node-children {
  color: #409eff;
  font-size: 12px;
}

.conditional-config {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  margin: 0 0 15px 0;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.config-title {
  font-weight: 500;
  color: #303133;
  font-size: 13px;
}

.logic-selector {
  margin-bottom: 10px;
}

.conditions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.condition-item {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: wrap;
}

.condition-item .el-input,
.condition-item .el-select {
  min-width: 0;
}
</style>
