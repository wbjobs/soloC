<template>
  <el-form
    ref="formRef"
    :model="formData"
    :rules="rules"
    label-width="120px"
  >
    <DynamicFormItem
      v-for="component in visibleComponents"
      :key="component.id"
      :component="component"
      v-model="formData"
    />
  </el-form>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { FormComponent, ValidationRule, ConditionalRule, ConditionItem } from '@/types';
import DynamicFormItem from './DynamicFormItem.vue';

const props = defineProps<{
  components: FormComponent[];
  initialData?: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: 'update:formData', data: Record<string, any>): void;
}>();

const formRef = ref();
const formData = ref<Record<string, any>>({});

function evaluateCondition(fieldValue: any, operator: string, conditionValue: any): boolean {
  switch (operator) {
    case '==':
      return fieldValue == conditionValue;
    case '!=':
      return fieldValue != conditionValue;
    case '>':
      return Number(fieldValue) > Number(conditionValue);
    case '<':
      return Number(fieldValue) < Number(conditionValue);
    case '>=':
      return Number(fieldValue) >= Number(conditionValue);
    case '<=':
      return Number(fieldValue) <= Number(conditionValue);
    case 'contains':
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(conditionValue);
      }
      if (typeof fieldValue === 'string') {
        return fieldValue.includes(String(conditionValue));
      }
      return false;
    case 'in':
      if (Array.isArray(conditionValue)) {
        if (Array.isArray(fieldValue)) {
          return fieldValue.some(v => conditionValue.includes(v));
        }
        return conditionValue.includes(fieldValue);
      }
      return false;
    default:
      return true;
  }
}

function shouldShowComponent(component: FormComponent): boolean {
  if (!component.conditionalRender || !component.conditionalRender.enabled) {
    return true;
  }

  const rule = component.conditionalRender;
  const conditions = rule.conditions || [];
  
  if (conditions.length === 0) {
    return rule.action === 'show';
  }

  const conditionResults = conditions.map((condition: ConditionItem) => {
    const fieldValue = formData.value[condition.fieldId];
    return evaluateCondition(fieldValue, condition.operator, condition.value);
  });

  let conditionMet: boolean;
  if (rule.logic === 'and') {
    conditionMet = conditionResults.every(r => r);
  } else {
    conditionMet = conditionResults.some(r => r);
  }

  if (rule.action === 'show') {
    return conditionMet;
  } else {
    return !conditionMet;
  }
}

const visibleComponents = computed(() => {
  return props.components.filter(component => shouldShowComponent(component));
});

const visibleComponentIds = computed(() => {
  return new Set(visibleComponents.value.map(c => c.id));
});

const rules = computed(() => {
  const result: Record<string, any[]> = {};
  
  props.components.forEach((component) => {
    if (!visibleComponentIds.value.has(component.id)) {
      return;
    }
    
    const ruleList: any[] = [];
    
    if (component.required) {
      ruleList.push({
        required: true,
        message: `${component.label}不能为空`,
        trigger: 'blur',
      });
    }
    
    if (component.rules) {
      component.rules.forEach((rule: ValidationRule) => {
        switch (rule.type) {
          case 'min':
            ruleList.push({
              min: rule.value,
              message: rule.message || `最小长度为${rule.value}`,
              trigger: 'blur',
            });
            break;
          case 'max':
            ruleList.push({
              max: rule.value,
              message: rule.message || `最大长度为${rule.value}`,
              trigger: 'blur',
            });
            break;
          case 'pattern':
            ruleList.push({
              pattern: new RegExp(rule.value),
              message: rule.message || '格式不正确',
              trigger: 'blur',
            });
            break;
          case 'email':
            ruleList.push({
              type: 'email',
              message: rule.message || '请输入正确的邮箱地址',
              trigger: 'blur',
            });
            break;
        }
      });
    }
    
    if (ruleList.length > 0) {
      result[component.id] = ruleList;
    }
  });
  
  return result;
});

function normalizeValue(value: any, type: string): any {
  if (value === null || value === undefined) {
    if (type === 'checkbox' || type === 'cascader') {
      return [];
    }
    return '';
  }
  
  if (type === 'checkbox' || type === 'cascader') {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        return [value];
      }
    }
    return [];
  }
  
  if (type === 'date') {
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
      }
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      } catch {
      }
    }
    return '';
  }
  
  if (type === 'number') {
    const num = Number(value);
    return isNaN(num) ? '' : num;
  }
  
  return value;
}

function initializeFormData() {
  props.components.forEach((component) => {
    if (props.initialData && props.initialData[component.id] !== undefined) {
      formData.value[component.id] = normalizeValue(
        props.initialData[component.id],
        component.type,
      );
    } else if (component.defaultValue !== undefined) {
      formData.value[component.id] = normalizeValue(
        component.defaultValue,
        component.type,
      );
    } else if (component.type === 'checkbox' || component.type === 'cascader') {
      formData.value[component.id] = [];
    } else {
      formData.value[component.id] = '';
    }
  });
}

watch(
  () => props.components,
  () => {
    initializeFormData();
  },
  { deep: true },
);

watch(
  formData,
  (val) => {
    emit('update:formData', { ...val });
  },
  { deep: true },
);

async function validate(): Promise<boolean> {
  if (!formRef.value) return true;
  try {
    await formRef.value.validate();
    return true;
  } catch {
    return false;
  }
}

function sanitizeFormData(): Record<string, any> {
  const result: Record<string, any> = {};
  
  props.components.forEach((component) => {
    const value = formData.value[component.id];
    
    if (value === null || value === undefined || value === '') {
      result[component.id] = null;
      return;
    }
    
    if (component.type === 'checkbox' || component.type === 'cascader') {
      if (Array.isArray(value)) {
        result[component.id] = value.length > 0 ? value : null;
      } else {
        result[component.id] = null;
      }
    } else if (component.type === 'date') {
      if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        result[component.id] = `${year}-${month}-${day}`;
      } else if (typeof value === 'string' && value.trim()) {
        result[component.id] = value;
      } else {
        result[component.id] = null;
      }
    } else if (component.type === 'number') {
      const num = Number(value);
      result[component.id] = isNaN(num) ? null : num;
    } else {
      result[component.id] = value;
    }
  });
  
  return result;
}

function getFormData(): Record<string, any> {
  return sanitizeFormData();
}

function resetForm() {
  initializeFormData();
}

defineExpose({
  validate,
  getFormData,
  resetForm,
  formRef,
});

onMounted(initializeFormData);
</script>
