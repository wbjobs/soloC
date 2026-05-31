<script setup lang="ts">import { ref, computed } from 'vue';
import { useWebSocket } from './composables/useWebSocket';
import LaserVisualization from './components/LaserVisualization.vue';
import JoystickControl from './components/JoystickControl.vue';
import RobotStatusDisplay from './components/RobotStatusDisplay.vue';
import PathPlanner from './components/PathPlanner.vue';
import ScriptRecorder from './components/ScriptRecorder.vue';
import type { JoystickData, Waypoint } from './types';
const { robotStatus, laserData, pathStatus, connectionState, sendJoystick, sendPathPlan, sendPathControl } = useWebSocket();
type ActiveTab = 'control' | 'path' | 'script';
const activeTab = ref<ActiveTab>('control');
const scriptRecorderRef = ref<InstanceType<typeof ScriptRecorder> | null>(null);
const handleJoystickChange = (x: number, y: number) => {
 sendJoystick(x, y);
 if (scriptRecorderRef.value) {
 scriptRecorderRef.value.updateJoystickValue(x, y);
 }
};
const handleScriptPlayFrame = (frame: JoystickData) => {
 sendJoystick(frame.x, frame.y);
};
const handleSendPathPlan = (waypoints: Waypoint[]) => {
 sendPathPlan(waypoints);
};
const handleSendPathControl = (action: 'start' | 'pause' | 'resume' | 'stop' | 'clear') => {
 sendPathControl(action);
};
const canUseJoystick = computed(() => {
 if (pathStatus.value?.status === 'executing')
 return false;
 if (pathStatus.value?.status === 'paused')
 return false;
 return true;
});
const tabs = [
 { id: 'control' as ActiveTab, label: '🎮 手动控制' },
 { id: 'path' as ActiveTab, label: '🗺️ 路径规划' },
 { id: 'script' as ActiveTab, label: '📼 脚本录制' }
];
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1 class="header-title">🤖 机器人远程控制系统</h1>
      <div class="connection-status">
        <span class="status-dot" :class="{ connected: connectionState.connected }"></span>
        <span>{{ connectionState.connected ? '已连接' : '未连接' }}</span>
      </div>
    </header>
    
    <nav class="app-nav">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="nav-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>
    
    <main class="app-main">
      <div class="main-content">
        <LaserVisualization 
          :laser-data="laserData" 
          :robot-status="robotStatus" 
        />
      </div>
      
      <aside class="sidebar">
        <template v-if="activeTab === 'control'">
          <JoystickControl 
            @joystick-change="handleJoystickChange"
            :disabled="!canUseJoystick"
          />
          <RobotStatusDisplay :robot-status="robotStatus" />
          
          <div v-if="!canUseJoystick" class="control-disabled-hint">
            ⚠️ 路径规划正在执行中，手动控制已禁用
          </div>
        </template>
        
        <template v-else-if="activeTab === 'path'">
          <PathPlanner
            :path-status="pathStatus"
            :robot-status="robotStatus"
            @send-path-plan="handleSendPathPlan"
            @send-path-control="handleSendPathControl"
          />
        </template>
        
        <template v-else-if="activeTab === 'script'">
          <ScriptRecorder
            ref="scriptRecorderRef"
            :is-joystick-active="false"
            @play-frame="handleScriptPlayFrame"
          />
        </template>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.app-nav {
  display: flex;
  gap: 8px;
  padding: 12px 24px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

.nav-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: var(--bg-dark);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.nav-btn:hover {
  color: var(--text-primary);
}

.nav-btn.active {
  background: var(--primary-color);
  color: white;
}

.control-disabled-hint {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid var(--warning-color);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  color: var(--warning-color);
  font-size: 14px;
}
</style>
