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
let isRealtimeSync = true; // 是否启用实时时间同步（默认启用）
let lastRealtimeUpdate = null; // 上次实时时间更新时间

// DOM元素缓存
let container, // 控制器容器
  speedDisplay, // 速度显示文本
  speedSlider, // 速度滑块
  rewindBtn, // 倒退按钮
  playPauseBtn, // 播放/暂停按钮
  fastForwardBtn, // 快进按钮
  liveButton, // LIVE按钮
  timeDisplay, // 时间显示组件
  liveIndicator; // LIVE指示器

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

  // 初始化实时时间同步状态
  lastRealtimeUpdate = Date.now();

  // 初始状态设置为live模式
  toggleRealtimeSync(true);

  // 创建DOM元素
  container = createContainer();
  speedDisplay = createSpeedDisplay();
  speedSlider = createSpeedSlider();
  rewindBtn = createRewindButton();
  playPauseBtn = createPlayPauseButton();
  fastForwardBtn = createFastForwardButton();
  liveButton = createLiveButton();
  timeDisplay = createTimeDisplay();
  liveIndicator = createLiveIndicator();

  // 组装控制器结构
  // 主容器布局 - 分为左右两部分
  const leftContainer = document.createElement("div");
  leftContainer.className = "time-left-container";

  const rightContainer = document.createElement("div");
  rightContainer.className = "time-right-container";

  // 左侧容器 - LIVE按钮和指示器
  leftContainer.appendChild(liveButton);
  leftContainer.appendChild(liveIndicator);

  // 右侧容器 - 速度显示、时间显示、控制按钮和滑块
  rightContainer.appendChild(speedDisplay);
  rightContainer.appendChild(timeDisplay);

  const controlsContainer = document.createElement("div");
  controlsContainer.className = "controls-container";
  controlsContainer.appendChild(rewindBtn);
  controlsContainer.appendChild(playPauseBtn);
  controlsContainer.appendChild(fastForwardBtn);

  rightContainer.appendChild(controlsContainer);
  rightContainer.appendChild(speedSlider);

  // 组装主容器
  container.appendChild(leftContainer);
  container.appendChild(rightContainer);

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
      setSliderThumbStyle("20px", "#ff4444");
    } else if (currentValue > 0) {
      // 前进状态 - 蓝色
      setSliderThumbStyle("20px", "#2196F3");
    } else {
      // 静止状态 - 灰色
      setSliderThumbStyle("20px", "#9E9E9E");
    }
  }

  // 控制柄样式设置工具函数 - 确保干净无残留的样式
  function setSliderThumbStyle(size, color, boxShadow = "none") {
    // 清除所有之前的样式，避免残留
    slider.style.removeProperty("--thumb-color");

    // 简单一致的样式设置
    slider.style["-webkit-slider-thumb"] = `
      -webkit-appearance: none;
      width: ${size};
      height: ${size};
      border-radius: 50%;
      background: ${color};
      cursor: pointer;
      margin-top: -6px;
      border: none;
      outline: none;
      box-shadow: ${boxShadow};
    `;
    slider.style["-moz-range-thumb"] = `
      width: ${size};
      height: ${size};
      border-radius: 50%;
      background: ${color};
      cursor: pointer;
      border: none;
      outline: none;
      box-shadow: ${boxShadow};
    `;
  }

  // 初始化控制柄颜色
  updateSliderThumbColor();

  // 滑块拖动事件（更新档位）
  slider.addEventListener("input", (e) => {
    currentIndex = parseInt(e.target.value);
    updateSliderThumbColor();
    updateDisplay();
    // 当用户拖动滑块时，禁用实时同步（退出live模式）
    if (isRealtimeSync) {
      toggleRealtimeSync(false);
    }
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
 * 创建通用控制按钮
 * @param {string} innerHTML - 按钮内容
 * @param {string} className - 按钮类名
 * @param {string} title - 按钮标题
 * @param {Function} onClickHandler - 点击事件处理函数
 * @returns {HTMLButtonElement} 创建的按钮元素
 */
function createControlButton(innerHTML, className, title, onClickHandler) {
  // 优化DOM创建和事件绑定
  const btn = document.createElement("button");
  btn.innerHTML = innerHTML;
  btn.className = className;
  btn.title = title;
  btn.addEventListener("click", onClickHandler);
  return btn;
}

/**
 * 更新播放/暂停按钮UI
 */
function updatePlayPauseButtonUI() {
  if (!playPauseBtn) return;
  playPauseBtn.innerHTML = isPlaying ? "❚❚" : "▶";
  playPauseBtn.title = isPlaying ? "暂停时间流动" : "开始时间流动";
}

/**
 * 处理档位变化的通用函数
 * @param {number} delta - 变化量（+1或-1）
 * @param {HTMLButtonElement} btn - 触发按钮（用于脉冲反馈）
 */
function handlePresetChange(delta, btn) {
  // 如果在实时模式下点击控制按钮，先禁用实时模式
  if (isRealtimeSync) {
    toggleRealtimeSync(false);
  }

  const newIndex = currentIndex + delta;
  if (newIndex >= 0 && newIndex < timePresets.length) {
    currentIndex = newIndex;
    speedSlider.value = currentIndex;
    updateDisplay();

    // 更新控制柄颜色
    const currentValue = getTimeScale();
    if (currentValue < 0) {
      setSliderThumbStyle("20px", "#ff4444");
    } else if (currentValue > 0) {
      setSliderThumbStyle("20px", "#2196F3");
    } else {
      setSliderThumbStyle("20px", "#9E9E9E");
    }

    // 触发速度变化回调
    if (timeControllerEvents.onSpeedChange) {
      timeControllerEvents.onSpeedChange(getTimeScale());
    }
  }
}

/**
 * 创建后退按钮
 * 功能：点击切换到上一个档位（增加倒退速度或降低前进速度）
 */
function createRewindButton() {
  return createControlButton(
    "◀◀",
    "rewind-btn time-control-btn",
    "增加倒退速度",
    function () {
      handlePresetChange(-1, this);
    }
  );
}

/**
 * 创建播放/暂停按钮
 * 功能：控制时间是否流动（播放/暂停切换）
 */
function createPlayPauseButton() {
  return createControlButton(
    "❚❚",
    "play-pause-btn time-control-btn",
    "暂停时间流动",
    function () {
      // 如果在实时模式下点击，先禁用实时模式
      if (isRealtimeSync) {
        toggleRealtimeSync(false);
      }

      isPlaying = !isPlaying;
      updatePlayPauseButtonUI();

      // 触发播放/暂停回调
      if (timeControllerEvents.onPlayPause) {
        timeControllerEvents.onPlayPause(isPlaying);
      }
    }
  );
}

/**
 * 创建快进按钮
 * 功能：点击切换到下一个档位（增加前进速度或降低倒退速度）
 */
function createFastForwardButton() {
  return createControlButton(
    "▶▶",
    "fast-forward-btn time-control-btn",
    "增加前进速度",
    function () {
      handlePresetChange(1, this);
    }
  );
}

// 日期时间显示功能已整合到createTimeDisplay中，移除冗余函数

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
  const absValue = Math.abs(currentPreset.value);
  const direction = currentPreset.value > 0 ? "秒" : "秒（倒退）";
  const flowDirection = currentPreset.value > 0 ? "流逝" : "回溯";

  let valueText;
  if (absValue === 0) {
    valueText = "时间静止";
  } else if (absValue < 60) {
    valueText = `${absValue}秒/${direction}`;
  } else if (absValue < 3600) {
    valueText = `${absValue / 60}分钟/${direction}`;
  } else if (absValue < 86400) {
    valueText = `${absValue / 3600}小时/${direction}`;
  } else if (absValue < 604800) {
    valueText = `${absValue / 86400}天/${direction}`;
  } else if (absValue < 2592000) {
    valueText = `${absValue / 604800}周/${direction}`;
  } else if (absValue < 31536000) {
    valueText = `${absValue / 2592000}月/${direction}`;
  } else {
    valueText = `${absValue / 31536000}年/${direction}`;
  }

  speedDisplay.title = `每秒${flowDirection}: ${valueText}`;
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
  // 如果启用了实时时间同步，使用真实时间
  if (isRealtimeSync) {
    const now = Date.now();
    const timeElapsed = now - lastRealtimeUpdate;
    lastRealtimeUpdate = now;
    return timeElapsed;
  }

  if (!isPlaying) return 0; // 暂停时增量为0

  // 动态限制最大步长（避免高速时跳跃过大）
  const currentValue = getTimeScale();
  const absValue = Math.abs(currentValue);

  // 根据时间速度级别确定最大步长
  const maxTimeStepMs =
    absValue <= 60
      ? 60000 // 秒级：最大1分钟/帧
      : absValue <= 3600
      ? 3600000 // 分钟级：最大1小时/帧
      : absValue <= 86400
      ? 86400000 // 小时级：最大1天/帧
      : 604800000; // 天及以上：最大1周/帧

  const scaledStep = currentValue * delta * 1000;
  return Math.sign(scaledStep) * Math.min(Math.abs(scaledStep), maxTimeStepMs);
}

/**
 * 切换实时同步状态
 * @param {boolean} [state] - 可选，指定要设置的状态，不提供则切换当前状态
 * @returns {boolean} - 切换后的实时同步状态
 */
export function toggleRealtimeSync(state) {
  if (state !== undefined) {
    isRealtimeSync = state;
  } else {
    isRealtimeSync = !isRealtimeSync;
  }

  if (isRealtimeSync) {
    // 启用实时同步时，设置模拟时间为当前真实时间
    currentIndex = 28; // 重置为暂停状态
    updateDisplay();
    isPlaying = false;
    if (playPauseBtn) {
      playPauseBtn.innerHTML = "❚❚"; // 实时模式下显示为暂停状态
      playPauseBtn.title = "暂停时间流动";
    }

    // 更新UI以反映实时同步状态
    updateRealtimeSyncUI();

    // 记录当前时间作为实时更新的起点
    lastRealtimeUpdate = Date.now();
  } else {
    // 禁用实时同步时，确保播放状态为true，使时间根据滑块选择的速度流动
    isPlaying = true;
    updatePlayPauseButtonUI(); // 更新播放按钮UI
    updateRealtimeSyncUI(); // 更新实时同步UI
  }

  return isRealtimeSync;
}

/**
 * 更新时间显示
 * @param {Date} date - 要显示的日期时间对象
 */
export function updateTimeDisplay(date) {
  if (!timeDisplay) return;

  // 格式化日期和时间
  const formattedDate = date
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();

  const formattedTime = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  timeDisplay.innerHTML = `${formattedDate} <span class="time-separator">|</span> ${formattedTime}`;

  // 在实时模式下添加标识
  if (isRealtimeSync) {
    timeDisplay.classList.add("realtime-active");
  } else {
    timeDisplay.classList.remove("realtime-active");
  }
}

// 获取当前实时同步状态
export function getRealtimeSyncState() {
  return isRealtimeSync;
}

// 创建LIVE按钮
function createLiveButton() {
  const btn = document.createElement("button");
  btn.innerHTML = "● LIVE";
  btn.className = "live-button";
  btn.title = "切换到实时模式";

  // 点击事件 - 切换到实时模式并重置滑块
  btn.addEventListener("click", () => {
    // 启用实时同步
    toggleRealtimeSync(true); // 确保启用实时同步

    // 滑块归位到中心位置（静止状态）
    if (speedSlider) {
      // 使用平滑动画归位
      const animateSlider = () => {
        const currentValue = parseInt(speedSlider.value);
        const targetValue = 28; // 中心位置索引

        if (currentValue !== targetValue) {
          const step = currentValue < targetValue ? 1 : -1;
          speedSlider.value = currentValue + step;
          requestAnimationFrame(animateSlider);
        } else {
          // 动画完成后更新状态
          currentIndex = targetValue;
          updateDisplay();
        }
      };

      animateSlider();

      // 更新实时同步UI
      updateRealtimeSyncUI();
    }

    // 更新LIVE指示器状态
    updateLiveIndicator();

    // 更新按钮样式
    btn.classList.add("active");
  });

  return btn;
}

// 创建时间显示器
function createTimeDisplay() {
  const div = document.createElement("div");
  div.className = "time-display";
  div.title = "当前模拟时间";
  // 初始显示当前时间
  updateTimeDisplay(new Date());
  return div;
}

// updateTimeDisplay function already defined as export above

// 创建LIVE指示器
function createLiveIndicator() {
  const div = document.createElement("div");
  div.className = "live-indicator";
  // 不设置文本内容，保持为空
  updateLiveIndicator();
  return div;
}

// 更新LIVE指示器状态
function updateLiveIndicator() {
  // 更新LIVE指示器状态
  if (liveIndicator) {
    liveIndicator.classList.toggle("active", isRealtimeSync);
  }

  // 更新LIVE按钮状态 - 非live模式时变灰
  if (typeof liveButton !== "undefined") {
    // 移除可能的样式类
    liveButton.classList.remove("active", "inactive");

    if (isRealtimeSync) {
      // 实时模式：恢复活跃状态
      liveButton.classList.add("active");
      liveButton.style.color = "#4CAF50"; // 绿色
      liveButton.style.textShadow = "0 0 15px rgba(76, 175, 80, 0.7)";
    } else {
      // 非实时模式：变灰
      liveButton.classList.add("inactive");
      liveButton.style.color = "#888"; // 灰色
      liveButton.style.textShadow = "none";
    }
  }
}

// 更新实时同步UI状态
function updateRealtimeSyncUI() {
  // 更新速度显示
  if (speedDisplay) {
    speedDisplay.classList.toggle("realtime-sync-active", isRealtimeSync);
    if (isRealtimeSync) {
      speedDisplay.title = "实时时间同步已启用";
    } else {
      // 恢复原始的title属性
      updateDisplay();
    }
  }

  // 更新时间显示和LIVE指示器
  updateTimeDisplay(new Date());
  updateLiveIndicator();
}

/**
 * 重置时间控制器到初始状态（静止）
 */
export function resetTimeController() {
  currentIndex = 28; // 重置到静止点
  isPlaying = true;

  // 更新UI组件
  if (speedSlider) speedSlider.value = currentIndex;
  if (playPauseBtn) {
    playPauseBtn.innerHTML = "❚❚";
    playPauseBtn.title = "暂停时间流动";
  }

  updateDisplay();

  // 触发事件通知
  const events = timeControllerEvents;
  if (events.onPlayPause) events.onPlayPause(isPlaying);
  if (events.onSpeedChange) events.onSpeedChange(getTimeScale());
}

/**
 * 手动设置播放状态
 * @param {boolean} playing - 播放状态（true为播放，false为暂停）
 */
export function setPlaying(playing) {
  if (isPlaying === playing) return; // 状态未改变，无需更新

  isPlaying = playing;

  // 更新播放/暂停按钮UI
  if (playPauseBtn) {
    playPauseBtn.innerHTML = isPlaying ? "❚❚" : "▶";
    playPauseBtn.title = isPlaying ? "暂停时间流动" : "开始时间流动";
  }

  // 触发播放状态变化事件
  if (timeControllerEvents.onPlayPause) {
    timeControllerEvents.onPlayPause(isPlaying);
  }
}

/**
 * 手动设置时间速度档位
 * @param {number} index - 档位索引（需在0到timePresets.length-1范围内）
 */
export function setTimePresetIndex(index) {
  // 参数验证：检查索引是否有效
  if (index < 0 || index >= timePresets.length) return;

  // 更新当前索引并同步滑块位置
  currentIndex = index;
  if (speedSlider) speedSlider.value = currentIndex;

  // 更新显示并触发速度变化事件
  updateDisplay();
  if (timeControllerEvents.onSpeedChange) {
    timeControllerEvents.onSpeedChange(getTimeScale());
  }
}
