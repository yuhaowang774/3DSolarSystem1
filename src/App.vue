<script setup>
import { onMounted, ref } from "vue";
import SolarScene from "./components/SolarScene.vue";
import LoadingOverlay from "./components/LoadingOverlay.vue";
import SearchBar from "./components/SearchBar.vue";
import TimeController from "./components/TimeController.vue";
import FpsCounter from "./components/FpsCounter.vue";
import LensControl from "./components/LensControl.vue";
import LayersPanel from "./components/LayersPanel.vue";
import InfoPanel from "./components/InfoPanel.vue";
import TopBar from "./components/TopBar.vue";
import { state } from "./store/useStore.js";
import { initTimeController } from "./composables/useTimeController.js";

const ready = ref(false);

onMounted(() => {
  initTimeController();
  setTimeout(() => (ready.value = true), 300);
});
</script>

<template>
  <div class="app-root">
    <TopBar />
    <SolarScene />
    <SearchBar />
    <!-- 底部 HUD：读数在右下角、时间控制器居中；窄屏自动堆叠避免遮挡 -->
    <div class="hud-bottom">
      <FpsCounter />
      <TimeController />
    </div>
    <!-- 右侧停靠栏：图层控制与镜头焦距面板，由顶栏按钮切换（与信息面板互斥，共用右侧一列） -->
    <div class="right-dock">
      <Transition name="dock">
        <LayersPanel v-if="state.layersPanelOpen" />
      </Transition>
      <Transition name="dock">
        <LensControl v-if="state.lensPanelOpen" />
      </Transition>
    </div>
    <InfoPanel />
    <Transition name="loading-fade">
      <LoadingOverlay v-if="state.loading" />
    </Transition>
  </div>
</template>

<style>
/* 顶栏按钮切换的侧栏面板：与信息面板同一套进出场节奏 */
.dock-enter-active,
.dock-leave-active {
  transition: transform 0.42s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.42s ease;
}
.dock-enter-from,
.dock-leave-to {
  transform: translateX(28px);
  opacity: 0;
}

.loading-fade-leave-active {
  transition: opacity 0.8s cubic-bezier(0.19, 1, 0.22, 1);
}
.loading-fade-leave-from {
  opacity: 1;
}
.loading-fade-leave-to {
  opacity: 0;
}
</style>
