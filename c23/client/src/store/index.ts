import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '@/api';
import type { User } from '@/types';
import { UserRole } from '@/types';

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const user = ref<User | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null,
  );

  const isLoggedIn = computed(() => !!token.value);
  const isAdmin = computed(() => user.value?.role === UserRole.ADMIN);
  const isDesigner = computed(
    () => user.value?.role === UserRole.ADMIN || user.value?.role === UserRole.DESIGNER,
  );

  async function login(username: string, password: string) {
    const response: any = await authApi.login(username, password);
    token.value = response.access_token;
    user.value = response.user;
    localStorage.setItem('token', response.access_token);
    localStorage.setItem('user', JSON.stringify(response.user));
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  return { token, user, isLoggedIn, isAdmin, isDesigner, login, logout };
});
