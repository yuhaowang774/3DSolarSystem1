<script setup>
import { computed } from "vue";
import { state } from "../store/useStore.js";

// 场景每 0.5s / 0.2s 写入一次读数，未统计出结果前显示占位符
const fps = computed(() => (state.fps == null ? "--" : String(state.fps)));
const speed = computed(() => state.camSpeed || "--");
</script>

<template>
  <div class="fps-counter">
    <span class="fps-value">{{ fps }}</span> FPS<span class="fps-sep"> · </span><span
      class="speed-value"
      >{{ speed }}</span
    >
    万km/s
  </div>
</template>
