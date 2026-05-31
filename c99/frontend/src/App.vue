<template>
  <div id="app">
    <el-container class="layout-container">
      <el-header class="header">
        <div class="header-content">
          <h1 class="title">多源气象数据融合分析平台</h1>
          <div class="header-info">
            <span class="subtitle">Weather Data Fusion & Analysis Platform</span>
          </div>
        </div>
      </el-header>
      <el-container>
        <el-aside width="200px" class="aside">
          <el-menu
            :default-active="activeMenu"
            class="sidebar-menu"
            router
            background-color="#001529"
            text-color="#fff"
            active-text-color="#409EFF"
          >
            <el-menu-item index="/">
              <el-icon><HomeFilled /></el-icon>
              <span>数据总览</span>
            </el-menu-item>
            <el-menu-item index="/map">
              <el-icon><Location /></el-icon>
              <span>地图展示</span>
            </el-menu-item>
            <el-menu-item index="/timeseries">
              <el-icon><TrendCharts /></el-icon>
              <span>时间序列</span>
            </el-menu-item>
            <el-menu-item index="/compare">
              <el-icon><DataAnalysis /></el-icon>
              <span>数据源对比</span>
            </el-menu-item>
            <el-menu-item index="/prediction">
              <el-icon><MagicStick /></el-icon>
              <span>趋势预测</span>
            </el-menu-item>
            <el-menu-item index="/alerts">
              <el-icon><Warning /></el-icon>
              <span>极端天气告警</span>
            </el-menu-item>
            <el-menu-item index="/export">
              <el-icon><Download /></el-icon>
              <span>数据导出</span>
            </el-menu-item>
          </el-menu>
        </el-aside>
        <el-main class="main-content">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  HomeFilled,
  Location,
  TrendCharts,
  DataAnalysis,
  MagicStick,
  Warning,
  Download
} from '@element-plus/icons-vue'

const route = useRoute()
const activeMenu = computed(() => route.path)
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.layout-container {
  height: 100%;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0;
  display: flex;
  align-items: center;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0 20px;
}

.title {
  font-size: 24px;
  font-weight: 600;
}

.subtitle {
  font-size: 14px;
  opacity: 0.9;
}

.aside {
  background-color: #001529 !important;
}

.sidebar-menu {
  border-right: none;
}

.main-content {
  background-color: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
}
</style>
