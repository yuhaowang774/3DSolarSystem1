// planetInfoHandler.js
import { planetData } from "./dats.js";

// 获取DOM元素（新增拉出按钮）
const infoPanel = document.getElementById("planet-info-panel");
const infoContent = infoPanel.querySelector(".info-content");
const collapseBtn = infoPanel.querySelector(".collapse-btn");
const pullOutBtn = document.getElementById("pull-out-btn"); // 拉出按钮

// 存储当前显示模式（基本信息/详细信息）
let currentDisplayMode = "basic"; // "basic" 或 "detailed"
let currentPlanetName = "";

// 初始化面板事件
function initPanelEvents() {
  // 1. 点击收起按钮 → 收回面板
  collapseBtn.addEventListener("click", () => {
    infoPanel.classList.remove("active");
  });

  // 2. 点击拉出按钮 → 展开面板
  pullOutBtn.addEventListener("click", () => {
    infoPanel.classList.add("active");
  });
}

// 显示星球信息（移除关闭按钮相关代码）
export function showPlanetInfo(planetName) {
  const planet = planetData[planetName];
  if (!planet) return;

  const {
    semiMajorAxis,
    eccentricity,
    orbitalInclination,
    rotationPeriod,
    colorHex,
  } = formatData(planet);

  // 动态生成信息面板内容（删除<button class="close-btn">相关代码）
  // 动态生成信息面板内容（删除<button class="close-btn">相关代码）
  infoContent.innerHTML = `
    <h2>${planet.name.toUpperCase()}</h2>
    
    <!-- 星球描述 -->
    ${
      planet.description
        ? `
      <p class="description"><strong>简介：</strong>${planet.description}</p>
    `
        : ""
    }

    <!-- 基础信息区 -->
    <div class="info-section">
      <h3>基础信息</h3>
      <p><strong>半径：</strong>${
        planet.radius ? `${planet.radius} × 10,000 KM` : "未知"
      }</p>
      <p><strong>自转周期：</strong>${rotationPeriod}</p>
      <p><strong>颜色：</strong>
        <span style="display:inline-block;width:16px;height:16px;background:${colorHex};vertical-align:middle;margin-left:5px;"></span>
        ${colorHex}
      </p>
    </div>

    <!-- 轨道参数区（仅行星显示） -->
    ${
      planet.a
        ? `
      <div class="info-section">
        <h3>轨道参数</h3>
        <p><strong>半长轴：</strong>${semiMajorAxis}</p>
        <p><strong>偏心率：</strong>${eccentricity}</p>
        <p><strong>轨道倾角：</strong>${orbitalInclination}</p>
      </div>
    `
        : ""
    }

    <!-- 特殊信息 -->
    ${
      planet.centralPlanet
        ? `<p><strong>所属行星：</strong>${planet.centralPlanet}</p>`
        : ""
    }
    ${
      planet.ringName
        ? `<p><strong>光环：</strong>存在（${planet.ringName}）</p>`
        : ""
    }
    
    <!-- 更多信息按钮 -->
    <button id="more-info-btn" class="more-info-btn">查看更多信息</button>
  `;

  // 更新当前星球名称
  currentPlanetName = planetName;
  // 重置显示模式
  currentDisplayMode = "basic";

  // 添加更多信息按钮事件监听
  const moreInfoBtn = document.getElementById("more-info-btn");
  if (moreInfoBtn) {
    moreInfoBtn.addEventListener("click", () => {
      toggleDetailedInfo(currentPlanetName);
    });
  }

  // 显示面板
  infoPanel.classList.add("active");
}

// 切换显示详细信息
export function toggleDetailedInfo(planetName) {
  const planet = planetData[planetName];
  if (!planet) return;
  
  // 切换显示模式
  currentDisplayMode = currentDisplayMode === "basic" ? "detailed" : "basic";
  
  if (currentDisplayMode === "detailed") {
    // 显示详细信息
    showDetailedInfo(planet);
    // 添加内部全屏类
    infoPanel.classList.add("fullscreen");
  } else {
    // 移除内部全屏类
    infoPanel.classList.remove("fullscreen");
    // 显示基本信息
    showPlanetInfo(planetName);
  }
}

// 注意：移除了浏览器全屏API调用，改为通过CSS类控制信息面板内部全屏效果

// 存储当前激活的标签页
let activeTab = 'physical';

// 显示详细信息 - 添加标签页功能
function showDetailedInfo(planet) {
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
    notableFeatures
  } = formatDetailedData(planet);

  // 初始化标签页结构
  infoContent.innerHTML = `
    <h2>${planet.name.toUpperCase()} - 详细信息</h2>
    
    <!-- 星球描述 -->
    ${planet.description
      ? `
      <p class="description"><strong>简介：</strong>${planet.description}</p>
    `
      : ""}
    
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
      
      <!-- 标签页内容 -->
      <div class="info-tabs-content">
        <!-- 物理特性标签页 -->
        <div class="info-tab-content" id="tab-physical">
          <div class="info-section">
            <p><strong>半径：</strong>${planet.radius ? `${planet.radius} × 10,000 KM` : "未知"}</p>
            <p><strong>质量：</strong>${mass}</p>
            <p><strong>密度：</strong>${density}</p>
            <p><strong>重力：</strong>${gravity}</p>
            <p><strong>逃逸速度：</strong>${escapeVelocity}</p>
            <p><strong>表面温度：</strong>${temperature}</p>
            <p><strong>反照率：</strong>${albedo}</p>
            <p><strong>颜色：</strong>
              <span style="display:inline-block;width:16px;height:16px;background:${colorHex};vertical-align:middle;margin-left:5px;"></span>
              ${colorHex}
            </p>
          </div>
          
          ${atmosphere
            ? `
            <div class="info-section">
              <h4>大气成分</h4>
              <p>${atmosphere}</p>
            </div>
          `
            : ""}
          
          ${notableFeatures
            ? `
            <div class="info-section">
              <h4>显著特征</h4>
              <p>${notableFeatures}</p>
            </div>
          `
            : ""}
        </div>
        
        <!-- 轨道参数标签页 -->
        <div class="info-tab-content" id="tab-orbital">
          ${planet.a
            ? `
            <div class="info-section">
              <p><strong>半长轴：</strong>${semiMajorAxis}</p>
              <p><strong>偏心率：</strong>${eccentricity}</p>
              <p><strong>轨道倾角：</strong>${orbitalInclination}</p>
              <p><strong>公转周期：</strong>${orbitalPeriod}</p>
              <p><strong>平近点角：</strong>${meanAnomaly}</p>
              <p><strong>朔望周期：</strong>${synodicPeriod}</p>
            </div>
          `
            : "<p>无轨道参数（中心天体）</p>"}
        </div>
        
        <!-- 自转信息标签页 -->
        <div class="info-tab-content" id="tab-rotation">
          <div class="info-section">
            <p><strong>自转周期：</strong>${rotationPeriod}</p>
            <p><strong>轴倾角：</strong>${planet.inc ? `${planet.inc}°` : "未知"}</p>
            <p><strong>自转方向：</strong>${planet.dir === 0 ? "顺时针" : "逆时针"}</p>
          </div>
        </div>
        
        <!-- 卫星信息标签页 -->
        <div class="info-tab-content" id="tab-moons">
          ${moons
            ? `
            <div class="info-section">
              <p>${moons}</p>
            </div>
          `
            : planet.centralPlanet
            ? `<p><strong>所属行星：</strong>${planet.centralPlanet}</p>`
            : "<p>无卫星</p>"}
          
          ${planet.ringName
            ? `
            <div class="info-section">
              <h4>光环系统</h4>
              <p><strong>光环名称：</strong>${planet.ringName}</p>
              <p><strong>内半径：</strong>${planet.innerRing ? `${planet.innerRing} × 行星半径` : "未知"}</p>
              <p><strong>外半径：</strong>${planet.outerRing ? `${planet.outerRing} × 行星半径` : "未知"}</p>
            </div>
          `
            : ""}
        </div>
        
        <!-- 历史发现标签页 -->
        <div class="info-tab-content" id="tab-discovery">
          ${discoveryInfo
            ? `
            <div class="info-section">
              <p>${discoveryInfo}</p>
            </div>
          `
            : "<p>暂无发现信息</p>"}
            
          ${planet.discoveryHistory
            ? `
            <div class="info-section">
              <h4>发现历史</h4>
              <p>${planet.discoveryHistory}</p>
            </div>
          `
            : ""}
        </div>
        
        <!-- 神话背景标签页 -->
        <div class="info-tab-content" id="tab-mythology">
          <div class="info-section">
            <p>${planet.mythBackground || "暂无神话背景资料"}</p>
          </div>
        </div>
        
        <!-- 探测历史标签页 -->
        <div class="info-tab-content" id="tab-exploration">
          ${planet.explorationHistory
            ? `
            <div class="info-section">
              <p>${planet.explorationHistory}</p>
            </div>
          `
            : "<p>暂无探测历史资料</p>"}
            
          <!-- 特定天体的额外信息 -->
          ${planet.name === 'mars' && planet.futureColonization
            ? `
            <div class="info-section">
              <h4>未来殖民</h4>
              <p>${planet.futureColonization}</p>
            </div>
          `
            : ""}
            
          ${planet.name === 'moon' && planet.lunarExploration
            ? `
            <div class="info-section">
              <h4>月球探索</h4>
              <p>${planet.lunarExploration}</p>
            </div>
          `
            : ""}
            
          ${planet.name === 'moon' && planet.earthInteraction
            ? `
            <div class="info-section">
              <h4>与地球的相互作用</h4>
              <p>${planet.earthInteraction}</p>
            </div>
          `
            : ""}
            
          ${planet.name === 'neptune' && planet.extremeWeather
            ? `
            <div class="info-section">
              <h4>极端天气</h4>
              <p>${planet.extremeWeather}</p>
            </div>
          `
            : ""}
            
          ${planet.name === 'uranus' && planet.uniqueTilt
            ? `
            <div class="info-section">
              <h4>独特的倾斜</h4>
              <p>${planet.uniqueTilt}</p>
            </div>
          `
            : ""}
            
          ${planet.name === 'saturn' && planet.ringSystem
            ? `
            <div class="info-section">
              <h4>光环系统</h4>
              <p>${planet.ringSystem}</p>
            </div>
          `
            : ""}
            
          ${planet.name === 'earth' && planet.lifeForms
            ? `
            <div class="info-section">
              <h4>生命形式</h4>
              <p>${planet.lifeForms}</p>
            </div>
          `
            : ""}
        </div>
      </div>
    </div>
    
    <!-- 返回到基本信息按钮 -->
    <button id="less-info-btn" class="more-info-btn">返回基本信息</button>
  `;
  
  // 设置默认激活的标签页
  activateTab(activeTab);
  
  // 添加标签页切换事件
  document.querySelectorAll('.info-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      activateTab(tabId);
    });
  });
  
  // 添加返回基本信息按钮事件监听
  const lessInfoBtn = document.getElementById("less-info-btn");
  if (lessInfoBtn) {
    lessInfoBtn.addEventListener("click", () => {
      toggleDetailedInfo(currentPlanetName);
    });
  }
}

// 激活指定标签页
function activateTab(tabId) {
  // 更新当前激活的标签页
  activeTab = tabId;
  
  // 隐藏所有标签页内容
  document.querySelectorAll('.info-tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // 移除所有标签按钮的激活状态
  document.querySelectorAll('.info-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // 激活指定的标签页和按钮
  const tabContent = document.getElementById(`tab-${tabId}`);
  const tabButton = document.querySelector(`.info-tab-btn[data-tab="${tabId}"]`);
  
  if (tabContent) {
    tabContent.classList.add('active');
  }
  
  if (tabButton) {
    tabButton.classList.add('active');
  }
}

// 隐藏信息面板（保留，用于其他场景调用）
export function hidePlanetInfo() {
  infoPanel.classList.remove("active");
}

  // 绑定标签点击事件（不变）
export function initPlanetLabelClick(iconDiv, name) {
  iconDiv.addEventListener("click", () => {
    showPlanetInfo(name);
  });
}

// 数据格式化工具函数（不变）
function formatData(planet) {
  const semiMajorAxis = planet.a ? `${planet.a[0].toFixed(4)} AU` : "未知";
  const eccentricity = planet.e ? planet.e[0].toFixed(4) : "未知";
  const orbitalInclination = planet.I ? `${planet.I[0].toFixed(2)}°` : "未知";
  const rotationPeriod = planet.day
    ? planet.day > 0
      ? `${planet.day.toFixed(2)} 小时`
      : `${Math.abs(planet.day).toFixed(2)} 小时（逆向自转）`
    : "未知";
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

// 详细数据格式化工具函数
function formatDetailedData(planet) {
  // 复用基础格式化
  const basicData = formatData(planet);
  
  // 计算轨道周期（如果有轨道参数）
  let orbitalPeriod = "未知";
  if (planet.a) {
    // 开普勒第三定律：P² = a³，单位：年
    const a = planet.a[0]; // 半长轴（AU）
    orbitalPeriod = `${Math.sqrt(a * a * a).toFixed(2)} 年`;
  }
  
  // 格式化其他详细信息
  const meanAnomaly = planet.meanAnomaly ? `${planet.meanAnomaly}°` : "未知";
  const synodicPeriod = planet.synodicPeriod ? `${planet.synodicPeriod.toFixed(2)} 天` : "未知";
  const albedo = planet.albedo ? `${planet.albedo.toFixed(2)}` : "未知";
  const gravity = planet.gravity ? `${planet.gravity.toFixed(2)} m/s²` : "未知";
  const temperature = planet.temperature ? `${planet.temperature}°C` : "未知";
  const mass = planet.mass ? `${planet.mass} × 10²⁴ kg` : "未知";
  const density = planet.density ? `${planet.density.toFixed(2)} g/cm³` : "未知";
  const escapeVelocity = planet.escapeVelocity ? `${planet.escapeVelocity.toFixed(1)} km/s` : "未知";
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
    notableFeatures
  };
}

// 初始化函数（页面加载时执行）
function init() {
  initPanelEvents();
  showPlanetInfo("sun"); // 假设太阳在planetData中的键名为'sun'
}

// 启动初始化
init();
