import { ref } from "vue";
import { state, commands } from "../store/useStore.js";

// 时间档位配置（以静止为中心，左侧倒退/右侧前进）
export const timePresets = [
  { value: -31536000, label: "1yr/r" },
  { value: -15552000, label: "6mth/r" },
  { value: -7776000, label: "3mth/r" },
  { value: -2592000, label: "1mth/r" },
  { value: -1209600, label: "2wk/r" },
  { value: -604800, label: "1wk/r" },
  { value: -432000, label: "5day/r" },
  { value: -172800, label: "2day/r" },
  { value: -86400, label: "1day/r" },
  { value: -43200, label: "12hr/r" },
  { value: -21600, label: "6hr/r" },
  { value: -10800, label: "3hr/r" },
  { value: -7200, label: "2hr/r" },
  { value: -3600, label: "1hr/r" },
  { value: -1800, label: "30min/r" },
  { value: -1200, label: "20min/r" },
  { value: -600, label: "10min/r" },
  { value: -300, label: "5min/r" },
  { value: -180, label: "3min/r" },
  { value: -120, label: "2min/r" },
  { value: -60, label: "1min/r" },
  { value: -45, label: "45sec/r" },
  { value: -30, label: "30sec/r" },
  { value: -20, label: "20sec/r" },
  { value: -15, label: "15sec/r" },
  { value: -10, label: "10sec/r" },
  { value: -8, label: "8sec/r" },
  { value: -6, label: "6sec/r" },
  { value: 0, label: "实时" },
  { value: 6, label: "6sec/s" },
  { value: 8, label: "8sec/s" },
  { value: 10, label: "10sec/s" },
  { value: 15, label: "15sec/s" },
  { value: 20, label: "20sec/s" },
  { value: 30, label: "30sec/s" },
  { value: 45, label: "45sec/s" },
  { value: 60, label: "1min/s" },
  { value: 120, label: "2min/s" },
  { value: 180, label: "3min/s" },
  { value: 300, label: "5min/s" },
  { value: 600, label: "10min/s" },
  { value: 1200, label: "20min/s" },
  { value: 1800, label: "30min/s" },
  { value: 3600, label: "1hr/s" },
  { value: 7200, label: "2hr/s" },
  { value: 10800, label: "3hr/s" },
  { value: 21600, label: "6hr/s" },
  { value: 43200, label: "12hr/s" },
  { value: 86400, label: "1day/s" },
  { value: 172800, label: "2day/s" },
  { value: 432000, label: "5day/s" },
  { value: 604800, label: "1wk/s" },
  { value: 1209600, label: "2wk/s" },
  { value: 2592000, label: "1mth/s" },
  { value: 7776000, label: "3mth/s" },
  { value: 15552000, label: "6mth/s" },
  { value: 31536000, label: "1yr/s" },
];

const STATIC_INDEX = 28; // 静止档位（实时）索引
export const currentIndex = ref(STATIC_INDEX);

let lastRealtimeUpdate = Date.now();

/**
 * 计算当前帧的时间增量（毫秒）
 * @param {number} delta - 帧间隔（秒）
 * @returns {number} 时间增量（毫秒，负值表示倒退）
 */
export function calculateTimeStep(delta) {
  if (state.isRealtime) {
    const now = Date.now();
    const elapsed = now - lastRealtimeUpdate;
    lastRealtimeUpdate = now;
    return elapsed;
  }
  if (!state.isPlaying) return 0;

  const value = timePresets[currentIndex.value].value;
  const abs = Math.abs(value);
  const maxStep =
    abs <= 60
      ? 60000
      : abs <= 3600
      ? 3600000
      : abs <= 86400
      ? 86400000
      : 604800000;

  const scaled = value * delta * 1000;
  return Math.sign(scaled) * Math.min(Math.abs(scaled), maxStep);
}

export function getTimeScale() {
  return timePresets[currentIndex.value].value;
}

export function setPresetIndex(index) {
  if (index < 0 || index >= timePresets.length) return;
  currentIndex.value = index;
  const v = timePresets[index].value;
  state.timeScale = v;
  if (state.isRealtime) setRealtime(false);
  if (commands.setTimeScale) commands.setTimeScale(v);
}

export function stepPreset(delta) {
  setPresetIndex(currentIndex.value + delta);
}

export function togglePlay() {
  if (state.isRealtime) setRealtime(false);
  state.isPlaying = !state.isPlaying;
  if (commands.togglePlay) commands.togglePlay(state.isPlaying);
}

export function setRealtime(on) {
  state.isRealtime = on;
  if (on) {
    currentIndex.value = STATIC_INDEX;
    state.timeScale = 0;
    state.isPlaying = false;
    lastRealtimeUpdate = Date.now();
  } else {
    state.isPlaying = true;
  }
  if (commands.toggleRealtime) commands.toggleRealtime(on);
}

export function toggleRealtime() {
  setRealtime(!state.isRealtime);
}

export function toggleCollapse() {
  state.timeCollapsed = !state.timeCollapsed;
}

export function initTimeController() {
  lastRealtimeUpdate = Date.now();
  setRealtime(true);
  state.timeScale = 0;
}
