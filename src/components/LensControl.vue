<script setup>
import { computed, ref } from "vue";
import { state, commands } from "../store/useStore.js";

// 与场景保持同一条链路：面板只发命令，实际换算与生效在 SolarSystem._setFocalLength
const SENSOR_HEIGHT_MM = 24;
const FOCAL_MIN = 8; // ≈112.6° 超广角
const FOCAL_MAX = 600; // ≈2.3° 长焦
const SLIDER_STEPS = 1000; // 滑块分辨率：配合对数映射，全焦段手感一致

// 面板由顶栏 LENS 按钮开关，打开即完整展开（保留表头可手动折叠）
const collapsed = ref(false);

const focal = computed(() => state.focalLength ?? 12);
const fov = computed(
  () => (2 * Math.atan(SENSOR_HEIGHT_MM / (2 * focal.value)) * 180) / Math.PI
);

// 滑块位置 ↔ 焦距采用对数映射：8→600mm 等比分布，低焦段（广角）也有足够行程
const sliderValue = computed(() => {
  const t = Math.log(focal.value / FOCAL_MIN) / Math.log(FOCAL_MAX / FOCAL_MIN);
  return Math.round(t * SLIDER_STEPS);
});

function onSlider(e) {
  const t = Number(e.target.value) / SLIDER_STEPS;
  const mm = FOCAL_MIN * Math.pow(FOCAL_MAX / FOCAL_MIN, t);
  commands.setFocalLength?.(Math.round(mm * 10) / 10);
}

function applyPreset(mm) {
  commands.setFocalLength?.(mm);
}

const presets = [
  { label: "WIDE", mm: 12 },
  { label: "NORMAL", mm: 50 },
  { label: "TELE", mm: 200 },
];

const isActive = (mm) => Math.abs(focal.value - mm) < 0.05;
</script>

<template>
  <div class="lens-ctrl" :class="{ collapsed }">
    <button class="head" type="button" @click="collapsed = !collapsed">
      <span class="label">LENS</span>
      <span class="head-right">
        <span class="value">{{ focal }}mm</span>
        <span class="chevron">{{ collapsed ? "▸" : "▾" }}</span>
      </span>
    </button>

    <div v-if="!collapsed" class="body">
      <div class="reading">
        <span class="focal">{{ focal }}mm</span>
        <span class="fov">{{ fov.toFixed(1) }}° FOV</span>
      </div>

      <input
        class="slider"
        type="range"
        min="0"
        :max="SLIDER_STEPS"
        :value="sliderValue"
        @input="onSlider"
      />

      <div class="ticks">
        <span>WIDE</span>
        <span>NORMAL</span>
        <span>TELE</span>
      </div>

      <div class="presets">
        <button
          v-for="p in presets"
          :key="p.label"
          class="chip"
          :class="{ active: isActive(p.mm) }"
          type="button"
          @click="applyPreset(p.mm)"
        >
          {{ p.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 定位与层级由 global.css 的 .right-dock 容器统一调度（右侧停靠栏，与信息面板同列） */
.lens-ctrl {
  width: 100%;
  border: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
}
.head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  border: none;
  padding: 12px 14px;
  cursor: pointer;
}
.label {
  font-family: "Archivo", sans-serif;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--ink);
}
.head-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.value {
  font-family: "Archivo", sans-serif;
  font-size: 11px;
  letter-spacing: 1.5px;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
/* 展开后由面板内的大号读数接管，避免重复 */
.lens-ctrl:not(.collapsed) .head .value {
  display: none;
}
.chevron {
  color: var(--ink-soft);
  font-size: 12px;
}
.body {
  padding: 0 14px 16px;
  border-top: 1px solid var(--line);
}
.reading {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 14px 0 12px;
}
.focal {
  font-family: "Archivo", sans-serif;
  font-weight: 700;
  font-size: 19px;
  letter-spacing: 1.5px;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.fov {
  font-family: "Archivo", sans-serif;
  font-size: 9px;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--muted);
}
.slider {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 2px;
  background: var(--line);
  outline: none;
  cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 18px;
  background: var(--ink);
  border-radius: 0;
  cursor: pointer;
}
.slider::-moz-range-thumb {
  width: 10px;
  height: 18px;
  background: var(--ink);
  border: none;
  border-radius: 0;
  cursor: pointer;
}
.ticks {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-family: "Archivo", sans-serif;
  font-size: 9px;
  letter-spacing: 2px;
  color: var(--muted);
}
.presets {
  display: flex;
  gap: 6px;
  margin-top: 14px;
}
.chip {
  flex: 1;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink-soft);
  font-family: "Archivo", sans-serif;
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 8px 0;
  cursor: pointer;
  transition: background 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}
.chip:hover {
  color: #fff;
  background: rgba(240, 240, 250, 0.1);
}
.chip.active {
  background: var(--ink);
  border-color: var(--ink);
  color: #000;
}
/* 窄屏宽度由 .right-dock 统一控制，面板自身仅负责外观 */
</style>
