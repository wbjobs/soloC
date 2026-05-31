<template>
  <div id="app">
    <RoomLobby 
      v-if="!inRoom" 
      @roomJoined="handleRoomJoined"
    />
    <EditorRoom 
      v-else 
      :isInitiator="isInitiator"
      @leave="handleLeaveRoom"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import RoomLobby from './components/RoomLobby.vue';
import EditorRoom from './components/EditorRoom.vue';
import { signalingService } from './services/SignalingService';

const inRoom = ref(false);
const isInitiator = ref(false);

onMounted(async () => {
  try {
    await signalingService.connect();
  } catch (error) {
    console.error('连接信令服务器失败:', error);
  }
});

function handleRoomJoined(initiator: boolean) {
  isInitiator.value = initiator;
  inRoom.value = true;
}

function handleLeaveRoom() {
  inRoom.value = false;
  isInitiator.value = false;
}

onBeforeUnmount(() => {
  signalingService.disconnect();
});
</script>

<style>
#app {
  width: 100%;
  height: 100vh;
}
</style>
