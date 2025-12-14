// planetInfoHandler.js - 星球信息面板管理模块
import { planetData } from "./dats.js";

// DOM元素引用
const infoPanel = document.getElementById("planet-info-panel");
const infoContent = infoPanel.querySelector(".info-content");
const collapseBtn = infoPanel.querySelector(".collapse-btn");
const pullOutBtn = document.getElementById("pull-out-btn"); // 面板展开按钮

// 状态管理
let currentDisplayMode = "basic"; // 当前显示模式: "basic"(基本信息) 或 "detailed"(详细信息)
let currentPlanetName = ""; // 当前显示的星球名称

/**
 * 初始化面板交互事件
 */
function initPanelEvents() {
  // 点击收起按钮 - 隐藏信息面板
  collapseBtn.addEventListener("click", () => {
    infoPanel.classList.remove("active");
  });

  // 点击拉出按钮 - 展开面板并默认显示太阳信息
  pullOutBtn.addEventListener("click", () => {
    infoPanel.classList.add("active");
    showPlanetInfo("sun"); // 默认显示太阳信息
  });
}

/**
 * 显示指定星球的基本信息
 * @param {string} planetName - 星球名称标识符
 */
export function showPlanetInfo(planetName) {
  const planet = planetData[planetName];
  if (!planet) return;

  // 获取格式化后的星球数据
  const {
    semiMajorAxis,
    eccentricity,
    orbitalInclination,
    rotationPeriod,
    colorHex,
  } = formatData(planet);

  // 生成基本信息面板HTML内容
  infoContent.innerHTML = `
    <h2>${planet.name.toUpperCase()}</h2>
    
    <!-- 星球描述 -->
    ${
      planet.description
        ? `
      <div class="info-section">
        <h3>星球概述</h3>
        <p class="description">${planet.description}</p>
      </div>
    `
        : ""
    }

    <!-- 基础信息区 -->
    <div class="info-section">
      <h3>基础信息</h3>
      <p><strong>半径：</strong><span>${
        planet.radius ? `${planet.radius} × 10,000 KM` : "未知"
      }</span></p>
      <p><strong>自转周期：</strong><span>${rotationPeriod}</span></p>
      <p><strong>颜色：</strong><span>
        <span style="display:inline-block;width:1.6rem;height:1.6rem;background:${colorHex};vertical-align:middle;margin-left:0.5rem;border:1px solid rgba(255,255,255,0.3);border-radius:3px;"></span>
        ${colorHex}
      </span></p>
    </div>

    <!-- 轨道参数区（仅行星显示） -->
    ${
      planet.a
        ? `
      <div class="info-section">
        <h3>轨道参数</h3>
        <p><strong>半长轴：</strong><span>${semiMajorAxis}</span></p>
        <p><strong>偏心率：</strong><span>${eccentricity}</span></p>
        <p><strong>轨道倾角：</strong><span>${orbitalInclination}</span></p>
      </div>
    `
        : ""
    }

    <!-- 特殊信息 -->
    ${
      planet.centralPlanet || planet.ringName
        ? `
      <div class="info-section">
        <h3>特殊特征</h3>
        ${
          planet.centralPlanet
            ? `<p><strong>所属行星：</strong><span>${planet.centralPlanet}</span></p>`
            : ""
        }
        ${
          planet.ringName
            ? `<p><strong>光环系统：</strong><span>存在（${planet.ringName}）</span></p>`
            : ""
        }
      </div>
    `
        : ""
    }
    
    <!-- 查看详细信息按钮 -->
    <button id="more-info-btn" class="more-info-btn">查看更多信息</button>
  `;

  // 更新状态
  currentPlanetName = planetName;
  currentDisplayMode = "basic";

  // 添加查看详细信息按钮的事件监听
  document.getElementById("more-info-btn").addEventListener("click", () => {
    toggleDetailedInfo(currentPlanetName);
  });

  // 确保面板可见
  infoPanel.classList.add("active");
}

/**
 * 切换星球信息的显示模式（基本信息/详细信息）
 * @param {string} planetName - 星球名称标识符
 */
export function toggleDetailedInfo(planetName) {
  const planet = planetData[planetName];
  if (!planet) return;

  // 切换显示模式
  currentDisplayMode = currentDisplayMode === "basic" ? "detailed" : "basic";

  if (currentDisplayMode === "detailed") {
    // 显示详细信息
    showDetailedInfo(planet);
    infoPanel.classList.add("fullscreen"); // 添加全屏样式类
  } else {
    // 恢复基本信息显示
    infoPanel.classList.remove("fullscreen"); // 移除全屏样式类
    showPlanetInfo(planetName);
  }
}

// 当前激活的详情标签页ID
let activeTab = "physical";

/**
 * 显示星球的详细信息标签页界面
 * @param {Object} planet - 星球数据对象
 */
function showDetailedInfo(planet) {
  // 获取格式化后的详细数据
  const {
    semiMajorAxis,
    eccentricity,
    orbitalInclination,
    rotationPeriod,
    colorHex,
    orbitalPeriod,
    meanAnomaly,
    synodicPeriod,
    albedo,
    gravity,
    temperature,
    mass,
    density,
    escapeVelocity,
    atmosphere,
    moons,
    discoveryInfo,
    notableFeatures,
  } = formatDetailedData(planet);

  // 生成详细信息标签页HTML结构
  infoContent.innerHTML = `
    <h2>${planet.name.toUpperCase()} - 详细信息</h2>
    
    <!-- 星球描述 -->
    ${
      planet.description
        ? `
      <div class="info-section">
        <h3>星球概述</h3>
        <p class="description">${planet.description}</p>
      </div>
    `
        : ""
    }
    
    <!-- 标签页容器 -->
    <div class="info-tabs-container">
      <!-- 标签页导航 -->
      <div class="info-tabs-nav">
        <button class="info-tab-btn" data-tab="physical">物理特性</button>
        <button class="info-tab-btn" data-tab="orbital">轨道参数</button>
        <button class="info-tab-btn" data-tab="rotation">自转信息</button>
        <button class="info-tab-btn" data-tab="moons">卫星信息</button>
        <button class="info-tab-btn" data-tab="discovery">历史发现</button>
        <button class="info-tab-btn" data-tab="mythology">神话背景</button>
        <button class="info-tab-btn" data-tab="exploration">探测历史</button>
      </div>
      
      <!-- 标签页内容区域 -->
      <div class="info-tabs-content">
        <!-- 物理特性标签页 -->
        <div class="info-tab-content" id="tab-physical">
          <div class="info-section">
            <h4>基本物理参数</h4>
            <p><strong>半径：</strong><span>${
              planet.radius ? `${planet.radius} × 10,000 KM` : "未知"
            }</span></p>
            <p><strong>质量：</strong><span>${mass}</span></p>
            <p><strong>密度：</strong><span>${density}</span></p>
            <p><strong>重力：</strong><span>${gravity}</span></p>
            <p><strong>逃逸速度：</strong><span>${escapeVelocity}</span></p>
            <p><strong>表面温度：</strong><span>${temperature}</span></p>
            <p><strong>反照率：</strong><span>${albedo}</span></p>
            <p><strong>颜色：</strong><span>
              <span style="display:inline-block;width:1.6rem;height:1.6rem;background:${colorHex};vertical-align:middle;margin-left:0.5rem;border:1px solid rgba(255,255,255,0.3);border-radius:3px;"></span>
              ${colorHex}
            </span></p>
          </div>
          
          ${
            atmosphere
              ? `
            <div class="info-section">
              <h4>大气成分</h4>
              <div class="info-detail">${atmosphere}</div>
            </div>
          `
              : ""
          }
          
          ${
            notableFeatures
              ? `
            <div class="info-section">
              <h4>显著特征</h4>
              <div class="info-detail">${notableFeatures}</div>
            </div>
          `
              : ""
          }
        </div>
        
        <!-- 轨道参数标签页 -->
        <div class="info-tab-content" id="tab-orbital">
          ${
            planet.a
              ? `
            <div class="info-section">
              <h4>轨道参数</h4>
              <p><strong>半长轴：</strong><span>${semiMajorAxis}</span></p>
              <p><strong>偏心率：</strong><span>${eccentricity}</span></p>
              <p><strong>轨道倾角：</strong><span>${orbitalInclination}</span></p>
              <p><strong>公转周期：</strong><span>${orbitalPeriod}</span></p>
              <p><strong>平近点角：</strong><span>${meanAnomaly}</span></p>
              <p><strong>朔望周期：</strong><span>${synodicPeriod}</span></p>
            </div>
          `
              : `<div class="info-section"><p class="info-notice">无轨道参数（中心天体）</p></div>`
          }
        </div>
        
        <!-- 自转信息标签页 -->
        <div class="info-tab-content" id="tab-rotation">
          <div class="info-section">
            <h4>自转参数</h4>
            <p><strong>自转周期：</strong><span>${rotationPeriod}</span></p>
            <p><strong>轴倾角：</strong><span>${
              planet.inc ? `${planet.inc}°` : "未知"
            }</span></p>
            <p><strong>自转方向：</strong><span>${
              planet.dir === 0 ? "顺时针" : "逆时针"
            }</span></p>
          </div>
        </div>
        
        <!-- 卫星信息标签页 -->
        <div class="info-tab-content" id="tab-moons">
          ${
            moons
              ? `
            <div class="info-section">
              <h4>卫星系统</h4>
              <div class="info-detail">${moons}</div>
            </div>
          `
              : planet.centralPlanet
              ? `<div class="info-section"><p><strong>所属行星：</strong><span>${planet.centralPlanet}</span></p></div>`
              : `<div class="info-section"><p class="info-notice">无卫星</p></div>`
          }
          
          ${
            planet.ringName
              ? `
            <div class="info-section">
              <h4>光环系统</h4>
              <p><strong>光环名称：</strong><span>${planet.ringName}</span></p>
              <p><strong>内半径：</strong><span>${
                planet.innerRing ? `${planet.innerRing} × 行星半径` : "未知"
              }</span></p>
              <p><strong>外半径：</strong><span>${
                planet.outerRing ? `${planet.outerRing} × 行星半径` : "未知"
              }</span></p>
            </div>
          `
              : ""
          }
        </div>
        
        <!-- 历史发现标签页 -->
        <div class="info-tab-content" id="tab-discovery">
          ${
            discoveryInfo
              ? `
            <div class="info-section">
              <h4>发现概况</h4>
              <div class="info-detail">${discoveryInfo}</div>
            </div>
          `
              : `<div class="info-section"><p class="info-notice">暂无发现信息</p></div>`
          }
            
          ${
            planet.discoveryHistory
              ? `
            <div class="info-section">
              <h4>发现历史</h4>
              <div class="info-detail">${planet.discoveryHistory}</div>
            </div>
          `
              : ""
          }
        </div>
        
        <!-- 神话背景标签页 -->
        <div class="info-tab-content" id="tab-mythology">
          <div class="info-section">
            <h4>神话背景</h4>
            <div class="info-detail">${
              planet.mythBackground || "暂无神话背景资料"
            }</div>
          </div>
        </div>
        
        <!-- 探测历史标签页 -->
        <div class="info-tab-content" id="tab-exploration">
          ${
            planet.explorationHistory
              ? `
            <div class="info-section">
              <h4>探测历史</h4>
              <div class="info-detail">${planet.explorationHistory}</div>
            </div>
          `
              : `<div class="info-section"><p class="info-notice">暂无探测历史资料</p></div>`
          }
            
          <!-- 特定天体的额外信息 -->
        ${generatePlanetSpecificInfo(planet)}
        </div>
      </div>
    </div>
    
    <!-- 返回基本信息按钮 -->
    <button id="less-info-btn" class="more-info-btn">
      <span class="btn-arrow">←</span>
      <span class="btn-text">返回基本信息</span>
    </button>
  `;

  // 激活默认标签页
  activateTab(activeTab);

  // 绑定标签页切换事件
  document.querySelectorAll(".info-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      activateTab(tabId);
    });
  });

  // 绑定返回基本信息按钮事件
  document.getElementById("less-info-btn").addEventListener("click", () => {
    toggleDetailedInfo(currentPlanetName);
  });
}

/**
 * 激活指定的详情标签页
 * @param {string} tabId - 标签页ID
 */
function activateTab(tabId) {
  // 更新当前激活的标签页
  activeTab = tabId;

  // 重置所有标签页状态
  document.querySelectorAll(".info-tab-content").forEach((content) => {
    content.classList.remove("active");
  });
  document.querySelectorAll(".info-tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  // 激活指定的标签页和按钮
  const tabContent = document.getElementById(`tab-${tabId}`);
  const tabButton = document.querySelector(
    `.info-tab-btn[data-tab="${tabId}"]`
  );

  if (tabContent) tabContent.classList.add("active");
  if (tabButton) tabButton.classList.add("active");
}

/**
 * 隐藏星球信息面板
 * 供外部模块调用以手动关闭信息面板
 */
export function hidePlanetInfo() {
  infoPanel.classList.remove("active");
}

/**
 * 初始化星球标签点击事件
 * @param {HTMLElement} iconDiv - 星球标签DOM元素
 * @param {string} name - 星球名称标识符
 */
export function initPlanetLabelClick(iconDiv, name) {
  // 鼠标点击事件
  iconDiv.addEventListener("click", () => {
    showPlanetInfo(name);
  });

  // 触屏设备支持 - 防止触发鼠标事件重复处理
  iconDiv.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault(); // 阻止触摸事件的默认行为和后续鼠标事件
      showPlanetInfo(name);
    },
    { passive: false }
  );
}

/**
 * 格式化星球基本数据
 * @param {Object} planet - 原始星球数据
 * @returns {Object} 格式化后的基本数据
 */
function formatData(planet) {
  // 格式化轨道参数
  const semiMajorAxis = planet.a ? `${planet.a[0].toFixed(4)} AU` : "未知";
  const eccentricity = planet.e ? planet.e[0].toFixed(4) : "未知";
  const orbitalInclination = planet.I ? `${planet.I[0].toFixed(2)}°` : "未知";

  // 格式化自转周期
  const rotationPeriod = planet.day
    ? planet.day > 0
      ? `${planet.day.toFixed(2)} 小时`
      : `${Math.abs(planet.day).toFixed(2)} 小时（逆向自转）`
    : "未知";

  // 格式化颜色值
  const colorHex = planet.color
    ? `#${planet.color.toString(16).padStart(6, "0")}`
    : "未知";

  return {
    semiMajorAxis,
    eccentricity,
    orbitalInclination,
    rotationPeriod,
    colorHex,
  };
}

/**
 * 格式化星球详细数据
 * @param {Object} planet - 原始星球数据
 * @returns {Object} 格式化后的详细数据
 */
function formatDetailedData(planet) {
  // 复用基础格式化数据
  const basicData = formatData(planet);

  // 计算轨道周期（使用开普勒第三定律：P² = a³）
  let orbitalPeriod = "未知";
  if (planet.a) {
    const a = planet.a[0]; // 半长轴（AU）
    orbitalPeriod = `${Math.sqrt(a * a * a).toFixed(2)} 年`;
  }

  // 格式化详细物理和轨道参数
  const meanAnomaly = planet.meanAnomaly ? `${planet.meanAnomaly}°` : "未知";
  const synodicPeriod = planet.synodicPeriod
    ? `${planet.synodicPeriod.toFixed(2)} 天`
    : "未知";
  const albedo = planet.albedo ? `${planet.albedo.toFixed(2)}` : "未知";
  const gravity = planet.gravity ? `${planet.gravity.toFixed(2)} m/s²` : "未知";
  const temperature = planet.temperature ? `${planet.temperature}°C` : "未知";
  const mass = planet.mass ? `${planet.mass} × 10²⁴ kg` : "未知";
  const density = planet.density
    ? `${planet.density.toFixed(2)} g/cm³`
    : "未知";
  const escapeVelocity = planet.escapeVelocity
    ? `${planet.escapeVelocity.toFixed(1)} km/s`
    : "未知";

  // 其他特性信息
  const atmosphere = planet.atmosphere || "";
  const moons = planet.moons || "";
  const discoveryInfo = planet.discoveryInfo || "";
  const notableFeatures = planet.notableFeatures || "";

  return {
    ...basicData,
    orbitalPeriod,
    meanAnomaly,
    synodicPeriod,
    albedo,
    gravity,
    temperature,
    mass,
    density,
    escapeVelocity,
    atmosphere,
    moons,
    discoveryInfo,
    notableFeatures,
  };
}

/**
 * 生成特定星球的额外信息HTML
 * @param {Object} planet - 星球数据对象
 * @returns {string} 生成的HTML字符串
 */
function generatePlanetSpecificInfo(planet) {
  const { name } = planet;
  let specificInfo = "";

  // 火星特殊信息
  if (name === "mars" && planet.futureColonization) {
    specificInfo += `
      <div class="info-section">
        <h4>未来殖民</h4>
        <div class="info-detail">${planet.futureColonization}</div>
      </div>
    `;
  }

  // 月球特殊信息
  if (name === "moon") {
    if (planet.lunarExploration) {
      specificInfo += `
        <div class="info-section">
          <h4>月球探索</h4>
          <div class="info-detail">${planet.lunarExploration}</div>
        </div>
      `;
    }
    if (planet.earthInteraction) {
      specificInfo += `
        <div class="info-section">
          <h4>与地球的相互作用</h4>
          <div class="info-detail">${planet.earthInteraction}</div>
        </div>
      `;
    }
  }

  // 其他行星的特殊信息
  if (name === "neptune" && planet.extremeWeather) {
    specificInfo += `
      <div class="info-section">
        <h4>极端天气</h4>
        <div class="info-detail">${planet.extremeWeather}</div>
      </div>
    `;
  }

  if (name === "uranus" && planet.uniqueTilt) {
    specificInfo += `
      <div class="info-section">
        <h4>独特的倾斜</h4>
        <div class="info-detail">${planet.uniqueTilt}</div>
      </div>
    `;
  }

  if (name === "saturn" && planet.ringSystem) {
    specificInfo += `
      <div class="info-section">
        <h4>光环系统</h4>
        <div class="info-detail">${planet.ringSystem}</div>
      </div>
    `;
  }

  if (name === "earth" && planet.lifeForms) {
    specificInfo += `
      <div class="info-section">
        <h4>生命形式</h4>
        <div class="info-detail">${planet.lifeForms}</div>
      </div>
    `;
  }

  return specificInfo;
}

/**
 * 模块初始化函数
 * 页面加载时自动执行，初始化面板事件
 */
function init() {
  initPanelEvents();
  // 面板默认保持折叠状态，不自动显示任何信息
}

// 自动初始化模块
init();
