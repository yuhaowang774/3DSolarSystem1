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
  // 右侧面板（与信息面板同列，互斥显示，由顶栏按钮切换）
  layersPanelOpen: false,
  lensPanelOpen: false,

  // 时间控制
  timeScale: 0, // 当前时间速度（秒/秒，负为倒退）
  isPlaying: true,
  isRealtime: true,
  timeCollapsed: true,

  // 日下点校准调试信息（由场景写入，信息面板消费）
  debugInfo: null,

  // 一镜到底运镜播放状态（由场景写入，顶栏按钮消费）
  directorActive: false,

  // 相机焦距（mm，35mm 全画幅等效；12mm ↔ 垂直 FOV 90°。由场景写入，LENS 面板消费）
  focalLength: 12,

  // 运行帧数 / 镜头速度读数（由场景写入，底部 HUD 组件消费）
  fps: null, // null 表示尚未统计出结果，显示 "--"
  camSpeed: "--",

  // 地球教学图层开关（图层控制面板直接改写，场景每帧读取）
  layers: {
    graticule: true, // 经纬网（含赤道 / 回归线 / 极圈）
    axis: true, // 地轴
    terminator: true, // 晨昏线
    subsolar: true, // 太阳直射点
    cities: false, // 主要城市
  },

  // 地理教学实时读数（由场景低频写入，信息面板「地理」页消费）
  geoInfo: null,

  // 月相实时要素（由场景低频写入：名称/照明比/月龄等，地理教学消费）
  moonPhase: null,
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
  toggleDirector: null,
  setFocalLength: null,
};

/**
 * 右侧面板互斥切换：信息面板（全高）与图层 / 镜头面板共用右侧一列，
 * 同一时刻只显示一个，避免互相遮挡
 * @param {"info"|"layers"|"lens"|null} which - 要打开的面板；null 表示全部收起
 */
function showRightPanel(which) {
  state.infoPanelOpen = which === "info";
  state.layersPanelOpen = which === "layers";
  state.lensPanelOpen = which === "lens";
}

/** 顶栏按钮用：已打开则收起，否则切换到该面板 */
function toggleRightPanel(which) {
  const open =
    (which === "info" && state.infoPanelOpen) ||
    (which === "layers" && state.layersPanelOpen) ||
    (which === "lens" && state.lensPanelOpen);
  showRightPanel(open ? null : which);
}

export { state, commands, showRightPanel, toggleRightPanel };
