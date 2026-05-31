import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue')
  },
  {
    path: '/map',
    name: 'MapView',
    component: () => import('../views/MapView.vue')
  },
  {
    path: '/timeseries',
    name: 'TimeSeries',
    component: () => import('../views/TimeSeries.vue')
  },
  {
    path: '/compare',
    name: 'CompareSources',
    component: () => import('../views/CompareSources.vue')
  },
  {
    path: '/prediction',
    name: 'Prediction',
    component: () => import('../views/Prediction.vue')
  },
  {
    path: '/alerts',
    name: 'Alerts',
    component: () => import('../views/Alerts.vue')
  },
  {
    path: '/export',
    name: 'DataExport',
    component: () => import('../views/DataExportView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
