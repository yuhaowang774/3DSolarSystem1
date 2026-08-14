<script setup>
import { computed } from "vue";
import { state } from "../store/useStore.js";

const pct = computed(() => Math.round(state.loadingProgress));
</script>

<template>
  <div class="loading">
    <div class="loading-inner">
      <div class="title">SOLAR SYSTEM INTERACTIVE</div>
      <div class="subtitle">INITIALIZING ORBITAL TELEMETRY</div>
      <div class="bar">
        <div class="bar-fill" :style="{ width: pct + '%' }"></div>
      </div>
      <div class="meta">
        <span>{{ state.loadingText }}</span>
        <span>{{ pct }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fade-out 0.8s ease forwards;
}
.loading-inner {
  width: min(520px, 80vw);
  text-align: left;
  padding-left: 8px;
}
.title {
  font-family: "Archivo", sans-serif;
  font-weight: 700;
  font-size: 28px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: var(--ink);
}
.subtitle {
  margin-top: 8px;
  font-family: "Archivo", sans-serif;
  font-weight: 400;
  font-size: 13px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--muted);
}
.bar {
  margin-top: 28px;
  height: 2px;
  width: 100%;
  background: var(--line);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--ink);
  transition: width 0.3s ease;
}
.meta {
  margin-top: 14px;
  display: flex;
  justify-content: space-between;
  font-family: "Archivo", sans-serif;
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--ink-soft);
}
@keyframes fade-out {
  0% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; visibility: hidden; }
}
</style>
