<script setup>
import { computed, ref } from "vue";
import { state } from "../store/useStore.js";
import { formatLatLon } from "../js/geo.js";

// 图层控制：直接改写 state.layers，场景每帧读取（无需命令往返）
const LAYER_ITEMS = [
  { id: "graticule", cn: "经纬网", en: "GRATICULE" },
  { id: "axis", cn: "地轴", en: "AXIS" },
  { id: "terminator", cn: "晨昏线", en: "TERMINATOR" },
  { id: "subsolar", cn: "太阳直射点", en: "SUBSOLAR" },
  { id: "cities", cn: "主要城市", en: "CITIES" },
];

const collapsed = ref(false);

const activeCount = computed(
  () => LAYER_ITEMS.filter((i) => state.layers[i.id]).length
);

const geo = computed(() => state.geoInfo);
const subsolarText = computed(() =>
  geo.value ? formatLatLon(geo.value.subsolarLat, geo.value.subsolarLon) : "--"
);
const declText = computed(() =>
  geo.value
    ? `${geo.value.declination >= 0 ? "北纬" : "南纬"} ${Math.abs(geo.value.declination).toFixed(2)}°`
    : "--"
);

function toggle(id) {
  state.layers[id] = !state.layers[id];
}
</script>

<template>
  <div class="layers-ctrl" :class="{ collapsed }">
    <button class="head" type="button" @click="collapsed = !collapsed">
      <span class="label">LAYERS</span>
      <span class="head-right">
        <span class="count">{{ activeCount }}/{{ LAYER_ITEMS.length }}</span>
        <span class="chevron">{{ collapsed ? "▸" : "▾" }}</span>
      </span>
    </button>

    <div v-if="!collapsed" class="body">
      <button
        v-for="item in LAYER_ITEMS"
        :key="item.id"
        class="row"
        :class="{ on: state.layers[item.id] }"
        type="button"
        @click="toggle(item.id)"
      >
        <span class="box"></span>
        <span class="name">{{ item.cn }}</span>
        <span class="en">{{ item.en }}</span>
      </button>

      <div class="foot">
        <div class="line"><span>太阳直射点</span><b>{{ subsolarText }}</b></div>
        <div class="line"><span>太阳赤纬</span><b>{{ declText }}</b></div>
        <p class="tip">贴近地球时自动显示 · 点击空间站可锁定跟踪</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 定位与层级由 global.css 的 .right-dock 统一调度（与信息面板同列） */
.layers-ctrl {
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
.count {
  font-family: "Archivo", sans-serif;
  font-size: 11px;
  letter-spacing: 1.5px;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.chevron {
  color: var(--ink-soft);
  font-size: 12px;
}
.body {
  padding: 0 12px 12px;
  border-top: 1px solid var(--line);
}
.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: opacity 0.2s ease;
}
.row + .row {
  border-top: 1px solid rgba(42, 44, 52, 0.55);
}
.box {
  width: 11px;
  height: 11px;
  flex: none;
  border: 1px solid var(--line-strong);
  position: relative;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.row.on .box {
  background: var(--ink);
  border-color: var(--ink);
}
.row.on .box::after {
  content: "✓";
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  line-height: 1;
  color: #000;
}
.name {
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--muted);
  transition: color 0.2s ease;
}
.row.on .name {
  color: var(--ink);
}
.en {
  margin-left: auto;
  font-family: "Archivo", sans-serif;
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--muted);
}
.row:hover .name {
  color: var(--ink);
}
.foot {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.line span {
  font-size: 10px;
  letter-spacing: 1px;
  color: var(--muted);
}
.line b {
  font-family: "Archivo", sans-serif;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.5px;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.tip {
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.6;
  letter-spacing: 0.5px;
  color: var(--muted);
}
</style>
