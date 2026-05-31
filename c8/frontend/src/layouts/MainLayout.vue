<template>
  <div>
    <nav class="navbar">
      <div class="navbar-brand">📋 文档审批系统</div>
      <div class="navbar-nav">
        <router-link to="/">仪表盘</router-link>
        <router-link to="/documents">文档列表</router-link>
        <router-link to="/kanban">审批看板</router-link>
      </div>
      <div class="user-info">
        <span>{{ authStore.user?.first_name || authStore.user?.email }}</span>
        <span class="role-badge">{{ roleLabel }}</span>
        <span class="tag tag-info">{{ authStore.tenantName }}</span>
        <button class="btn btn-default" @click="handleLogout">退出</button>
      </div>
    </nav>
    <router-view />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const roleMap = {
  employee: '员工',
  manager: '直线经理',
  director: '部门主管'
}

const roleLabel = computed(() => roleMap[authStore.userRole] || authStore.userRole)

const handleLogout = () => {
  authStore.logout()
  router.push({ name: 'Login' })
}
</script>
