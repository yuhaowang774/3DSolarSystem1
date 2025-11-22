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
  createSprite,
  createSun,
  createPlanet,
  createUniverse,
  createRing,
  createGroup,
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
controls.enableZoom = true;
controls.update();
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
  "phobos",
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
});

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
const searchList = [
  { name: "sun", mesh: sun, offset: planetData.sun.radius },
  { name: "mercury", mesh: planets.mercury, offset: planetData.mercury.radius },
  { name: "venus", mesh: planets.venus, offset: planetData.venus.radius },
  { name: "earth", mesh: planets.earth, offset: planetData.earth.radius },
  { name: "mars", mesh: planets.mars, offset: planetData.mars.radius },
  { name: "jupiter", mesh: planets.jupiter, offset: planetData.jupiter.radius },
  { name: "saturn", mesh: planets.saturn, offset: planetData.saturn.radius },
  { name: "uranus", mesh: planets.uranus, offset: planetData.uranus.radius },
  { name: "neptune", mesh: planets.neptune, offset: planetData.neptune.radius },
].filter((item) => item.mesh);

const searchInput = document.createElement("input");
searchInput.type = "text";
searchInput.id = "search-input";
searchInput.placeholder = "搜索天体(如:earth、moon、mars)";
searchInput.style.position = "absolute";
searchInput.style.top = "20px";
searchInput.style.left = "50%";
searchInput.style.transform = "translateX(-50%)";
searchInput.style.padding = "8px 16px";
searchInput.style.fontSize = "16px";
searchInput.style.border = "none";
searchInput.style.borderRadius = "4px";
searchInput.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
searchInput.style.zIndex = "100";
searchInput.style.background = "rgba(0,0,0,0.7)";
searchInput.style.color = "white";
document.body.appendChild(searchInput);

searchInput.addEventListener("change", onSearch);
function onSearch(event) {
  const query = event.target.value.toLowerCase();
  const planet = searchList.find((p) => p.name.toLowerCase() === query);
  if (planet) {
    const targetPosition = new THREE.Vector3();
    planet.mesh.getWorldPosition(targetPosition);
    const offset = new THREE.Vector3(
      planet.offset * 2,
      planet.offset,
      planet.offset * 2
    );
    camera.position.copy(targetPosition).add(offset);
    controls.target.copy(targetPosition);
    controls.update();
  }
}

// -------------------------- 7. CSS2D标签和交互功能 --------------------------
function addIcon(group, orbit, size, name) {
  if (!group.children[0]) return;

  let mesh = group.children[0];
  const iconDiv = document.createElement("div");
  iconDiv.className = "celestial-label";

  // 获取行星颜色
  const planetColor = planetData[name]?.color || 0xffffff;
  const colorHex = "#" + planetColor.toString(16).padStart(6, "0");

  iconDiv.innerHTML = `
    <span class="planet-dot" style="background: ${colorHex};"></span>
    <span class="planet-name">${name.toUpperCase()}</span>
  `;

  iconDiv.style.cssText = `
    pointer-events: auto;
    color: white;
    font-family: 'Orbitron', sans-serif;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    background: transparent;
    backdrop-filter: blur(4px);
    border-radius: 16px;
    padding: 3px 10px;
    border: none;
    cursor: pointer;
    transition: all 0.3s ease;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  `;

  // 设置点的样式
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
  // 关键：调用导入的函数，绑定标签点击显示信息的事件
  initPlanetLabelClick(iconDiv, name);

  iconDiv.addEventListener("click", () => {
    // 确保group和子元素存在
    if (!group || !group.children[0]) return;

    selectedCelestial = group.children[0];
    const targetPos = new THREE.Vector3();
    selectedCelestial.getWorldPosition(targetPos);

    // 获取星球半径（增加容错处理）
    const name = selectedCelestial.name.toLowerCase();
    const planetDataEntry = planetData[name];
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
  });

  if (name !== "sun") {
    // 保存原始颜色
    const originalColor = orbit.material.color.clone();

    iconDiv.addEventListener("mouseover", () => {
      // 高亮轨道颜色：使用更明亮的颜色
      orbit.material.color.copy(originalColor).multiplyScalar(1.5);
      // 增加线宽使轨道更明显
      orbit.material.linewidth = 3.0;
      // 更新标签样式
      iconDiv.style.background = "rgba(0, 0, 0, 0.4)";
      iconDiv.style.transform = "scale(1.05)";
      iconDiv.style.boxShadow = `0 4px 12px rgba(0, 0, 0, 0.7), 0 0 15px ${orbit.material.color.getStyle()}`;

      // 更新点的样式
      const dot = iconDiv.querySelector(".planet-dot");
      if (dot) {
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.style.boxShadow = `0 0 12px ${orbit.material.color.getStyle()}, 0 0 6px #fff`;
      }
    });
    iconDiv.addEventListener("mouseout", () => {
      // 恢复原始颜色和线宽
      orbit.material.color.copy(originalColor);
      orbit.material.linewidth = 1.5;
      // 恢复标签样式
      iconDiv.style.background = "transparent";
      iconDiv.style.transform = "scale(1)";
      iconDiv.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.5)";

      // 恢复点的样式
      const dot = iconDiv.querySelector(".planet-dot");
      if (dot) {
        dot.style.width = "8px";
        dot.style.height = "8px";
        dot.style.boxShadow = "0 0 8px currentColor, 0 0 4px #fff";
      }
    });
  } else {
    iconDiv.addEventListener("mouseover", () => {
      iconDiv.style.background = "rgba(0, 0, 0, 0.4)";
      iconDiv.style.transform = "scale(1.05)";
      iconDiv.style.boxShadow =
        "0 4px 12px rgba(0, 0, 0, 0.7), 0 0 15px #ffff00";

      // 更新点的样式
      const dot = iconDiv.querySelector(".planet-dot");
      if (dot) {
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.style.boxShadow = "0 0 12px #ffff00, 0 0 6px #fff";
      }
    });
    iconDiv.addEventListener("mouseout", () => {
      iconDiv.style.background = "transparent";
      iconDiv.style.transform = "scale(1)";
      iconDiv.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.5)";

      // 恢复点的样式
      const dot = iconDiv.querySelector(".planet-dot");
      if (dot) {
        dot.style.width = "8px";
        dot.style.height = "8px";
        dot.style.boxShadow = "0 0 8px currentColor, 0 0 4px #fff";
      }
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
const options = {
  ShowOrbits: true,
};
const gui = new dat.GUI();
gui.domElement.style = "position:absolute;top:10px;right:10px;z-index:1000;";

gui
  .add(options, "ShowOrbits")
  .name("显示轨道")
  .onChange((value) => {
    orbitGroup.visible = value;
  });

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

    if (orbits[name]) {
      orbits[name].visible = shouldBeVisible && options.ShowOrbits;
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
window.addEventListener("wheel", (event) => {
  // 获取信息面板元素
  const infoPanel = document.getElementById("planet-info-panel");
  const pullOutBtn = document.getElementById("pull-out-btn");
  
  // 检查滚轮事件是否发生在信息面板或其相关元素上
  const isInfoPanelElement = infoPanel && (infoPanel.contains(event.target) || 
                                          pullOutBtn && pullOutBtn.contains(event.target));
  
  // 如果在信息面板上滚动，让默认滚动行为继续，不执行星球缩放
  if (isInfoPanelElement) {
    return; // 不阻止默认行为，允许信息面板正常滚动
  }
  
  // 如果没有选中天体则不响应滚轮
  if (!selectedCelestial) return;
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
}, { passive: false }); // 设置为非被动模式，允许preventDefault()
// 更新行星状态（使用固定时间增量）
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

    // 自转更新（基于固定时间流逝）
    const simulatedTimeDiff = (simulatedDate - initialSimulatedDate) / 1000;
    const rotationPeriodSeconds = Math.abs(data.day * 3600);
    const totalRotationRadians =
      (2 * Math.PI * simulatedTimeDiff) / rotationPeriodSeconds;
    const rotationDirection = data.day > 0 ? 1 : -1;
    planet.rotation.y = rotationDirection * totalRotationRadians;
    // 自转更新（月球特殊处理：叠加180度偏移）
    planet.rotation.y =
      rotationDirection * totalRotationRadians +
      (name === "moon" ? Math.PI : 0);
  });
};

// 添加轨道更新功能 - 当时间变化较大时更新轨道线
let lastOrbitUpdateDate = new Date(simulatedDate.getTime());
const ORBIT_UPDATE_INTERVAL_YEARS = 1/52; // 每隔1周更新一次轨道

const updateOrbits = () => {
  // 计算当前时间与上次更新时间的差值（年）
  const yearsDiff = (simulatedDate - lastOrbitUpdateDate) / (1000 * 60 * 60 * 24 * 365);
  
  // 如果时间跨度超过阈值，更新轨道线
  if (Math.abs(yearsDiff) >= ORBIT_UPDATE_INTERVAL_YEARS) {
    console.log(`更新轨道线，时间变化: ${yearsDiff.toFixed(2)}年`);
    
    // 移除所有旧轨道
    Object.keys(orbits).forEach(name => {
      if (orbits[name] && orbitGroup.children.includes(orbits[name])) {
        orbitGroup.remove(orbits[name]);
      }
    });
    
    // 为每个天体重新创建轨道，使用当前模拟时间
    celestialNames.forEach(name => {
      try {
        const newOrbit = createOrbit(name, simulatedDate);
        orbits[name] = newOrbit;
        orbitGroup.add(newOrbit);
      } catch (error) {
        console.warn(`创建轨道失败: ${name}`, error);
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
