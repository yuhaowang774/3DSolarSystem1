import { reactive, readonly } from "vue";

// 全局共享状态：Vue 组件与 Three.js 场景之间的通信桥梁
const state = reactive({
  // 加载状态
  loading: true,
  loadingProgress: 0,
  loadingStage: 0,
  loadingText: "INITIALIZING SYSTEMS...",

  // 当前模拟时间
  simDate: new Date(),

  // 选中的天体
  selectedBody: null, // 例如 "earth"
  infoPanelOpen: false,
  infoPanelFullscreen: false,

  // 时间控制
  timeScale: 0, // 当前时间速度（秒/秒，负为倒退）
  isPlaying: true,
  isRealtime: true,
  timeCollapsed: true,

  // 搜索
  searchQuery: "",
  searchResults: [],
  // 命令：请求场景聚焦到某天体（场景消费后清零）
  focusTarget: null,

  // 调试信息（日下点校准）
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

export function useStore() {
  return {
    state: readonly(state),
    commands,
    // 内部可变引用
    _state: state,
  };
}

export { state, commands };
