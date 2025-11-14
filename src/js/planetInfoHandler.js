// planetInfoHandler.js
import { planetData } from "./dats.js";

// 获取DOM元素（新增拉出按钮）
const infoPanel = document.getElementById("planet-info-panel");
const infoContent = infoPanel.querySelector(".info-content");
const collapseBtn = infoPanel.querySelector(".collapse-btn");
const pullOutBtn = document.getElementById("pull-out-btn"); // 拉出按钮

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
  `;

  // 显示面板
  infoPanel.classList.add("active");
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

// 初始化函数（页面加载时执行）
function init() {
  initPanelEvents();
}

// 启动初始化
init();
