<template>
  <div class="forms-container">
    <div class="page-header">
      <h3>表单列表</h3>
      <el-button
        v-if="userStore.isDesigner"
        type="primary"
        @click="router.push('/forms/new')"
      >
        <el-icon><Plus /></el-icon>
        新建表单
      </el-button>
    </div>

    <el-table :data="forms" v-loading="loading" style="width: 100%">
      <el-table-column prop="name" label="表单名称" width="200" />
      <el-table-column prop="description" label="描述" />
      <el-table-column prop="createdBy.username" label="创建者" width="120" />
      <el-table-column prop="createdAt" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="300" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="viewForm(row)">
            查看/提交
          </el-button>
          <el-button type="success" link @click="viewData(row)">
            数据管理
          </el-button>
          <el-button
            v-if="userStore.isDesigner"
            type="warning"
            link
            @click="editForm(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="userStore.isDesigner"
            type="danger"
            link
            @click="deleteForm(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useUserStore } from '@/store';
import { formsApi } from '@/api';
import type { Form } from '@/types';

const router = useRouter();
const userStore = useUserStore();

const forms = ref<Form[]>([]);
const loading = ref(false);

async function loadForms() {
  loading.value = true;
  try {
    const data: any = await formsApi.list();
    forms.value = data;
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}

function viewForm(form: Form) {
  router.push(`/forms/${form._id}`);
}

function viewData(form: Form) {
  router.push(`/forms/${form._id}/data`);
}

function editForm(form: Form) {
  router.push(`/forms/${form._id}/edit`);
}

async function deleteForm(form: Form) {
  try {
    await ElMessageBox.confirm('确定要删除此表单吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await formsApi.delete(form._id);
    ElMessage.success('删除成功');
    loadForms();
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error(error);
    }
  }
}

onMounted(loadForms);
</script>

<style scoped>
.forms-container {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h3 {
  margin: 0;
}
</style>
