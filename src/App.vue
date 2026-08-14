<script setup>
import { onMounted, ref } from "vue";
import SolarScene from "./components/SolarScene.vue";
import LoadingOverlay from "./components/LoadingOverlay.vue";
import SearchBar from "./components/SearchBar.vue";
import TimeController from "./components/TimeController.vue";
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
    <TimeController />
    <InfoPanel />
    <Transition name="loading-fade">
      <LoadingOverlay v-if="state.loading" />
    </Transition>
  </div>
</template>

<style>
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
