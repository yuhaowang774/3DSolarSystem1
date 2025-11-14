// 一、核心配置与状态定义
// 时间档位配置（以静止为中心，左侧倒退/右侧前进）
const timePresets = [
  // 倒退档位（左侧，负值表示时间回溯）
  { value: -31536000, label: "1yr/r" }, // 每年倒退
  { value: -15552000, label: "6mth/r" }, // 每6个月倒退
  { value: -7776000, label: "3mth/r" }, // 每3个月倒退
  { value: -2592000, label: "1mth/r" }, // 每月倒退
  { value: -1209600, label: "2wk/r" }, // 每2周倒退
  { value: -604800, label: "1wk/r" }, // 每周倒退
  { value: -432000, label: "5day/r" }, // 每5天倒退
  { value: -172800, label: "2day/r" }, // 每2天倒退
  { value: -86400, label: "1day/r" }, // 每天倒退
  { value: -43200, label: "12hr/r" }, // 每12小时倒退
  { value: -21600, label: "6hr/r" }, // 每6小时倒退
  { value: -10800, label: "3hr/r" }, // 每3小时倒退
  { value: -7200, label: "2hr/r" }, // 每2小时倒退
  { value: -3600, label: "1hr/r" }, // 每小时倒退
  { value: -1800, label: "30min/r" }, // 每30分钟倒退
  { value: -1200, label: "20min/r" }, // 每20分钟倒退
  { value: -600, label: "10min/r" }, // 每10分钟倒退
  { value: -300, label: "5min/r" }, // 每5分钟倒退
  { value: -180, label: "3min/r" }, // 每3分钟倒退
  { value: -120, label: "2min/r" }, // 每2分钟倒退
  { value: -60, label: "1min/r" }, // 每分钟倒退
  { value: -45, label: "45sec/r" }, // 每45秒倒退
  { value: -30, label: "30sec/r" }, // 每30秒倒退
  { value: -20, label: "20sec/r" }, // 每20秒倒退
  { value: -15, label: "15sec/r" }, // 每15秒倒退
  { value: -10, label: "10sec/r" }, // 每10秒倒退
  { value: -8, label: "8sec/r" }, // 每8秒倒退
  { value: -6, label: "6sec/r" }, // 每6秒倒退

  // 中心档位（静止点）
  { value: 0, label: "实时" }, // 时间静止

  // 前进档位（右侧，正值表示时间流逝）
  { value: 6, label: "6sec/s" }, // 每6秒前进
  { value: 8, label: "8sec/s" }, // 每8秒前进
  { value: 10, label: "10sec/s" }, // 每10秒前进
  { value: 15, label: "15sec/s" }, // 每15秒前进
  { value: 20, label: "20sec/s" }, // 每20秒前进
  { value: 30, label: "30sec/s" }, // 每30秒前进
  { value: 45, label: "45sec/s" }, // 每45秒前进
  { value: 60, label: "1min/s" }, // 每分钟前进
  { value: 120, label: "2min/s" }, // 每2分钟前进
  { value: 180, label: "3min/s" }, // 每3分钟前进
  { value: 300, label: "5min/s" }, // 每5分钟前进
  { value: 600, label: "10min/s" }, // 每10分钟前进
  { value: 1200, label: "20min/s" }, // 每20分钟前进
  { value: 1800, label: "30min/s" }, // 每30分钟前进
  { value: 3600, label: "1hr/s" }, // 每小时前进
  { value: 7200, label: "2hr/s" }, // 每2小时前进
  { value: 10800, label: "3hr/s" }, // 每3小时前进
  { value: 21600, label: "6hr/s" }, // 每6小时前进
  { value: 43200, label: "12hr/s" }, // 每12小时前进
  { value: 86400, label: "1day/s" }, // 每天前进
  { value: 172800, label: "2day/s" }, // 每2天前进
  { value: 432000, label: "5day/s" }, // 每5天前进
  { value: 604800, label: "1wk/s" }, // 每周前进
  { value: 1209600, label: "2wk/s" }, // 每2周前进
  { value: 2592000, label: "1mth/s" }, // 每月前进
  { value: 7776000, label: "3mth/s" }, // 每3个月前进
  { value: 15552000, label: "6mth/s" }, // 每6个月前进
  { value: 31536000, label: "1yr/s" }, // 每年前进
];

// 全局状态变量
let currentIndex = 28; // 当前选中档位索引（默认静止点）
let isPlaying = true; // 播放状态（时间是否流动）
let timeControllerEvents = {
  // 事件回调存储
  onPlayPause: null, // 播放/暂停回调
  onSpeedChange: null, // 速度变化回调
};

// DOM元素缓存
let container, // 控制器容器
  speedDisplay, // 速度显示文本
  speedSlider, // 速度滑块
  rewindBtn, // 倒退按钮
  playPauseBtn, // 播放/暂停按钮
  fastForwardBtn; // 快进按钮

// 二、初始化与主入口函数
/**
 * 初始化时间控制器（主入口）
 * @param {Object} options - 配置选项
 * @param {Function} options.onPlayPause - 播放/暂停状态变化回调
 * @param {Function} options.onSpeedChange - 速度变化回调
 */
export function initTimeController(options = {}) {
  // 初始化事件回调
  timeControllerEvents = {
    onPlayPause: options.onPlayPause || null,
    onSpeedChange: options.onSpeedChange || null,
  };

  // 创建DOM元素
  container = createContainer();
  speedDisplay = createSpeedDisplay();
  speedSlider = createSpeedSlider();
  rewindBtn = createRewindButton();
  playPauseBtn = createPlayPauseButton();
  fastForwardBtn = createFastForwardButton();

  // 组装控制器结构
  container.appendChild(speedDisplay);
  const controlsContainer = document.createElement("div");
  controlsContainer.style.display = "flex";
  controlsContainer.appendChild(rewindBtn);
  controlsContainer.appendChild(playPauseBtn);
  controlsContainer.appendChild(fastForwardBtn);
  container.appendChild(controlsContainer);
  container.appendChild(speedSlider);
  document.body.appendChild(container);

  // 初始化显示
  updateDisplay();
}

// 三、UI组件创建（容器与显示元素）
/**
 * 创建控制器容器
 * 功能：提供透明背景的悬浮容器，用于承载所有控制元素
 */
function createContainer() {
  const div = document.createElement("div");
  div.className = "time-controller-container";
  return div;
}

/**
 * 创建速度显示文本组件
 * 功能：展示当前选中的时间速度档位
 */
function createSpeedDisplay() {
  const div = document.createElement("div");
  div.className = "speed-display";
  return div;
}

// 四、核心交互组件（滑块）
/**
 * 创建速度滑块组件
 * 功能：可视化选择时间速度档位，左侧倒退/右侧前进，中心静止
 */
function createSpeedSlider() {
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = timePresets.length - 1;
  slider.step = 1;
  slider.value = currentIndex;
  slider.className = "speed-slider";

  // 根据当前档位更新控制柄颜色（倒退/静止/前进）
  function updateSliderThumbColor() {
    const currentValue = getTimeScale();
    if (currentValue < 0) {
      // 倒退状态 - 红色
      setSliderThumbStyle("20px", "#ff4444", "0 0 8px #ff4444");
    } else if (currentValue > 0) {
      // 前进状态 - 蓝色
      setSliderThumbStyle("20px", "#2196F3", "0 0 8px #2196F3");
    } else {
      // 静止状态 - 灰色
      setSliderThumbStyle("20px", "#9E9E9E", "0 0 8px #9E9E9E");
    }
  }

  // 控制柄样式设置工具函数
  function setSliderThumbStyle(size, color, shadow) {
    slider.style["-webkit-slider-thumb"] = `
      -webkit-appearance: none;
      appearance: none;
      width: ${size};
      height: ${size};
      border-radius: 50%;
      background: ${color};
      box-shadow: ${shadow};
      transition: all 0.2s ease;
      margin-top: -8px;
    `;
    slider.style["-moz-range-thumb"] = `
      width: ${size};
      height: ${size};
      border-radius: 50%;
      background: ${color};
      box-shadow: ${shadow};
      border: none;
      transition: all 0.2s ease;
    `;
  }

  // 初始化控制柄颜色
  updateSliderThumbColor();

  // 滑块拖动事件（更新档位）
  slider.addEventListener("input", (e) => {
    currentIndex = parseInt(e.target.value);
    updateSliderThumbColor();
    updateDisplay();
    // 触发速度变化回调
    if (timeControllerEvents.onSpeedChange) {
      timeControllerEvents.onSpeedChange(getTimeScale());
    }
  });

  // 控制柄悬停放大效果
  slider.addEventListener("mouseover", () => {
    const currentValue = getTimeScale();
    if (currentValue < 0) {
      setSliderThumbStyle("24px", "#ff6666", "0 0 12px #ff6666");
    } else if (currentValue > 0) {
      setSliderThumbStyle("24px", "#4da6ff", "0 0 12px #4da6ff");
    } else {
      setSliderThumbStyle("24px", "#bdbdbd", "0 0 12px #bdbdbd");
    }
  });

  // 离开时恢复默认样式
  slider.addEventListener("mouseout", () => {
    updateSliderThumbColor();
  });

  return slider;
}

// 五、控制按钮组件（倒退/播放/快进）
/**
 * 创建后退按钮
 * 功能：点击切换到上一个档位（增加倒退速度或降低前进速度）
 */
function createRewindButton() {
  const btn = document.createElement("button");
  btn.innerHTML = "◀◀"; // 后退符号
  btn.className = "rewind-btn time-control-btn";
  btn.title = "增加倒退速度";

  // 点击事件（切换到上一个档位）
  btn.addEventListener("click", () => {
    if (currentIndex > 0) {
      currentIndex--;
      speedSlider.value = currentIndex;
      updateDisplay();
      // 更新控制柄颜色
      const currentValue = getTimeScale();
      if (currentValue < 0) {
        speedSlider.style["-webkit-slider-thumb"] = `
          -webkit-appearance: none;
          width: 20px; height: 20px; border-radius: 50%;
          background: #ff4444; box-shadow: 0 0 8px #ff4444;
          margin-top: -8px;
        `;
      } else if (currentValue > 0) {
        speedSlider.style["-webkit-slider-thumb"] = `
          -webkit-appearance: none;
          width: 20px; height: 20px; border-radius: 50%;
          background: #2196F3; box-shadow: 0 0 8px #2196F3;
          margin-top: -8px;
        `;
      }
      // 触发速度变化回调
      if (timeControllerEvents.onSpeedChange) {
        timeControllerEvents.onSpeedChange(getTimeScale());
      }
    } else {
      // 已到最小值，添加脉冲反馈
      btn.classList.add("btn-pulse");
      setTimeout(() => btn.classList.remove("btn-pulse"), 300);
    }
  });

  return btn;
}

/**
 * 创建播放/暂停按钮
 * 功能：控制时间是否流动（播放/暂停切换）
 */
function createPlayPauseButton() {
  const btn = document.createElement("button");
  btn.innerHTML = "❚❚"; // 初始显示暂停符号
  btn.className = "play-pause-btn time-control-btn";
  btn.title = "暂停时间流动";

  // 点击事件（切换播放/暂停状态）
  btn.addEventListener("click", () => {
    isPlaying = !isPlaying;
    btn.innerHTML = isPlaying ? "❚❚" : "▶"; // 切换图标
    btn.title = isPlaying ? "暂停时间流动" : "开始时间流动";
    // 触发播放/暂停回调
    if (timeControllerEvents.onPlayPause) {
      timeControllerEvents.onPlayPause(isPlaying);
    }
  });

  return btn;
}

/**
 * 创建快进按钮
 * 功能：点击切换到下一个档位（增加前进速度或降低倒退速度）
 */
function createFastForwardButton() {
  const btn = document.createElement("button");
  btn.innerHTML = "▶▶"; // 快进符号
  btn.className = "fast-forward-btn time-control-btn";
  btn.title = "增加前进速度";

  // 点击事件（切换到下一个档位）
  btn.addEventListener("click", () => {
    if (currentIndex < timePresets.length - 1) {
      currentIndex++;
      speedSlider.value = currentIndex;
      updateDisplay();
      // 更新控制柄颜色
      const currentValue = getTimeScale();
      if (currentValue < 0) {
        speedSlider.style["-webkit-slider-thumb"] = `
          -webkit-appearance: none;
          width: 20px; height: 20px; border-radius: 50%;
          background: #ff4444; box-shadow: 0 0 8px #ff4444;
          margin-top: -8px;
        `;
      } else if (currentValue > 0) {
        speedSlider.style["-webkit-slider-thumb"] = `
          -webkit-appearance: none;
          width: 20px; height: 20px; border-radius: 50%;
          background: #2196F3; box-shadow: 0 0 8px #2196F3;
          margin-top: -8px;
        `;
      }
      // 触发速度变化回调
      if (timeControllerEvents.onSpeedChange) {
        timeControllerEvents.onSpeedChange(getTimeScale());
      }
    } else {
      // 已到最大值，添加脉冲反馈
      btn.classList.add("btn-pulse");
      setTimeout(() => btn.classList.remove("btn-pulse"), 300);
    }
  });

  return btn;
}

// 六、工具函数与状态管理
/**
 * 更新速度显示文本
 * 功能：同步显示当前选中的速度档位及详细说明
 */
function updateDisplay() {
  if (!speedDisplay) return;

  const currentPreset = timePresets[currentIndex];
  speedDisplay.textContent = `当前速度: ${currentPreset.label}`;

  // 生成详细说明文本（用于鼠标悬停提示）
  let valueText;
  const absValue = Math.abs(currentPreset.value);
  if (absValue === 0) {
    valueText = "时间静止";
  } else if (absValue < 60) {
    valueText = `${absValue}秒/${
      currentPreset.value > 0 ? "秒" : "秒（倒退）"
    }`;
  } else if (absValue < 3600) {
    valueText = `${absValue / 60}分钟/${
      currentPreset.value > 0 ? "秒" : "秒（倒退）"
    }`;
  } else if (absValue < 86400) {
    valueText = `${absValue / 3600}小时/${
      currentPreset.value > 0 ? "秒" : "秒（倒退）"
    }`;
  } else if (absValue < 604800) {
    valueText = `${absValue / 86400}天/${
      currentPreset.value > 0 ? "秒" : "秒（倒退）"
    }`;
  } else if (absValue < 2592000) {
    valueText = `${absValue / 604800}周/${
      currentPreset.value > 0 ? "秒" : "秒（倒退）"
    }`;
  } else if (absValue < 31536000) {
    valueText = `${absValue / 2592000}月/${
      currentPreset.value > 0 ? "秒" : "秒（倒退）"
    }`;
  } else {
    valueText = `${absValue / 31536000}年/${
      currentPreset.value > 0 ? "秒" : "秒（倒退）"
    }`;
  }
  speedDisplay.title = `每秒${
    currentPreset.value > 0 ? "流逝" : "回溯"
  }: ${valueText}`;
}

/**
 * 获取当前时间速度
 * @returns {number} 速度值（负值表示倒退，正值表示前进，0表示静止）
 */
export function getTimeScale() {
  return timePresets[currentIndex].value;
}

/**
 * 检查当前是否处于播放状态
 * @returns {boolean} 是否播放中
 */
export function isTimePlaying() {
  return isPlaying;
}

/**
 * 计算当前帧的时间增量（毫秒）
 * @param {number} delta - 时间间隔（秒）
 * @returns {number} 时间增量（毫秒，负值表示倒退）
 */
export function calculateTimeStep(delta) {
  if (!isPlaying) return 0; // 暂停时增量为0

  // 动态限制最大步长（避免高速时跳跃过大）
  let maxTimeStepMs;
  const currentValue = getTimeScale();
  const absValue = Math.abs(currentValue);

  if (absValue <= 60) maxTimeStepMs = 60000; // 秒级：最大1分钟/帧
  else if (absValue <= 3600) maxTimeStepMs = 3600000; // 分钟级：最大1小时/帧
  else if (absValue <= 86400) maxTimeStepMs = 86400000; // 小时级：最大1天/帧
  else maxTimeStepMs = 604800000; // 天及以上：最大1周/帧

  const scaledStep = currentValue * delta * 1000;
  const sign = Math.sign(scaledStep);
  return sign * Math.min(Math.abs(scaledStep), maxTimeStepMs);
}

/**
 * 重置时间控制器到初始状态（静止）
 */
export function resetTimeController() {
  currentIndex = 28; // 重置到静止点
  isPlaying = true;

  if (speedSlider) speedSlider.value = currentIndex;
  if (playPauseBtn) {
    playPauseBtn.innerHTML = "❚❚";
    playPauseBtn.title = "暂停时间流动";
  }

  updateDisplay();
  // 触发事件通知
  if (timeControllerEvents.onPlayPause)
    timeControllerEvents.onPlayPause(isPlaying);
  if (timeControllerEvents.onSpeedChange)
    timeControllerEvents.onSpeedChange(getTimeScale());
}

/**
 * 手动设置播放状态
 * @param {boolean} playing - 播放状态（true为播放，false为暂停）
 */
export function setPlaying(playing) {
  if (isPlaying === playing) return;

  isPlaying = playing;
  if (playPauseBtn) {
    playPauseBtn.innerHTML = isPlaying ? "❚❚" : "▶";
    playPauseBtn.title = isPlaying ? "暂停时间流动" : "开始时间流动";
  }

  if (timeControllerEvents.onPlayPause) {
    timeControllerEvents.onPlayPause(isPlaying);
  }
}

/**
 * 手动设置时间速度档位
 * @param {number} index - 档位索引（需在0到timePresets.length-1范围内）
 */
export function setTimePresetIndex(index) {
  if (index < 0 || index >= timePresets.length) return;

  currentIndex = index;
  if (speedSlider) speedSlider.value = currentIndex;

  updateDisplay();
  if (timeControllerEvents.onSpeedChange) {
    timeControllerEvents.onSpeedChange(getTimeScale());
  }
}
