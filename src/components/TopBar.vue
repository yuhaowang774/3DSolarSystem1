<script setup>
import { state, commands, toggleRightPanel } from "../store/useStore.js";

// 右上角信息面板开关：从未选中过天体时默认展示太阳
// （右侧三个面板互斥：信息 / 图层 / 镜头共用同一列）
function togglePanel() {
  if (!state.selectedBody) state.selectedBody = "sun";
  toggleRightPanel("info");
}

// 一镜到底运镜：播放 / 跳过命令由 3D 场景注册（commands 桥接）
function toggleDirector() {
  commands.toggleDirector?.();
}
</script>

<template>
  <header class="top-bar">
    <div class="brand">
      <span class="brand-mark">◎</span>
      <span class="brand-name">SOLAR&nbsp;SYSTEM</span>
    </div>
    <div class="actions">
      <button
        class="director-btn"
        :class="{ active: state.directorActive }"
        type="button"
        :title="state.directorActive ? 'SKIP TOUR' : 'CINEMATIC TOUR'"
        aria-label="Toggle cinematic tour"
        @click="toggleDirector"
      >
        {{ state.directorActive ? "SKIP ▶▶" : "CINEMATIC ▶" }}
      </button>
      <button
        class="icon-btn"
        :class="{ active: state.layersPanelOpen }"
        type="button"
        title="LAYERS"
        aria-label="Toggle layers panel"
        @click="toggleRightPanel('layers')"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
          <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
          <path d="M3 12.4 12 16.9l9-4.5" />
          <path d="M3 16.9 12 21.4l9-4.5" />
        </svg>
      </button>
      <button
        class="icon-btn"
        :class="{ active: state.lensPanelOpen }"
        type="button"
        title="LENS / FOCAL LENGTH"
        aria-label="Toggle lens panel"
        @click="toggleRightPanel('lens')"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3.4" />
          <line x1="12" y1="3" x2="12" y2="8.6" />
          <line x1="12" y1="15.4" x2="12" y2="21" />
        </svg>
      </button>
      <button
        class="icon-btn"
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
    </div>
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
.icon-btn {
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
.icon-btn:hover {
  background: rgba(240, 240, 250, 0.1);
  border-color: var(--ink);
  transform: translateY(-1px);
}
.icon-btn.active {
  background: var(--ink);
  border-color: var(--ink);
  color: #000;
}
/* 运镜按钮与 ⓘ 同排布局（flex 自动避让，不再绝对定位叠压） */
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.director-btn {
  pointer-events: auto;
  height: 38px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--line);
  color: var(--ink-soft);
  font-family: "Archivo", sans-serif;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.3s ease, background 0.3s ease;
}
.director-btn:hover {
  color: #fff;
  border-color: var(--ink);
}
.director-btn.active {
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
  .actions {
    gap: 8px;
  }
  .icon-btn {
    width: 34px;
    height: 34px;
  }
  .director-btn {
    height: 34px;
    padding: 0 10px;
    font-size: 10px;
    letter-spacing: 1px;
  }
}
</style>
