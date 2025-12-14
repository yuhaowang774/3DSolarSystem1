// 导入核心模块
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";
import * as dat from "dat.gui";

// 导入工具函数
import {
  getPlanetPosition,
  createOrbit,
  updateOrbitVertices,
  createSprite,
  createSun,
  createPlanet,
  createUniverse,
  createRing,
  createGroup,
  createLocationMarker,
  calculateEarthRotation,
  // 日下点差量校准法
  calculateTrueSubsolarLongitude,
  measureModelSubsolarLongitude,
  performSubsolarCalibration,
} from "./utils.js";

// 导入数据和控制器
import { planetData } from "./dats.js";
import {
  initTimeController,
  calculateTimeStep,
  getRealtimeSyncState,
  updateTimeDisplay,
} from "./timeController.js";
import { initPlanetLabelClick } from "./planetInfoHandler.js";

/**
 * 核心函数：基于日下点差量校准法计算地球初始校准角度
 * 功能：让地球模型初始朝向与现实地球完全同步
 * 核心思路：先测现状、再算目标、最后求差旋转
 * @param {THREE.Mesh} earthMesh - 地球模型（已应用轴倾斜变换）
 * @returns {number} 初始校准角度（弧度）
 */
function calculateEarthInitialRotation(earthMesh) {
  // 1. 使用模拟时间
  const date = simulatedDate;

  // 2. 获取太阳位置（太阳在原点）
  const sunWorldPosition = new THREE.Vector3(0, 0, 0);

  // 3. 执行日下点差量校准
  const calibrationResult = performSubsolarCalibration(
    date,
    earthMesh,
    sunWorldPosition
  );

  // 4. 打印校准调试信息
  console.log("======== 日下点差量校准法 ========");
  console.log("UTC时间:", calibrationResult.debug.utcTime);
  console.log(
    "真实日下点经度（目标）:",
    calibrationResult.debug.trueSubsolarLon.toFixed(2) + "°"
  );
  console.log(
    "模型日下点经度（现状）:",
    calibrationResult.debug.modelSubsolarLon.toFixed(2) + "°"
  );
  console.log(
    "经度差值:",
    calibrationResult.debug.deltaLonDeg.toFixed(2) + "°"
  );
  console.log(
    "校准旋转角度:",
    calibrationResult.debug.calibrationAngleDeg.toFixed(2) + "°"
  );
  console.log("==================================");

  return calibrationResult.calibrationAngle;
}
// -------------------------- 1. 初始化场景、相机、渲染器 --------------------------
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  90,
  window.innerWidth / window.innerHeight,
  0.001,
  10000000000
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  logarithmicDepthBuffer: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0px";
labelRenderer.domElement.style.pointerEvents = "none";
labelRenderer.domElement.style.zIndex = "0.1";
labelRenderer.domElement.style.background = "transparent";
document.body.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.zoomSpeed = 5.0;
controls.smoothZoom = true;
controls.minDistance = 0.001;
controls.maxDistance = 1000000000;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
};
// 添加触屏支持
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN,
};
// 优化触屏体验
controls.enablePan = true;
controls.panSpeed = 1.0;
controls.enableZoom = true;
controls.update();

// 用于阻止页面缩放的函数
function preventPageZoom(event) {
  if (event.touches.length === 2) {
    event.preventDefault();
  }
}

// 监听信息面板的激活状态变化，控制OrbitControls的启用/禁用和页面缩放行为
function updateControlsState() {
  const infoPanel = document.getElementById("planet-info-panel");
  const isPanelActive = infoPanel && infoPanel.classList.contains("active");

  if (isPanelActive) {
    // 当信息面板激活时，保持旋转和缩放功能，只禁用平移功能
    controls.enableRotate = true; // 保持鼠标旋转功能可用
    controls.enablePan = false; // 禁用平移功能
    controls.enableZoom = true; // 保持滚轮缩放功能可用
    // 添加事件监听器阻止浏览器默认的缩放行为
    document.addEventListener("touchstart", preventPageZoom, {
      passive: false,
    });
    document.addEventListener("touchmove", preventPageZoom, { passive: false });
  } else {
    // 当信息面板未激活时，恢复所有OrbitControls功能
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    // 移除阻止缩放的事件监听器
    document.removeEventListener("touchstart", preventPageZoom);
    document.removeEventListener("touchmove", preventPageZoom);
  }
}

// 初始化时检查一次
setTimeout(updateControlsState, 100);

// 监听DOM变化，检测信息面板状态变化
const observer = new MutationObserver(() => {
  updateControlsState();
});

const infoPanel = document.getElementById("planet-info-panel");
if (infoPanel) {
  observer.observe(infoPanel, { attributes: true, attributeFilter: ["class"] });
}
controls.target.set(0, 0, 0);
camera.position.set(139.2 * 100, 69.6 * 100, 139.2 * 100);
// 在相机和渲染器初始化后添加
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(); // 无需实际鼠标位置，仅用于计算
// -------------------------- 新增：初始化时间控制器 --------------------------
initTimeController(); // 在这里调用，确保DOM已准备好

// -------------------------- 2. 初始化光源 --------------------------
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 8, 0, 0.1);
pointLight.position.set(0, 0, 0);
pointLight.castShadow = true;
pointLight.shadow.mapSize.width = 1024;
pointLight.shadow.mapSize.height = 1024;
scene.add(pointLight);

// -------------------------- 3. 存储容器 --------------------------
const planets = {};
const orbits = {};
const celestialGroups = {};
const orbitGroup = new THREE.Group();
scene.add(orbitGroup);

// 模拟时间变量，需要在创建轨道前声明
let simulatedDate = new Date();
let initialSimulatedDate = new Date(simulatedDate.getTime());
// 地球日下点校准相关变量
let earthInitialRotationOffset = 0; // 初始校准角度
let needsInitialCalibration = true; // 是否需要初始校准
let earthInitialBaseRotation = 0; // 初始时刻的自转基准角度

// 控制器选项
const guiOptions = {
  ShowOrbits: true,
};

// 初始化标签渲染器-------------------------- 4. 批量创建天体系统 --------------------------
const celestialNames = [
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "moon",
];

const universe = createUniverse(
  planetData.universe.name,
  planetData.universe.radius
);
const sun = createSun(planetData.sun.name, planetData.sun.radius);

const sunHalo = createSprite("sun-glow");
const sunRadius = sun.geometry.parameters.radius;
sunHalo.scale.set(sunRadius * 1, sunRadius * 1, 1);
sun.add(sunHalo);

scene.add(universe);
scene.add(sun);
// 根据预设的星球数据（planetData）动态创建并组装天体、轨道，并建立它们之间的层级关系
celestialNames.forEach((name) => {
  const data = planetData[name];
  if (!data) return;

  let celestial;
  if (name === "sun") {
    celestial = sun;
  } else {
    celestial = createPlanet(data.name, data.radius);
    planets[name] = celestial;
  }

  const group = createGroup(celestial);
  celestialGroups[name] = group;

  // 使用当前模拟时间创建轨道
  const orbit = createOrbit(name, simulatedDate);
  orbits[name] = orbit;

  // 将轨道添加到相应的组
  if (data.centralPlanet) {
    const parentGroup = celestialGroups[data.centralPlanet];
    if (parentGroup) parentGroup.add(orbit);
  } else {
    orbitGroup.add(orbit);
  }

  if (data.centralPlanet) {
    const parent = celestialGroups[data.centralPlanet];
    if (parent) parent.add(group);
  } else {
    scene.add(group);
  }

  // 北京位置标记已移除
});

// 辅助参考线功能已移除

// -------------------------- 5. 行星环 --------------------------
const ringConfigs = [
  {
    planet: "saturn",
    ringName: planetData.saturn.ringName,
    inner: planetData.saturn.innerRing,
    outer: planetData.saturn.outerRing,
  },
  {
    planet: "uranus",
    ringName: planetData.uranus.ringName,
    inner: planetData.uranus.innerRing,
    outer: planetData.uranus.outerRing,
  },
  {
    planet: "neptune",
    ringName: planetData.neptune.ringName,
    inner: planetData.neptune.innerRing,
    outer: planetData.neptune.outerRing,
  },
];

ringConfigs.forEach((config) => {
  if (celestialGroups[config.planet]) {
    const ring = createRing(config.ringName, config.inner, config.outer);
    celestialGroups[config.planet].add(ring);
  }
});

// -------------------------- 6. 搜索功能 --------------------------
// 创建完整的搜索天体列表，包括所有可用天体
const searchList = [
  {
    name: "sun",
    displayName: "太阳",
    mesh: sun,
    offset: planetData.sun.radius,
    color: planetData.sun.color,
  },
  {
    name: "mercury",
    displayName: "水星",
    mesh: planets.mercury,
    offset: planetData.mercury.radius,
    color: planetData.mercury.color,
  },
  {
    name: "venus",
    displayName: "金星",
    mesh: planets.venus,
    offset: planetData.venus.radius,
    color: planetData.venus.color,
  },
  {
    name: "earth",
    displayName: "地球",
    mesh: planets.earth,
    offset: planetData.earth.radius,
    color: planetData.earth.color,
  },
  {
    name: "moon",
    displayName: "月球",
    mesh: planets.moon,
    offset: planetData.moon.radius,
    color: planetData.moon.color,
  },
  {
    name: "mars",
    displayName: "火星",
    mesh: planets.mars,
    offset: planetData.mars.radius,
    color: planetData.mars.color,
  },
  {
    name: "jupiter",
    displayName: "木星",
    mesh: planets.jupiter,
    offset: planetData.jupiter.radius,
    color: planetData.jupiter.color,
  },
  {
    name: "saturn",
    displayName: "土星",
    mesh: planets.saturn,
    offset: planetData.saturn.radius,
    color: planetData.saturn.color,
  },
  {
    name: "uranus",
    displayName: "天王星",
    mesh: planets.uranus,
    offset: planetData.uranus.radius,
    color: planetData.uranus.color,
  },
  {
    name: "neptune",
    displayName: "海王星",
    mesh: planets.neptune,
    offset: planetData.neptune.radius,
    color: planetData.neptune.color,
  },
].filter((item) => item.mesh);

// 创建搜索容器
const searchContainer = document.createElement("div");
searchContainer.id = "search-container";
searchContainer.style.position = "absolute";
searchContainer.style.top = "20px";
searchContainer.style.left = "50%";
searchContainer.style.transform = "translateX(-50%)";
searchContainer.style.width = "320px";
searchContainer.style.zIndex = "100";
searchContainer.style.fontFamily = "Arial, sans-serif";
searchContainer.style.transition = "all 0.3s ease";
document.body.appendChild(searchContainer);

// 创建搜索输入框
const searchInput = document.createElement("input");
searchInput.type = "text";
searchInput.id = "search-input";
searchInput.placeholder = "搜索天体...";
searchInput.style.width = "100%";
searchInput.style.padding = "14px 18px";
searchInput.style.fontSize = "15px";
searchInput.style.border = "none";
searchInput.style.borderRadius = "12px";
searchInput.style.boxShadow = "0 4px 20px rgba(0,0,0,0.35)";
searchInput.style.background = "rgba(23, 23, 33, 0.9)";
searchInput.style.color = "white";
searchInput.style.outline = "none";
searchInput.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
searchInput.style.boxSizing = "border-box";
searchInput.style.backdropFilter = "blur(8px)";
searchInput.style.border = "1px solid rgba(66, 153, 225, 0.2)";
searchContainer.appendChild(searchInput);

// 创建搜索建议下拉列表
const suggestionsList = document.createElement("div");
// 设置基本属性和样式
Object.assign(suggestionsList, {
  id: "search-suggestions",
  style: {
    position: "absolute",
    top: "100%",
    left: "0",
    width: "100%",
    maxHeight: "200px",
    overflowY: "auto",
    overflowX: "hidden",
    msOverflowStyle: "none", // IE and Edge
    scrollbarWidth: "none", // Firefox
    backgroundColor: "rgba(23, 23, 33, 0.98)",
    borderRadius: "12px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    marginTop: "4px",
    display: "none",
    zIndex: "99",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(66, 153, 225, 0.15)",
  },
});

// 监听鼠标滚轮事件，阻止冒泡到3D场景
suggestionsList.addEventListener(
  "wheel",
  (e) => {
    e.stopPropagation(); // 阻止事件冒泡到背景的3D场景
  },
  { passive: true }
);

searchContainer.appendChild(suggestionsList);

// 输入框聚焦效果
searchInput.addEventListener("focus", () => {
  searchInput.style.boxShadow = "0 4px 16px rgba(66, 153, 225, 0.4)";
  searchInput.style.background = "rgba(30, 30, 45, 0.9)";
  // 如果输入框不为空，显示建议列表
  if (searchInput.value.trim()) {
    showSuggestions(searchInput.value.toLowerCase());
  }
});

// 输入框失焦效果
searchInput.addEventListener("blur", () => {
  searchInput.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  searchInput.style.background = "rgba(23, 23, 33, 0.85)";
  // 延迟隐藏建议列表，以便点击建议项
  setTimeout(() => {
    suggestionsList.style.display = "none";
  }, 200);
});

// 输入事件处理
searchInput.addEventListener("input", () => {
  const query = searchInput.value.toLowerCase();
  if (query.trim()) {
    showSuggestions(query);
  } else {
    suggestionsList.style.display = "none";
  }
});

// 键盘事件处理
searchInput.addEventListener("keydown", (event) => {
  const suggestions = suggestionsList.querySelectorAll(".suggestion-item");
  const activeSuggestion = suggestionsList.querySelector(
    ".suggestion-item.active"
  );

  // 重置建议项样式的辅助函数
  const resetSuggestionStyle = (suggestion) => {
    if (!suggestion) return;
    suggestion.style.backgroundColor = "transparent";
    suggestion.style.transform = "translateX(0)";
    suggestion.style.boxShadow = "none";
    const dot = suggestion.querySelector("span:first-child");
    if (dot) {
      dot.style.transform = "scale(1)";
    }
  };

  // 激活建议项的辅助函数
  const activateSuggestion = (suggestion) => {
    if (!suggestion) return;
    suggestion.classList.add("active");
    suggestion.style.backgroundColor = "rgba(66, 153, 225, 0.3)";
    suggestion.style.transform = "translateX(5px)";
    suggestion.style.boxShadow = "0 2px 8px rgba(66, 153, 225, 0.4)";
    const dot = suggestion.querySelector("span:first-child");
    if (dot) {
      dot.style.transform = "scale(1.2)";
    }
    suggestion.scrollIntoView({ block: "nearest" });
  };

  if (event.key === "Enter") {
    event.preventDefault();
    if (activeSuggestion) {
      activeSuggestion.click();
    } else if (suggestions.length > 0) {
      suggestions[0].click();
    } else {
      // 如果没有建议但有输入，尝试查找精确匹配
      onSearchByQuery(searchInput.value.toLowerCase());
    }
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (suggestions.length > 0) {
      const currentIndex = activeSuggestion
        ? Array.from(suggestions).indexOf(activeSuggestion)
        : event.key === "ArrowDown"
        ? -1
        : suggestions.length;
      const nextIndex =
        event.key === "ArrowDown"
          ? (currentIndex + 1) % suggestions.length
          : (currentIndex - 1 + suggestions.length) % suggestions.length;

      if (activeSuggestion) {
        activeSuggestion.classList.remove("active");
        resetSuggestionStyle(activeSuggestion);
      }

      activateSuggestion(suggestions[nextIndex]);
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    suggestionsList.style.display = "none";
    searchInput.blur();
  }
});

// 保留点击事件处理但移除高亮相关逻辑
window.addEventListener("click", (event) => {
  // 仅保留基本的事件结构，移除高亮相关逻辑
});

// 自动移动状态标志
let isAutoMoving = false;

// 显示搜索建议
function showSuggestions(query) {
  // 清空建议列表
  suggestionsList.innerHTML = "";

  // 查找匹配项
  const matches = searchList.filter(
    (item) =>
      item.name.toLowerCase().includes(query) ||
      item.displayName.toLowerCase().includes(query)
  );

  if (matches.length > 0) {
    // 创建建议项
    matches.forEach((item, index) => {
      const suggestionItem = document.createElement("div");
      suggestionItem.className =
        "suggestion-item" + (index === 0 ? " active" : "");
      suggestionItem.style.padding = "10px 16px";
      suggestionItem.style.cursor = "pointer";
      suggestionItem.style.transition = "all 0.2s ease-out";
      suggestionItem.style.display = "flex";
      suggestionItem.style.alignItems = "center";

      // 创建颜色点
      const colorDot = document.createElement("span");
      const colorHex = item.color
        ? "#" + item.color.toString(16).padStart(6, "0")
        : "#888888";
      colorDot.style.width = "10px";
      colorDot.style.height = "10px";
      colorDot.style.borderRadius = "50%";
      colorDot.style.backgroundColor = colorHex;
      colorDot.style.marginRight = "10px";
      colorDot.style.boxShadow = `0 0 6px ${colorHex}`;
      colorDot.style.transition = "all 0.2s ease";

      // 创建文本内容
      const textContent = document.createElement("div");
      textContent.style.color = "white";
      textContent.style.fontSize = "13px";
      textContent.innerHTML = `
        <div style="font-weight: 600;">${item.displayName}</div>
        <div style="font-size: 11px; color: #aaa; margin-top: 2px;">${item.name}</div>
      `;

      suggestionItem.appendChild(colorDot);
      suggestionItem.appendChild(textContent);

      // 鼠标悬停效果 - 增强版
      suggestionItem.addEventListener(
        "mouseenter",
        (e) => {
          e.stopPropagation(); // 阻止事件冒泡，避免影响星球缩放
          suggestionItem.style.backgroundColor = "rgba(66, 153, 225, 0.3)";
          suggestionItem.style.transform = "translateX(5px)";
          suggestionItem.style.boxShadow = `0 2px 8px rgba(66, 153, 225, 0.4)`;
          colorDot.style.transform = "scale(1.2)";
          colorDot.style.boxShadow = `0 0 8px ${colorHex}, 0 0 12px ${colorHex}`;

          // 移除其他项的激活状态
          suggestionsList.querySelectorAll(".suggestion-item").forEach((s) => {
            s.classList.remove("active");
          });
          suggestionItem.classList.add("active");
        },
        true
      ); // 使用捕获阶段

      suggestionItem.addEventListener(
        "mouseleave",
        (e) => {
          e.stopPropagation(); // 阻止事件冒泡
          suggestionItem.style.backgroundColor = "transparent";
          suggestionItem.style.transform = "translateX(0)";
          suggestionItem.style.boxShadow = "none";
          colorDot.style.transform = "scale(1)";
          colorDot.style.boxShadow = `0 0 6px ${colorHex}`;
        },
        true
      ); // 使用捕获阶段

      // 点击选择建议项 - 添加点击动画
      suggestionItem.addEventListener(
        "click",
        (e) => {
          e.stopPropagation(); // 阻止事件冒泡
          // 点击动画
          suggestionItem.style.transform = "scale(0.95)";
          setTimeout(() => {
            suggestionItem.style.transform = "scale(1)";
            searchAndNavigateTo(item);
          }, 50);
        },
        true
      ); // 使用捕获阶段

      suggestionsList.appendChild(suggestionItem);
    });

    suggestionsList.style.display = "block";
  } else {
    suggestionsList.style.display = "none";
  }
}

// 根据查询搜索并导航到天体
function onSearchByQuery(query) {
  const planet = searchList.find(
    (p) =>
      p.name.toLowerCase() === query || p.displayName.toLowerCase() === query
  );

  if (planet) {
    searchAndNavigateTo(planet);
  }
}

// 清除所有可能存在的高亮效果
function clearAllHighlights() {
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.type === "highlight") {
      if (obj.parent) obj.parent.remove(obj);
    }
  });
}

/**
 * 计算相机距离目标的安全距离
 * @param {Object} planet - 行星对象
 * @returns {number} 计算出的安全距离
 */
const calculateCameraDistance = (planet) => {
  const planetRadius = planet.offset;

  // 固定缩放倍数核心计算
  const fixedScreenDiameter = 500; // 屏幕上显示的星球直径（像素）
  const fovRadians = camera.fov * (Math.PI / 180); // 视场角转弧度

  // 计算固定距离
  const tanHalfFov = Math.tan(fovRadians / 2);
  const fixedDistance =
    (planetRadius * window.innerHeight) / (fixedScreenDiameter * tanHalfFov);

  // 安全距离保障
  const safetyFactor = planetRadius > 10000 ? 1.5 : 1.2;
  const minSafeDistance = planetRadius * safetyFactor;

  return Math.max(fixedDistance, minSafeDistance);
};

/**
 * 搜索并导航到选中的天体
 * @param {Object} planet - 要导航到的天体对象
 */
function searchAndNavigateTo(planet) {
  // 设置输入框的值为天体名称
  searchInput.value = planet.displayName;
  // 隐藏建议列表
  suggestionsList.style.display = "none";

  // 添加选择成功的视觉反馈
  searchInput.style.boxShadow = "0 0 15px #10b981";
  setTimeout(() => {
    searchInput.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  }, 600);

  // 导航到选中的天体
  if (planet.mesh) {
    const targetPosition = new THREE.Vector3();
    planet.mesh.getWorldPosition(targetPosition);

    // 使用与点击标签相同的相机定位逻辑
    selectedCelestial = planet.mesh;

    // 计算相机距离
    const finalDistance = calculateCameraDistance(planet);

    // 设置相机偏移
    cameraOffset.set(0, 0, finalDistance);
    distanceScale = 1;

    // 更新相机位置
    const scaledOffset = cameraOffset
      .clone()
      .multiplyScalar(distanceScale)
      .applyQuaternion(camera.quaternion);

    // 标记为自动移动状态
    isAutoMoving = true;

    // 平滑过渡效果
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const duration = 1000; // 过渡时间（毫秒）
    const startTime = performance.now();

    function animateTransition(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // 使用缓动函数
      const easeProgress = easeOutQuad(progress);

      // 更新相机位置和目标
      camera.position.lerpVectors(
        startPosition,
        targetPosition.clone().add(scaledOffset),
        easeProgress
      );
      controls.target.lerpVectors(startTarget, targetPosition, easeProgress);
      controls.update();

      if (progress < 1) {
        requestAnimationFrame(animateTransition);
      } else {
        // 动画完成后取消自动移动标记
        setTimeout(() => {
          isAutoMoving = false;
        }, 300);
      }
    }

    requestAnimationFrame(animateTransition);
  }
}

// 缓动函数
function easeOutQuad(t) {
  return t * (2 - t);
}

// -------------------------- 7. CSS2D标签和交互功能 --------------------------
// 一次性添加点的样式
const dotStyle = document.createElement("style");
dotStyle.textContent = `
  .planet-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    box-shadow: 0 0 8px currentColor, 0 0 4px #fff;
  }
  .planet-name {
    letter-spacing: 0.5px;
  }
`;
document.head.appendChild(dotStyle);

function addIcon(group, orbit, size, name) {
  if (!group.children[0]) return;

  let mesh = group.children[0];
  const iconDiv = document.createElement("div");
  iconDiv.className = "celestial-label";

  // 获取行星颜色
  const planetColor = planetData[name]?.color || 0xffffff;
  const colorHex = "#" + planetColor.toString(16).padStart(6, "0");

  // 设置HTML内容和基本样式
  iconDiv.innerHTML = `
    <span class="planet-dot" style="background: ${colorHex};"></span>
    <span class="planet-name">${name.toUpperCase()}</span>
  `;

  Object.assign(iconDiv.style, {
    pointerEvents: "auto",
    color: "white",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "12px",
    fontWeight: "600",
    textAlign: "center",
    background: "transparent",
    backdropFilter: "blur(4px)",
    borderRadius: "16px",
    padding: "3px 10px",
    border: "none",
    cursor: "pointer",
    transition: "all 0.3s ease",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.5)",
  });

  // 关键：调用导入的函数，绑定标签点击显示信息的事件
  initPlanetLabelClick(iconDiv, name);

  // 创建通用的点击处理函数
  function handlePlanetClick() {
    // 确保group和子元素存在
    if (!group || !group.children[0]) return;

    selectedCelestial = group.children[0];
    const targetPos = new THREE.Vector3();
    selectedCelestial.getWorldPosition(targetPos);

    // 获取星球半径（增加容错处理）
    const planetName = selectedCelestial.name.toLowerCase();
    const planetDataEntry = planetData[planetName];
    // 容错：如果找不到对应数据，使用默认半径100
    const planetRadius = planetDataEntry?.radius || 100;

    // 固定缩放倍数核心计算
    const fixedScreenDiameter = 500; // 屏幕上显示的星球直径（像素）
    const fovRadians = camera.fov * (Math.PI / 180); // 视场角转弧度

    // 计算固定距离：确保不同半径星球在屏幕上显示大小一致
    // 增加分母为0的防护
    const tanHalfFov = Math.tan(fovRadians / 2);
    const fixedDistance =
      tanHalfFov > 0
        ? (planetRadius * window.innerHeight) /
          (fixedScreenDiameter * tanHalfFov)
        : planetRadius * 10; // 异常时的 fallback 距离

    // 安全距离保障（动态调整安全系数，大型天体增加缓冲）
    const safetyFactor = planetRadius > 10000 ? 1.5 : 1.2; // 大型天体用更高安全系数
    const minSafeDistance = planetRadius * safetyFactor;
    const finalDistance = Math.max(fixedDistance, minSafeDistance);

    // 重置相机偏移和缩放因子
    cameraOffset.set(0, 0, finalDistance); // 沿Z轴偏移
    distanceScale = 1; // 重置缩放因子基准

    // 更新相机位置（增加位置有效性检查）
    if (targetPos && !isNaN(targetPos.x)) {
      const scaledOffset = cameraOffset
        .clone()
        .multiplyScalar(distanceScale)
        .applyQuaternion(camera.quaternion);
      camera.position.copy(targetPos).add(scaledOffset);
      controls.target.copy(targetPos);
      controls.update();
    }
  }

  // 鼠标点击事件
  iconDiv.addEventListener("click", handlePlanetClick);

  // 触屏点击事件
  iconDiv.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault(); // 防止触发鼠标事件
      handlePlanetClick();
    },
    { passive: false }
  );

  if (name !== "sun") {
    // 保存原始颜色
    const originalColor = orbit.material.color.clone();

    // 优化鼠标悬停和离开事件处理
    const updateDotStyle = (dot, width, height, boxShadow) => {
      if (dot) {
        dot.style.width = width;
        dot.style.height = height;
        dot.style.boxShadow = boxShadow;
      }
    };

    iconDiv.addEventListener("mouseover", () => {
      // 高亮轨道颜色：使用更明亮的颜色
      orbit.material.color.copy(originalColor).multiplyScalar(1.5);
      // 增加线宽使轨道更明显
      orbit.material.linewidth = 3.0;
      // 更新标签样式
      Object.assign(iconDiv.style, {
        background: "rgba(0, 0, 0, 0.4)",
        transform: "scale(1.05)",
        boxShadow: `0 4px 12px rgba(0, 0, 0, 0.7), 0 0 15px ${orbit.material.color.getStyle()}`,
      });

      // 更新点的样式
      updateDotStyle(
        iconDiv.querySelector(".planet-dot"),
        "10px",
        "10px",
        `0 0 12px ${orbit.material.color.getStyle()}, 0 0 6px #fff`
      );
    });

    iconDiv.addEventListener("mouseout", () => {
      // 恢复原始颜色和线宽
      orbit.material.color.copy(originalColor);
      orbit.material.linewidth = 1.5;
      // 恢复标签样式
      Object.assign(iconDiv.style, {
        background: "transparent",
        transform: "scale(1)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.5)",
      });

      // 恢复点的样式
      updateDotStyle(
        iconDiv.querySelector(".planet-dot"),
        "8px",
        "8px",
        "0 0 8px currentColor, 0 0 4px #fff"
      );
    });
  } else {
    // 太阳标签特殊处理
    iconDiv.addEventListener("mouseover", () => {
      Object.assign(iconDiv.style, {
        background: "rgba(0, 0, 0, 0.4)",
        transform: "scale(1.05)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.7), 0 0 15px #ffff00",
      });

      // 更新点的样式
      updateDotStyle(
        iconDiv.querySelector(".planet-dot"),
        "10px",
        "10px",
        "0 0 12px #ffff00, 0 0 6px #fff"
      );
    });

    iconDiv.addEventListener("mouseout", () => {
      Object.assign(iconDiv.style, {
        background: "transparent",
        transform: "scale(1)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.5)",
      });

      // 恢复点的样式
      updateDotStyle(
        iconDiv.querySelector(".planet-dot"),
        "8px",
        "8px",
        "0 0 8px currentColor, 0 0 4px #fff"
      );
    });
  }
  // 标签遮挡
  const iconLabel = new CSS2DObject(iconDiv);
  iconLabel.position.set(0, size * 1.5, 0);
  iconLabel.layers.set(0);
  mesh.add(iconLabel);

  // 关键：添加透明度过渡动画（时长0.3秒，缓动效果）
  iconDiv.style.transition = "opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
  iconDiv.style.opacity = "1"; // 初始完全可见

  iconLabel.onBeforeRender = (_, __, camera) => {
    // 1. 获取标签世界坐标
    const labelWorldPos = new THREE.Vector3().setFromMatrixPosition(
      iconLabel.matrixWorld
    );
    // 计算标签到相机的总距离
    const labelDistance = camera.position.distanceTo(labelWorldPos);

    // 2. 射线检测遮挡物
    raycaster.set(
      camera.position,
      labelWorldPos.clone().sub(camera.position).normalize()
    );
    const intersects = raycaster.intersectObjects(
      [...Object.values(planets), sun],
      false
    );

    // 3. 筛选有效的遮挡物（非自身且距离更近）
    const occluders = intersects.filter(
      (intersect) =>
        intersect.object !== mesh && intersect.distance < labelDistance - 0.1 // 0.1是避免边缘闪烁的偏差值
    );

    if (occluders.length > 0) {
      // 4. 找到最近的遮挡物
      const closestOccluder = occluders.sort(
        (a, b) => a.distance - b.distance
      )[0];

      // 5. 计算遮挡比例（0~1）：
      // - 遮挡物越近（距离接近0），比例越接近1（透明度越高）
      // - 遮挡物越远（接近标签距离），比例越接近0（透明度越低）
      const occlusionRatio = 1 - closestOccluder.distance / labelDistance;

      // 6. 限制比例范围（0~1），并计算最终透明度
      // 乘以1.2是为了让遮挡比例达到0.8以上时就完全透明，增强过渡效果
      const clampedRatio = Math.min(1, Math.max(0, occlusionRatio * 1.2));
      iconDiv.style.opacity = (1 - clampedRatio).toString();
    } else {
      // 无遮挡时完全可见
      iconDiv.style.opacity = "1";
    }

    // 优化：完全透明时禁用交互
    iconDiv.style.pointerEvents = iconDiv.style.opacity < 0.1 ? "none" : "auto";
  };
}

// 为天体系统中的各个天体（行星、太阳等）添加图标
Object.keys(celestialGroups).forEach((name) => {
  const group = celestialGroups[name];
  const orbit = orbits[name];
  const data = planetData[name];
  if (group && orbit && data) {
    addIcon(group, orbit, data.radius, name);
  }
});
const sunOrbit = orbits.mercury || orbits.earth || orbits.mars;
if (sunOrbit) {
  addIcon(sun, sunOrbit, planetData.sun.radius, "sun");
}

// -------------------------- 8. DAT.GUI控制面板 --------------------------
// guiOptions变量已在前面声明

// 等待DOM加载完成后初始化控制器
function initGUI() {
  try {
    // 创建dat.GUI控制器
    const gui = new dat.GUI({ autoPlace: false });

    // 设置控制器位置和样式
    const guiContainer = document.createElement("div");
    guiContainer.id = "dat-gui-container";
    guiContainer.style.position = "absolute";
    guiContainer.style.top = "10px";
    guiContainer.style.right = "10px";
    guiContainer.style.zIndex = "1000";
    guiContainer.appendChild(gui.domElement);
    document.body.appendChild(guiContainer);

    // 添加控制选项
    gui
      .add(guiOptions, "ShowOrbits")
      .name("显示轨道")
      .onChange((value) => {
        orbitGroup.visible = value;
      });

    console.log("控制器初始化完成");
  } catch (error) {
    console.error("控制器初始化失败:", error);
  }
}

// 在DOM加载完成后初始化控制器
document.addEventListener("DOMContentLoaded", initGUI);

// -------------------------- 9. 性能优化：视距剔除 --------------------------
function updateVisibility() {
  Object.keys(celestialGroups).forEach((name) => {
    const group = celestialGroups[name];
    const data = planetData[name];
    if (!group || !data) return;

    const groupPosition = new THREE.Vector3();
    group.getWorldPosition(groupPosition);
    const distance = camera.position.distanceTo(groupPosition);
    const sizeRatio = data.radius / planetData.earth.radius;
    const maxVisibleDistance =
      (data.a ? data.a[0] * 200000 : 10000) * sizeRatio;

    const isSelectedOrSatellite =
      selectedCelestial === group.children[0] ||
      (data.centralPlanet &&
        selectedCelestial === celestialGroups[data.centralPlanet]?.children[0]);

    const shouldBeVisible =
      isSelectedOrSatellite || distance < maxVisibleDistance;

    group.children.forEach((child) => {
      if (child.isMesh || child.isGroup) {
        child.visible = shouldBeVisible;
      }
    });

    // 使用全局的guiOptions变量
    if (orbits[name]) {
      orbits[name].visible = shouldBeVisible && guiOptions.ShowOrbits;
    }
  });
}

function updateSpriteSize(sprite) {
  const distance = camera.position.distanceTo(sprite.position);
  if (distance > 1000) {
    sprite.visible = true;
  } else if (distance <= 1000) {
    sprite.visible = false;
  }
  if (distance > 10000000) {
    sun.children[0].children[0].visible = false;
  } else if (distance < 10000000) {
    sun.children[0].children[0].visible = true;
  }

  const fov = camera.fov * (Math.PI / 180);
  const height = 2 * Math.tan(fov / 2) * distance;
  const width = height * camera.aspect;
  const widthInWorldUnits = (100 / window.innerWidth) * width;
  const heightInWorldUnits = (100 / window.innerHeight) * height;
  sprite.scale.set(widthInWorldUnits, heightInWorldUnits, 1);
}

// -------------------------- 10. 动画循环 --------------------------
let selectedCelestial = null;
const cameraOffset = new THREE.Vector3(0, 0, 200);
let distanceScale = 0.02;
const clock = new THREE.Clock();

// 鼠标滚轮控制（独立实现，不依赖点击时的固定缩放逻辑）
window.addEventListener(
  "wheel",
  (event) => {
    // 获取信息面板元素
    const infoPanel = document.getElementById("planet-info-panel");
    const pullOutBtn = document.getElementById("pull-out-btn");

    // 检查滚轮事件是否发生在信息面板或其相关元素上
    const isInfoPanelElement =
      infoPanel &&
      (infoPanel.contains(event.target) ||
        (pullOutBtn && pullOutBtn.contains(event.target)));

    // 如果在信息面板上滚动，让默认滚动行为继续，不执行星球缩放
    if (isInfoPanelElement) {
      return; // 不阻止默认行为，允许信息面板正常滚动
    }

    // 如果没有选中天体则不响应滚轮
    if (!selectedCelestial) return;

    // 无论信息面板是否激活，都允许缩放操作
    event.preventDefault(); // 阻止页面默认滚动行为

    // 获取选中天体的基本信息
    const targetPos = new THREE.Vector3();
    selectedCelestial.getWorldPosition(targetPos);
    const currentDistance = camera.position.distanceTo(targetPos);
    const name = selectedCelestial.name.toLowerCase();
    const planetRadius = planetData[name]?.radius || 1; // 默认为1防止出错

    // 安全距离设置（防止相机进入天体内部）- 与点击聚焦逻辑保持一致
    const safetyFactor = planetRadius > 10000 ? 1.5 : 1.2; // 大型天体用更高安全系数
    const minDistance = planetRadius * safetyFactor; // 最小安全距离
    const maxDistance = 1000000000; // 最大距离：使用相机的最大可视距离

    // 基础缩放因子（控制缩放灵敏度）
    const sensitivity = 0.02;
    // 根据滚轮方向计算缩放增量（向上滚动放大，向下滚动缩小）
    const zoomDelta = event.deltaY < 0 ? -sensitivity : sensitivity;

    // 计算新距离（基于当前距离的百分比缩放，更自然）
    let newDistance = currentDistance * (1 + zoomDelta);

    // 限制新距离在安全范围内
    newDistance = Math.max(minDistance, Math.min(newDistance, maxDistance));

    // 更新缩放因子（保持相机偏移方向不变，只改变距离）
    const currentOffsetLength = cameraOffset.length();
    distanceScale =
      currentOffsetLength > 0 ? newDistance / currentOffsetLength : 1;

    // 更新相机位置 - 关键修复：确保缩放后相机位置正确更新
    const scaledOffset = cameraOffset
      .clone()
      .multiplyScalar(distanceScale)
      .applyQuaternion(camera.quaternion);
    camera.position.copy(targetPos).add(scaledOffset);
    controls.update();
  },
  { passive: false }
); // 设置为非被动模式，允许preventDefault()

// 添加触屏缩放支持
let touchStartDistance = 0;
let touchStartZoom = 0;

renderer.domElement.addEventListener(
  "touchstart",
  (event) => {
    // 只有在controls启用时才执行缩放相关的初始化操作
    // 当面板激活时，controls已被禁用，浏览器默认缩放功能将生效
    if (event.touches.length === 2 && selectedCelestial && controls.enabled) {
      const dx = event.touches[0].pageX - event.touches[1].pageX;
      const dy = event.touches[0].pageY - event.touches[1].pageY;
      touchStartDistance = Math.sqrt(dx * dx + dy * dy);
      const targetPos = new THREE.Vector3();
      selectedCelestial.getWorldPosition(targetPos);
      touchStartZoom = camera.position.distanceTo(targetPos);
    }
  },
  { passive: true }
);

renderer.domElement.addEventListener(
  "touchmove",
  (event) => {
    // 只有在controls启用时才阻止默认行为和执行自定义缩放
    // 当面板激活时，controls已被禁用，浏览器默认缩放功能将生效
    if (
      (event.touches.length === 1 || event.touches.length === 2) &&
      controls.enabled
    ) {
      event.preventDefault();
    }

    // 实现触屏缩放功能，但只在controls启用时执行
    if (event.touches.length === 2 && selectedCelestial && controls.enabled) {
      const dx = event.touches[0].pageX - event.touches[1].pageX;
      const dy = event.touches[0].pageY - event.touches[1].pageY;
      const touchCurrentDistance = Math.sqrt(dx * dx + dy * dy);

      // 确保touchStartDistance不为0，避免除零错误
      if (touchStartDistance <= 0) return;

      // 获取选中天体的基本信息
      const targetPos = new THREE.Vector3();
      selectedCelestial.getWorldPosition(targetPos);
      const name = selectedCelestial.name.toLowerCase();
      const planetRadius = planetData[name]?.radius || 1; // 默认为1防止出错

      // 安全距离设置
      const safetyFactor = planetRadius > 10000 ? 1.5 : 1.2;
      const minDistance = planetRadius * safetyFactor;
      const maxDistance = 1000000000;

      // 反转缩放计算逻辑，确保双指捏合时缩小，双指拉开时放大
      // 当双指捏合时(touchCurrentDistance < touchStartDistance)：我们减小相机距离，实现缩小效果
      // 当双指拉开时(touchCurrentDistance > touchStartDistance)：我们增加相机距离，实现放大效果
      // 使用倒数来反转缩放方向，使捏合和拉开的操作更符合直觉
      const scaleFactor = touchStartDistance / touchCurrentDistance;

      // 计算新距离 - 使用反转的scaleFactor来调整相机距离
      let newDistance = touchStartZoom * scaleFactor;

      // 限制新距离在安全范围内
      newDistance = Math.max(minDistance, Math.min(newDistance, maxDistance));

      // 更新缩放因子和相机位置
      const currentOffsetLength = cameraOffset.length();
      distanceScale =
        currentOffsetLength > 0 ? newDistance / currentOffsetLength : 1;

      // 根据新的缩放因子计算相机偏移位置
      const scaledOffset = cameraOffset
        .clone()
        .multiplyScalar(distanceScale)
        .applyQuaternion(camera.quaternion);

      // 更新相机位置
      camera.position.copy(targetPos).add(scaledOffset);
      controls.update();
    }
  },
  { passive: false }
);

// 用于存储地球Y轴投影线段对象的全局变量
// 辅助参考线功能已移除

// 搜索框已在初始化时设置了合适的尺寸，不需要额外的移动端调整
// 更新行星状态（使用精确天文计算）
const updatePlanets = () => {
  Object.keys(planets).forEach((name) => {
    const planet = planets[name];
    const group = celestialGroups[name];
    const data = planetData[name];

    if (!planet || !group || !data) return;

    // 公转位置更新（基于当前模拟时间）
    const worldPosition = getPlanetPosition(name, simulatedDate);
    if (data.centralPlanet) {
      const centralGroup = celestialGroups[data.centralPlanet];
      if (centralGroup) {
        const centralWorldPosition = new THREE.Vector3();
        centralGroup.getWorldPosition(centralWorldPosition);
        const localPosition = worldPosition.sub(centralWorldPosition);
        group.position.copy(localPosition);
      }
    } else {
      group.position.copy(worldPosition);
    }

    // 特殊处理地球：使用矩阵变换实现精确旋转
    if (name === "earth") {
      // 重置旋转（避免累积旋转干扰）
      planet.rotation.set(0, 0, 0);

      // 步骤1：定义角度参数
      const axialTiltDegrees = 23.4;
      const axialTiltRadians = (axialTiltDegrees * Math.PI) / 180;
      const azimuthDegrees = 106.13;
      const azimuthRadians = (azimuthDegrees * Math.PI) / 180;

      // 步骤2：实时获取地球公转位置
      const earthPos = getPlanetPosition("earth", simulatedDate);

      // 同步位置到地球组对象
      if (data.centralPlanet) {
        const centralGroup = celestialGroups[data.centralPlanet];
        if (centralGroup) {
          const centralWorldPosition = new THREE.Vector3();
          centralGroup.getWorldPosition(centralWorldPosition);
          const localPosition = earthPos.clone().sub(centralWorldPosition);
          group.position.copy(localPosition);
        }
      } else {
        group.position.copy(earthPos);
      }

      // 步骤3：构建变换矩阵（关键修改：先自转，再轴倾斜）
      const matrix = new THREE.Matrix4();

      // 第一步：绕全局Y轴旋转方位角
      matrix.makeRotationY(azimuthRadians);
      // 第二步：绕局部X轴旋转倾斜角
      matrix.multiply(new THREE.Matrix4().makeRotationX(axialTiltRadians));

      // ===================== 日下点差量校准法：初始校准 =====================
      if (needsInitialCalibration) {
        // 先应用轴倾斜，然后测量日下点
        planet.applyMatrix4(matrix);
        earthInitialRotationOffset = calculateEarthInitialRotation(planet);
        // 记录初始时刻的自转基准角度
        earthInitialBaseRotation = calculateEarthRotation(simulatedDate);
        needsInitialCalibration = false;
        console.log(
          "地球初始校准完成，偏移角度:",
          THREE.MathUtils.radToDeg(earthInitialRotationOffset).toFixed(2) + "°"
        );

        // 重置并重新构建：先自转，再轴倾斜
        planet.matrix.identity();
        planet.rotation.set(0, 0, 0);
        planet.scale.set(1, 1, 1);
        planet.position.set(0, 0, 0);

        // 应用校准角度进行验证
        planet.rotateY(earthInitialRotationOffset);
        planet.applyMatrix4(matrix);
        planet.updateMatrixWorld(true);

        const sunPos = new THREE.Vector3(0, 0, 0);
        const verifyLon = measureModelSubsolarLongitude(planet, sunPos);
        const trueLon = calculateTrueSubsolarLongitude(simulatedDate);
        let verifyError = Math.abs(verifyLon - trueLon);
        // 处理180°跨越的情况
        if (verifyError > 180) verifyError = 360 - verifyError;

        console.log("[校准验证] 校准后模型日下点:", verifyLon.toFixed(2) + "°");
        console.log("[校准验证] 真实日下点:", trueLon.toFixed(2) + "°");
        console.log("[校准验证] 误差:", verifyError.toFixed(2) + "°");

        if (verifyError > 5) {
          console.warn("[校准警告] 误差较大，可能存在坐标系或符号问题!");
          console.warn("请检查：1.地球纹理UV映射 2.旋转方向 3.经度计算公式");
        } else {
          console.log("[校准成功] 地球日照状态已与UTC时间同步");
        }

        // 恢复到只有轴倾斜的状态（后面的代码会重新应用完整旋转）
        planet.matrix.identity();
        planet.rotation.set(0, 0, 0);
        planet.scale.set(1, 1, 1);
        planet.position.set(0, 0, 0);
        planet.applyMatrix4(matrix);
      }

      // 步骤4：计算当前自转角度（增量方式）
      const currentBaseRotation = calculateEarthRotation(simulatedDate);
      const rotationDelta = currentBaseRotation - earthInitialBaseRotation;
      const rotationAngle = rotationDelta + earthInitialRotationOffset;

      // 步骤5：应用变换（关键：先绕全局Y轴自转，再应用轴倾斜矩阵）
      planet.rotateY(rotationAngle); // 先自转（绕全局Y轴）
      planet.applyMatrix4(matrix); // 再轴倾斜

      // 步骤6：辅助参考线功能已移除

      // 辅助参考线功能已移除

      // 辅助参考线功能已移除
    } else {
      // 其他行星：使用原有的自转计算逻辑
      const simulatedTimeDiff = (simulatedDate - initialSimulatedDate) / 1000;
      const rotationPeriodSeconds = Math.abs(data.day * 3600);
      const totalRotationRadians =
        (2 * Math.PI * simulatedTimeDiff) / rotationPeriodSeconds;
      const rotationDirection = data.day > 0 ? 1 : -1;

      // 自转更新（月球特殊处理：叠加180度偏移）
      planet.rotation.y =
        rotationDirection * totalRotationRadians +
        (name === "moon" ? Math.PI : 0);
    }
  });

  // 更新光源方向，使其始终从太阳指向地球
  updateLightDirection();
};

/**
 * 更新光源方向，使其与太阳位置同步
 */
function updateLightDirection() {
  try {
    // 获取地球和太阳的位置
    const earthPos = getPlanetPosition("earth", simulatedDate);

    // 由于光源位于太阳中心，我们需要将光源位置设置为(0,0,0)
    // 并确保目标指向正确方向
    if (pointLight) {
      // 保持光源在原点（太阳位置）
      pointLight.position.set(0, 0, 0);

      // 如果需要，可以设置光源的目标
      if (!pointLight.target || !pointLight.target.position) {
        pointLight.target = new THREE.Object3D();
        scene.add(pointLight.target);
      }

      // 让光源目标指向地球的反方向，这样光线就会从太阳射向地球
      pointLight.target.position.copy(earthPos);
    }
  } catch (error) {
    console.error("更新光源方向错误:", error);
  }
}

// 添加轨道更新功能 - 当时间变化较大时更新轨道线
let lastOrbitUpdateDate = new Date(simulatedDate.getTime());
const ORBIT_UPDATE_INTERVAL_YEARS = 1 / 52; // 每隔1周更新一次轨道

/**
 * 重建天体轨道
 * @param {string} name - 天体名称
 * @returns {THREE.Object3D} 新创建的轨道对象
 */
const rebuildOrbit = (name) => {
  // 移除旧轨道（如果存在）
  if (orbits[name] && orbits[name].parent) {
    orbits[name].parent.remove(orbits[name]);
  }
  // 创建并添加新轨道
  const newOrbit = createOrbit(name, simulatedDate);
  orbits[name] = newOrbit;
  orbitGroup.add(newOrbit);
  return newOrbit;
};

const updateOrbits = () => {
  // 计算当前时间与上次更新时间的差值（年）
  const yearsDiff =
    (simulatedDate - lastOrbitUpdateDate) / (1000 * 60 * 60 * 24 * 365);

  // 如果时间跨度超过阈值，更新轨道线
  if (Math.abs(yearsDiff) >= ORBIT_UPDATE_INTERVAL_YEARS) {
    // 为每个天体更新轨道，优先使用增量更新
    celestialNames.forEach((name) => {
      try {
        if (orbits[name] && orbits[name]._orbitData) {
          // 使用增量更新轨道顶点位置
          const updateSuccess = updateOrbitVertices(
            orbits[name],
            simulatedDate
          );

          // 如果增量更新失败，重建轨道
          if (!updateSuccess) {
            rebuildOrbit(name);
          }
        } else {
          // 如果轨道不存在，创建新轨道
          rebuildOrbit(name);
        }
      } catch (error) {
        // 发生错误时尝试重建轨道
        try {
          rebuildOrbit(name);
        } catch (retryError) {
          console.error(`重建轨道失败: ${name}`, retryError);
        }
      }
    });

    // 更新最后更新时间
    lastOrbitUpdateDate = new Date(simulatedDate.getTime());
  }
};

// 动画循环（核心修改：使用时间控制器）
const animate = () => {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // 检查是否启用了实时时间同步
  if (getRealtimeSyncState()) {
    // 实时模式：直接设置simulatedDate为当前时间
    simulatedDate = new Date();
  } else {
    // 非实时模式：通过时间控制器计算时间增量
    const timeStepMs = calculateTimeStep(delta);
    // 更新模拟时间
    simulatedDate = new Date(simulatedDate.getTime() + timeStepMs);
  }

  // 更新轨道线（当时间跨度较大时）
  updateOrbits();

  // 定期重置模拟时间（防长期运行偏移，可选保留）
  const maxSimulatedDays = 365 * 200;
  const simulatedDays =
    (simulatedDate - initialSimulatedDate) / (1000 * 60 * 60 * 24);
  if (simulatedDays > maxSimulatedDays) {
    simulatedDate = new Date(initialSimulatedDate.getTime());
  }
  // 更新时间显示
  updateTimeDisplay(simulatedDate);

  updatePlanets();
  updateSpriteSize(sunHalo);
  updateVisibility();

  // 在 animate() 函数内，找到相机更新的部分，替换为以下代码：

  if (selectedCelestial) {
    const targetPos = new THREE.Vector3();
    selectedCelestial.getWorldPosition(targetPos);

    // --- 使用 cameraOffset 和 distanceScale 计算相机期望位置 ---
    const scaledOffset = cameraOffset
      .clone()
      .multiplyScalar(distanceScale)
      .applyQuaternion(camera.quaternion);

    let desiredCameraPos = targetPos.clone().add(scaledOffset);

    // --- 添加太阳安全距离检查 ---
    // 计算相机到太阳的距离
    const sunPos = new THREE.Vector3();
    sun.getWorldPosition(sunPos);
    const distanceToSun = desiredCameraPos.distanceTo(sunPos);

    // 太阳安全距离 = 太阳半径 * 安全系数
    const sunSafetyDistance = sunRadius * 1.2;

    // 如果相机太靠近太阳，调整位置
    if (distanceToSun < sunSafetyDistance) {
      // 计算从太阳指向相机的方向向量
      const direction = desiredCameraPos.clone().sub(sunPos).normalize();
      // 将相机位置调整到太阳安全距离之外
      desiredCameraPos = sunPos
        .clone()
        .add(direction.multiplyScalar(sunSafetyDistance));
    }

    // --- 设置相机位置和控制器目标 ---
    camera.position.copy(desiredCameraPos);
    controls.target.copy(targetPos);
  } else {
    // 当没有选中天体时，也确保相机不进入太阳
    const sunPos = new THREE.Vector3();
    sun.getWorldPosition(sunPos);
    const distanceToSun = camera.position.distanceTo(sunPos);
    const sunSafetyDistance = sunRadius * 1.5;

    if (distanceToSun < sunSafetyDistance) {
      const direction = camera.position.clone().sub(sunPos).normalize();
      camera.position.copy(
        sunPos.clone().add(direction.multiplyScalar(sunSafetyDistance))
      );
    }
  }

  // --- 更新控制器 ---
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
};

// -------------------------- 11. 窗口自适应 --------------------------
window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  updateSpriteSize(sunHalo);
});

// -------------------------- 12. 启动动画 --------------------------
animate();
