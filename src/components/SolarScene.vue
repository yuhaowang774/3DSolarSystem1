<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import { SolarSystem } from "../core/SolarSystem.js";

const container = ref(null);
let system = null;

onMounted(() => {
  system = new SolarSystem(container.value);
  system.init();
});

onBeforeUnmount(() => {
  system?.dispose();
});
</script>

<template>
  <div ref="container" class="solar-scene"></div>
</template>

<style scoped>
.solar-scene {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: #000;
  overflow: hidden;
  z-index: 0;
}
</style>
