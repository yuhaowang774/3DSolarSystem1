<script setup>
import { state } from "../store/useStore.js";

const formatted = () => {
  const d = state.simDate;
  if (!d) return "--";
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
};
</script>

<template>
  <header class="top-bar">
    <div class="brand">
      <span class="brand-mark">◎</span>
      <span class="brand-name">SOLAR&nbsp;SYSTEM</span>
    </div>
    <div class="clock">{{ formatted() }}</div>
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
.clock {
  font-family: "Archivo", sans-serif;
  font-weight: 500;
  font-size: 13px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--ink-soft);
}
@media (max-width: 768px) {
  .top-bar {
    padding: 14px 18px;
  }
  .brand-name {
    font-size: 14px;
    letter-spacing: 2px;
  }
  .clock {
    font-size: 11px;
  }
}
</style>
