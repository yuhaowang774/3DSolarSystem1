import { reactive } from "vue";

// 全局共享状态：Vue 组件与 Three.js 场景之间的通信桥梁
const state = reactive({
  // 加载状态
  loading: true,
  loadingProgress: 0,
  loadingStage: 0,

  // 当前模拟时间
  simDate: new Date(),

  // 选中的天体
  selectedBody: null, // 例如 "earth"
  infoPanelOpen: false,

  // 时间控制
  timeScale: 0, // 当前时间速度（秒/秒，负为倒退）
  isPlaying: true,
  isRealtime: true,
  timeCollapsed: true,

  // 日下点校准调试信息（由场景写入，信息面板消费）
  debugInfo: null,
});

// 命令回调：场景实例注册这些方法，组件调用
const commands = {
  focusBody: null,
  setTimeScale: null,
  togglePlay: null,
  toggleRealtime: null,
  resetTime: null,
  selectBody: null,
  closePanel: null,
};

export { state, commands };
