<template>
  <el-form-item
    :label="component.label"
    :prop="component.id"
    :required="component.required"
  >
    <!-- 文本框 -->
    <el-input
      v-if="component.type === 'text'"
      v-model="modelValue[component.id]"
      :placeholder="component.placeholder"
      :disabled="component.disabled"
    />
    
    <!-- 多行文本 -->
    <el-input
      v-else-if="component.type === 'textarea'"
      v-model="modelValue[component.id]"
      :placeholder="component.placeholder"
      type="textarea"
      :rows="4"
      :disabled="component.disabled"
    />
    
    <!-- 数字框 -->
    <el-input-number
      v-else-if="component.type === 'number'"
      v-model="modelValue[component.id]"
      :placeholder="component.placeholder"
      :disabled="component.disabled"
      style="width: 100%"
    />
    
    <!-- 下拉框 -->
    <el-select
      v-else-if="component.type === 'select'"
      v-model="modelValue[component.id]"
      :placeholder="component.placeholder"
      :disabled="component.disabled"
      style="width: 100%"
    >
      <el-option
        v-for="option in component.options"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-select>
    
    <!-- 单选框 -->
    <el-radio-group
      v-else-if="component.type === 'radio'"
      v-model="modelValue[component.id]"
      :disabled="component.disabled"
    >
      <el-radio
        v-for="option in component.options"
        :key="option.value"
        :label="option.value"
      >
        {{ option.label }}
      </el-radio>
    </el-radio-group>
    
    <!-- 多选框 -->
    <el-checkbox-group
      v-else-if="component.type === 'checkbox'"
      v-model="modelValue[component.id]"
      :disabled="component.disabled"
    >
      <el-checkbox
        v-for="option in component.options"
        :key="option.value"
        :label="option.value"
      >
        {{ option.label }}
      </el-checkbox>
    </el-checkbox-group>
    
    <!-- 日期选择 -->
    <el-date-picker
      v-else-if="component.type === 'date'"
      v-model="modelValue[component.id]"
      type="date"
      :placeholder="component.placeholder || '选择日期'"
      :disabled="component.disabled"
      value-format="YYYY-MM-DD"
      style="width: 100%"
    />
    
    <!-- 级联选择 -->
    <el-cascader
      v-else-if="component.type === 'cascader'"
      v-model="modelValue[component.id]"
      :options="component.options"
      :placeholder="component.placeholder"
      :disabled="component.disabled"
      style="width: 100%"
    />
  </el-form-item>
</template>

<script setup lang="ts">
import type { FormComponent } from '@/types';

const props = defineProps<{
  component: FormComponent;
  modelValue: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, any>): void;
}>();
</script>
