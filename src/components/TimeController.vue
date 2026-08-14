<script setup>
import { computed } from "vue";
import { state } from "../store/useStore.js";
import {
  timePresets,
  currentIndex,
  setPresetIndex,
  togglePlay,
  toggleRealtime,
  toggleCollapse,
  initTimeController,
} from "../composables/useTimeController.js";

initTimeController();

const collapsed = computed(() => state.timeCollapsed);
const realtime = computed(() => state.isRealtime);
const playing = computed(() => state.isPlaying);

const currentLabel = computed(() => timePresets[currentIndex.value]?.label || "实时");

function onSlider(e) {
  setPresetIndex(Number(e.target.value));
}
</script>

<template>
  <div class="time-ctrl" :class="{ collapsed }">
    <button class="head" @click="toggleCollapse">
      <span class="label">TIME CONTROL</span>
      <span class="chevron">{{ collapsed ? "▸" : "▾" }}</span>
    </button>

    <div v-if="!collapsed" class="body">
      <div class="status">
        <span class="mode" :class="{ live: realtime }">
          {{ realtime ? "● LIVE · REALTIME" : playing ? "▶ SIMULATING" : "❚❚ PAUSED" }}
        </span>
        <span class="rate">{{ currentLabel }}</span>
      </div>

      <input
        class="slider"
        type="range"
        min="0"
        :max="timePresets.length - 1"
        :value="currentIndex"
        @input="onSlider"
      />

      <div class="ticks">
        <span>REV</span>
        <span>REAL</span>
        <span>FWD</span>
      </div>

      <div class="actions">
        <button class="btn" @click="togglePlay" :disabled="realtime">
          {{ playing ? "PAUSE" : "PLAY" }}
        </button>
        <button class="btn solid" @click="toggleRealtime">REALTIME</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.time-ctrl {
  position: fixed;
  bottom: 28px;
  left: 32px;
  z-index: 25;
  width: 320px;
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
  padding: 14px 16px;
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
.chevron {
  color: var(--ink-soft);
  font-size: 12px;
}
.body {
  padding: 0 16px 18px;
  border-top: 1px solid var(--line);
}
.status {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 16px 0 12px;
}
.mode {
  font-family: "Archivo", sans-serif;
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.mode.live {
  color: var(--ink);
}
.rate {
  font-family: "Archivo", sans-serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--ink);
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
.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.btn {
  flex: 1;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink);
  font-family: "Archivo", sans-serif;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 10px 0;
  cursor: pointer;
  transition: background 0.3s ease, color 0.3s ease;
}
.btn:hover:not(:disabled) {
  background: rgba(240, 240, 250, 0.1);
}
.btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.btn.solid {
  background: var(--ink);
  color: #000;
  border-color: var(--ink);
}
.btn.solid:hover {
  background: #fff;
}
@media (max-width: 768px) {
  .time-ctrl {
    left: 18px;
    right: 18px;
    width: auto;
  }
}
</style>
