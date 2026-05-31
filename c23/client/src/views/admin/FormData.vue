<template>
  <div class="data-container">
    <div class="page-header">
      <el-button @click="router.back()">返回</el-button>
      <h3>{{ form?.name }} - 提交数据</h3>
      <div>
        <el-button type="primary" @click="exportData" :loading="exporting">
          <el-icon><Download /></el-icon>
          导出Excel
        </el-button>
      </div>
    </div>

    <el-table :data="submissions" v-loading="loading" style="width: 100%">
      <el-table-column label="提交时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="提交人" width="150">
        <template #default="{ row }">
          {{ row.submittedBy?.username || '匿名' }}
        </template>
      </el-table-column>
      <el-table-column
        v-for="component in form?.components || []"
        :key="component.id"
        :prop="component.id"
        :label="component.label"
      >
        <template #default="{ row }">
          {{ formatValue(row.data[component.id]) }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { formsApi, submissionsApi } from '@/api';
import type { Form, Submission } from '@/types';

const router = useRouter();
const route = useRoute();

const form = ref<Form | null>(null);
const submissions = ref<Submission[]>([]);
const loading = ref(false);
const exporting = ref(false);

const formId = route.params.id as string;

async function loadForm() {
  try {
    const data: any = await formsApi.get(formId);
    form.value = data;
  } catch (error) {
    console.error(error);
  }
}

async function loadSubmissions() {
  loading.value = true;
  try {
    const data: any = await submissionsApi.list(formId);
    submissions.value = data;
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}

function formatValue(value: any) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

async function exportData() {
  exporting.value = true;
  try {
    const blob: any = await submissionsApi.export(formId);
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${form.value?.name}-数据.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    ElMessage.success('导出成功');
  } catch (error) {
    console.error(error);
  } finally {
    exporting.value = false;
  }
}

onMounted(() => {
  loadForm();
  loadSubmissions();
});
</script>

<style scoped>
.data-container {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 20px;
}

.page-header h3 {
  margin: 0;
  flex: 1;
  text-align: center;
}
</style>
