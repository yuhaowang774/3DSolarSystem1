<script setup>
import { computed, ref, onMounted } from "vue";
import { state } from "../store/useStore.js";

const pct = computed(() => Math.round(state.loadingProgress));
const stage = computed(() => STAGES[Math.min(STAGES.length - 1, state.loadingStage)] || STAGES[0]);

// 任务序列步骤（与 SolarSystem.js 中 STAGES 对应）
const STAGES = [
  "ACQUIRING TELEMETRY LINK",
  "LOADING ORBITAL TEXTURES",
  "CALIBRATING EPHEMERIS",
  "RENDERING STAR FIELD",
  "SYSTEMS NOMINAL",
];

// 真实旋转角度：由 requestAnimationFrame 驱动，独立于加载进度
const spin = ref(0);
let raf = null;
onMounted(() => {
  const loop = () => {
    spin.value = (spin.value + 1.4) % 360;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
});
</script>

<template>
  <div class="loading">
    <div class="scanline"></div>

    <div class="loading-inner">
      <!-- 任务徽标 -->
      <div class="brand">
        <span class="brand-mark">◈</span>
        <span class="brand-text">SOLAR SYSTEM · MISSION CONTROL</span>
      </div>

      <!-- 主标题 -->
      <h1 class="title">ORBITAL TELEMETRY</h1>
      <div class="subtitle">INITIALIZING INTERACTIVE 3D EPHEMERIS</div>

      <!-- 轨道环动画 -->
      <div class="orbit-stage">
        <svg viewBox="0 0 200 200" class="orbit-svg">
          <circle cx="100" cy="100" r="92" class="ring ring-outer" />
          <circle cx="100" cy="100" r="64" class="ring ring-mid" />
          <circle cx="100" cy="100" r="36" class="ring ring-inner" />
          <g :style="{ transform: `rotate(${spin}deg)`, transformOrigin: '100px 100px' }">
            <circle cx="100" cy="8" r="3.5" class="planet-dot" />
          </g>
          <g :style="{ transform: `rotate(${-spin * 1.6}deg)`, transformOrigin: '100px 100px' }">
            <circle cx="164" cy="100" r="2.5" class="planet-dot alt" />
          </g>
          <g :style="{ transform: `rotate(${spin * 0.7}deg)`, transformOrigin: '100px 100px' }">
            <circle cx="100" cy="136" r="2" class="planet-dot alt" />
          </g>
        </svg>
        <div class="core"></div>
      </div>

      <!-- 任务序列 -->
      <ul class="stages">
        <li
          v-for="(s, i) in STAGES"
          :key="s"
          :class="{ active: i === state.loadingStage, done: i < state.loadingStage }"
        >
          <span class="tick">{{ i < state.loadingStage ? "✓" : i === state.loadingStage ? "›" : "·" }}</span>
          <span class="stage-text">{{ s }}</span>
        </li>
      </ul>

      <!-- 进度条 -->
      <div class="bar">
        <div class="bar-fill" :style="{ width: pct + '%' }"></div>
      </div>

      <!-- 底部读数 -->
      <div class="meta">
        <span class="stage-now">{{ stage }}</span>
        <span class="pct">{{ pct.toString().padStart(3, "0") }}%</span>
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
  overflow: hidden;
}
/* 扫描线：缓慢上下扫过的细光带，体现任务控制感 */
.scanline {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(240, 240, 250, 0.5), transparent);
  animation: scan 3.2s cubic-bezier(0.19, 1, 0.22, 1) infinite;
}

.loading-inner {
  width: min(480px, 86vw);
  text-align: left;
  padding-left: 4px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: "Archivo", sans-serif;
  text-transform: uppercase;
  letter-spacing: 3px;
  font-size: 11px;
  color: var(--muted);
}
.brand-mark {
  color: var(--ink);
  font-size: 14px;
}

.title {
  margin: 20px 0 0;
  font-family: "Archivo", sans-serif;
  font-weight: 700;
  font-size: 34px;
  line-height: 1;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--ink);
}
.subtitle {
  margin-top: 8px;
  font-family: "Archivo", sans-serif;
  font-weight: 400;
  font-size: 12px;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--muted);
}

/* 轨道环动画 */
.orbit-stage {
  position: relative;
  width: 160px;
  height: 160px;
  margin: 30px auto 26px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.orbit-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.ring {
  fill: none;
  stroke: var(--line);
  stroke-width: 1;
}
.ring-outer { opacity: 0.4; }
.ring-mid { opacity: 0.6; }
.ring-inner { opacity: 0.8; }
.planet-dot {
  fill: var(--ink);
}
.planet-dot.alt {
  fill: var(--muted);
}
.core {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink);
  box-shadow: 0 0 12px 2px rgba(240, 240, 250, 0.8);
}

/* 任务序列 */
.stages {
  list-style: none;
  margin: 0 0 22px;
  padding: 0;
  border-top: 1px solid var(--line);
}
.stages li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(240, 240, 250, 0.12);
  font-family: "Archivo", sans-serif;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--muted);
  transition: color 0.4s cubic-bezier(0.19, 1, 0.22, 1);
}
.stages li .tick {
  width: 14px;
  text-align: center;
  color: var(--muted);
}
.stages li.active {
  color: var(--ink);
}
.stages li.active .tick {
  color: var(--ink);
}
.stages li.done {
  color: var(--ink-soft);
}
.stages li.done .tick {
  color: var(--ink);
}

/* 进度条 */
.bar {
  height: 2px;
  width: 100%;
  background: var(--line);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--ink);
  transition: width 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}

.meta {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  font-family: "Archivo", sans-serif;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--ink-soft);
}

@keyframes scan {
  0% { top: 0; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}
</style>
