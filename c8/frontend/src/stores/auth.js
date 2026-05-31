import { defineStore } from 'pinia'
import api from '../api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    tenant: JSON.parse(localStorage.getItem('tenant') || 'null')
  }),

  getters: {
    isAuthenticated: (state) => !!state.token,
    userRole: (state) => state.user?.role,
    tenantName: (state) => state.tenant?.name
  },

  actions: {
    async login(email, password) {
      try {
        const response = await api.post('/api/token/', { email, password })
        this.token = response.data.access
        localStorage.setItem('token', response.data.access)

        await this.fetchUser()
        return true
      } catch (error) {
        throw error
      }
    },

    async register(userData) {
      const response = await api.post('/api/users/register/', userData)
      return response.data
    },

    async fetchUser() {
      const response = await api.get('/api/users/me/')
      this.user = response.data
      this.tenant = response.data.tenant
      localStorage.setItem('user', JSON.stringify(response.data))
      localStorage.setItem('tenant', JSON.stringify(response.data.tenant))
    },

    logout() {
      this.token = null
      this.user = null
      this.tenant = null
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('tenant')
    }
  }
})
