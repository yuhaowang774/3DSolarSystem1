<script setup>
import { state } from "../store/useStore.js";

// 右上角信息面板开关：从未选中过天体时默认展示太阳
function togglePanel() {
  if (!state.selectedBody) state.selectedBody = "sun";
  state.infoPanelOpen = !state.infoPanelOpen;
}
</script>

<template>
  <header class="top-bar">
    <div class="brand">
      <span class="brand-mark">◎</span>
      <span class="brand-name">SOLAR&nbsp;SYSTEM</span>
    </div>
    <button
      class="info-btn"
      :class="{ active: state.infoPanelOpen }"
      type="button"
      title="PLANET INFO"
      aria-label="Toggle planet info panel"
      @click="togglePanel"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="11" x2="12" y2="16.5" />
        <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    </button>
  </header>
</template>

<style scoped>
.top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 32px;
  pointer-events: none;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-mark {
  color: var(--ink);
  font-size: 20px;
  line-height: 1;
}
.brand-name {
  font-family: "Archivo", sans-serif;
  font-weight: 700;
  font-size: 18px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: var(--ink);
}
.info-btn {
  pointer-events: auto;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--line);
  color: var(--ink);
  cursor: pointer;
  transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease,
    transform 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}
.info-btn:hover {
  background: rgba(240, 240, 250, 0.1);
  border-color: var(--ink);
  transform: translateY(-1px);
}
.info-btn.active {
  background: var(--ink);
  border-color: var(--ink);
  color: #000;
}
@media (max-width: 768px) {
  .top-bar {
    padding: 14px 18px;
  }
  .brand-name {
    font-size: 14px;
    letter-spacing: 2px;
  }
  .info-btn {
    width: 34px;
    height: 34px;
  }
}
</style>
