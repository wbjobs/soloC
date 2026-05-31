import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Caller from '../views/Caller.vue'
import Callee from '../views/Callee.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/caller',
    name: 'Caller',
    component: Caller
  },
  {
    path: '/callee',
    name: 'Callee',
    component: Callee
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
