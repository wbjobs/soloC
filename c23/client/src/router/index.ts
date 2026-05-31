import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '@/store';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/Login.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Home',
        redirect: '/forms',
      },
      {
        path: 'forms',
        name: 'Forms',
        component: () => import('@/views/admin/FormsList.vue'),
      },
      {
        path: 'forms/new',
        name: 'FormCreate',
        component: () => import('@/views/designer/FormDesigner.vue'),
        meta: { requiresDesigner: true },
      },
      {
        path: 'forms/:id/edit',
        name: 'FormEdit',
        component: () => import('@/views/designer/FormDesigner.vue'),
        meta: { requiresDesigner: true },
      },
      {
        path: 'forms/:id',
        name: 'FormView',
        component: () => import('@/views/renderer/FormRenderer.vue'),
      },
      {
        path: 'forms/:id/data',
        name: 'FormData',
        component: () => import('@/views/admin/FormData.vue'),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const userStore = useUserStore();

  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    next('/login');
  } else if (to.meta.requiresDesigner && !userStore.isDesigner) {
    next('/forms');
  } else if (to.path === '/login' && userStore.isLoggedIn) {
    next('/forms');
  } else {
    next();
  }
});

export default router;
