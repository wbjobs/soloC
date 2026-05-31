<template>
  <div class="renderer-container">
    <div class="form-header">
      <el-button @click="router.back()">返回</el-button>
      <h3>{{ form?.name }}</h3>
      <div></div>
    </div>

    <div class="form-content" v-loading="loading">
      <p v-if="form?.description" class="form-description">
        {{ form.description }}
      </p>

      <DynamicForm
        v-if="form"
        ref="dynamicFormRef"
        :components="form.components"
      />

      <div class="form-actions">
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          提交
        </el-button>
        <el-button @click="handleReset">重置</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import DynamicForm from '@/components/renderer/DynamicForm.vue';
import { formsApi, submissionsApi } from '@/api';
import type { Form } from '@/types';

const router = useRouter();
const route = useRoute();

const form = ref<Form | null>(null);
const loading = ref(false);
const submitting = ref(false);
const dynamicFormRef = ref();

const formId = route.params.id as string;

async function loadForm() {
  loading.value = true;
  try {
    const data: any = await formsApi.get(formId);
    form.value = data;
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  if (!dynamicFormRef.value) return;

  const valid = await dynamicFormRef.value.validate();
  if (!valid) {
    ElMessage.warning('请检查表单错误');
    return;
  }

  const formData = dynamicFormRef.value.getFormData();
  submitting.value = true;
  try {
    await submissionsApi.create(formId, formData);
    ElMessage.success('提交成功');
    router.back();
  } catch (error) {
    console.error(error);
  } finally {
    submitting.value = false;
  }
}

function handleReset() {
  if (dynamicFormRef.value) {
    dynamicFormRef.value.resetForm();
  }
}

onMounted(loadForm);
</script>

<style scoped>
.renderer-container {
  max-width: 800px;
  margin: 0 auto;
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e4e7ed;
}

.form-header h3 {
  margin: 0;
}

.form-content {
  padding: 20px 0;
}

.form-description {
  color: #606266;
  margin-bottom: 20px;
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
}

.form-actions {
  margin-top: 30px;
  display: flex;
  justify-content: center;
  gap: 15px;
  padding-top: 20px;
  border-top: 1px solid #e4e7ed;
}
</style>
