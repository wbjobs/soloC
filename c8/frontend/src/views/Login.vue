<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">文档审批系统</h1>
      <p class="login-subtitle">多租户工作流管理平台</p>

      <div v-if="isLogin">
        <div class="form-group">
          <label class="form-label">邮箱</label>
          <input 
            type="email" 
            class="form-input" 
            v-model="loginForm.email"
            placeholder="请输入邮箱"
          />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input 
            type="password" 
            class="form-input" 
            v-model="loginForm.password"
            placeholder="请输入密码"
          />
        </div>
        <div v-if="error" class="error-message">{{ error }}</div>
        <button 
          class="btn btn-primary login-btn" 
          @click="handleLogin"
          :disabled="loading"
        >
          {{ loading ? '登录中...' : '登录' }}
        </button>

        <div class="login-switch">
          还没有账号？<a @click="isLogin = false">立即注册</a>
        </div>

        <div style="margin-top: 20px; padding: 12px; background: #f4f5f7; border-radius: 6px;">
          <p style="font-size: 12px; color: #909399; margin-bottom: 8px;">测试账号：</p>
          <p style="font-size: 12px; color: #606266;">employee@acme.com / password123</p>
          <p style="font-size: 12px; color: #606266;">manager@acme.com / password123</p>
          <p style="font-size: 12px; color: #606266;">director@acme.com / password123</p>
        </div>
      </div>

      <div v-else>
        <div class="form-group">
          <label class="form-label">邮箱</label>
          <input 
            type="email" 
            class="form-input" 
            v-model="registerForm.email"
            placeholder="请输入邮箱"
          />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input 
            type="password" 
            class="form-input" 
            v-model="registerForm.password"
            placeholder="请输入密码"
          />
        </div>
        <div class="form-group">
          <label class="form-label">姓名</label>
          <input 
            type="text" 
            class="form-input" 
            v-model="registerForm.first_name"
            placeholder="请输入名字"
          />
        </div>
        <div class="form-group">
          <label class="form-label">租户名称</label>
          <input 
            type="text" 
            class="form-input" 
            v-model="registerForm.tenant_name"
            placeholder="公司/组织名称"
          />
        </div>
        <div class="form-group">
          <label class="form-label">租户标识</label>
          <input 
            type="text" 
            class="form-input" 
            v-model="registerForm.tenant_slug"
            placeholder="英文简称，如: acme"
          />
        </div>
        <div v-if="registerError" class="error-message">{{ registerError }}</div>
        <div v-if="registerSuccess" class="success-message">注册成功！请使用邮箱登录</div>
        <button 
          class="btn btn-primary login-btn" 
          @click="handleRegister"
          :disabled="registering"
        >
          {{ registering ? '注册中...' : '注册' }}
        </button>
        <div class="login-switch">
          已有账号？<a @click="isLogin = true">去登录</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isLogin = computed(() => route.name === 'Login')

const loginForm = ref({
  email: '',
  password: ''
})
const registerForm = ref({
  email: '',
  password: '',
  first_name: '',
  last_name: '',
  role: 'employee',
  tenant_name: '',
  tenant_slug: ''
})

const error = ref('')
const registerError = ref('')
const registerSuccess = ref(false)
const loading = ref(false)
const registering = ref(false)

const handleLogin = async () => {
  error.value = ''
  loading.value = true
  try {
    await authStore.login(loginForm.value.email, loginForm.value.password)
    router.push({ name: 'Dashboard' })
  } catch (e) {
    error.value = '登录失败，请检查邮箱和密码'
  } finally {
    loading.value = false
  }
}

const handleRegister = async () => {
  registerError.value = ''
  registerSuccess.value = false
  registering.value = true
  try {
    await authStore.register(registerForm.value)
    registerSuccess.value = true
    setTimeout(() => {
      isLogin.value = true
      loginForm.value.email = registerForm.value.email
    }, 1500)
  } catch (e) {
    registerError.value = e.response?.data?.detail || '注册失败'
  } finally {
    registering.value = false
  }
}
</script>
