<template>
  <el-container class="layout-container">
    <el-header>
      <div class="header-left">
        <h2>低代码表单系统</h2>
      </div>
      <div class="header-right">
        <span class="user-info">{{ userStore.user?.username }} ({{ roleText }})</span>
        <el-button type="primary" link @click="handleLogout">退出登录</el-button>
      </div>
    </el-header>
    <el-main>
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/store';
import { UserRole } from '@/types';

const router = useRouter();
const userStore = useUserStore();

const roleText = computed(() => {
  switch (userStore.user?.role) {
    case UserRole.ADMIN:
      return '管理员';
    case UserRole.DESIGNER:
      return '设计师';
    case UserRole.VIEWER:
      return '查看者';
    default:
      return '';
  }
});

function handleLogout() {
  userStore.logout();
  router.push('/login');
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
  background: #f5f7fa;
}

.el-header {
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 20px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}

.header-left h2 {
  margin: 0;
  color: #303133;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.user-info {
  color: #606266;
  font-size: 14px;
}

.el-main {
  padding: 20px;
}
</style>
