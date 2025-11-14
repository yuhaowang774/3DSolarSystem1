import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";
import * as dat from "dat.gui";
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
import { planetData } from "./dats.js";
// 导入时间控制器模块
import { initTimeController, calculateTimeStep } from './timeController.js';
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
controls.minDistance = 0.1;
controls.maxDistance = 1000000000;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
};
controls.enableZoom = true;
controls.update();
controls.target.set(0, 0, 0);
camera.position.set(139.2 * 100, 69.6 * 100, 139.2 * 100);
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

// -------------------------- 4. 批量创建天体系统 --------------------------
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

  const orbit = createOrbit(name);
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
  iconDiv.textContent = name.toUpperCase();
  iconDiv.style.cssText = `
    pointer-events: auto;
    color: white;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: bold;
    text-align: center;
    background: transparent;
    border-radius: 4px;
    padding: 4px 8px;
    border: none;
    cursor: pointer;
    transition: all 0.05s ease;
    white-space: nowrap;
    text-shadow: 0 0 8px #000, 0 0 12px #000, 1px 1px 2px #000;
  `;
  // 关键：调用导入的函数，绑定标签点击显示信息的事件
  // 注意：此函数应仅负责信息显示，不影响原有的相机逻辑
  initPlanetLabelClick(iconDiv, name);
  
  iconDiv.addEventListener("click", () => {
    selectedCelestial = group.children[0];
    const targetPos = new THREE.Vector3();
    selectedCelestial.getWorldPosition(targetPos);

    const fov = camera.fov * (Math.PI / 180);
    const aspect = window.innerWidth / window.innerHeight;
    const planetRadius = selectedCelestial.geometry.parameters.radius;
    const targetHeight = 200;
    const distance = targetHeight / 2 / Math.tan(fov / 2);

    distanceScale = distance / cameraOffset.length();
    const scaledOffset = cameraOffset
      .clone()
      .multiplyScalar(distanceScale)
      .applyQuaternion(camera.quaternion);
    camera.position.copy(targetPos).add(scaledOffset);
    controls.target.copy(targetPos);
    controls.update();
  });

  if (name !== "sun") {
    iconDiv.addEventListener("mouseover", () => {
      orbit.material.color.multiplyScalar(0.6);
      iconDiv.style.textShadow = `0 0 12px ${orbit.material.color.getStyle()}, 0 0 20px ${orbit.material.color.getStyle()}, 2px 2px 4px #000`;
    });
    iconDiv.addEventListener("mouseout", () => {
      orbit.material.color.multiplyScalar(1 / 0.6);
      iconDiv.style.textShadow =
        "0 0 8px #000, 0 0 12px #000, 1px 1px 2px #000";
    });
  } else {
    iconDiv.addEventListener("mouseover", () => {
      iconDiv.style.textShadow =
        "0 0 15px #ffff00, 0 0 25px #ffff00, 2px 2px 4px #000";
    });
    iconDiv.addEventListener("mouseout", () => {
      iconDiv.style.textShadow =
        "0 0 8px #000, 0 0 12px #000, 1px 1px 2px #000";
    });
  }

  const iconLabel = new CSS2DObject(iconDiv);
  iconLabel.position.set(0, size * 1.5, 0);
  iconLabel.layers.set(0);
  mesh.add(iconLabel);
}

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
let simulatedDate = new Date();
let selectedCelestial = null;
const cameraOffset = new THREE.Vector3(0, 0, 200);
let distanceScale = 0.02;
const clock = new THREE.Clock();
const initialSimulatedDate = new Date(simulatedDate.getTime());

// 鼠标滚轮控制
window.addEventListener("wheel", (event) => {
  if (!selectedCelestial) return;

  const targetPos = new THREE.Vector3();
  selectedCelestial.getWorldPosition(targetPos);
  const currentDistance = camera.position.distanceTo(targetPos);

  const baseFactor = 0.002;
  const scaleFactor = Math.exp(baseFactor * currentDistance) - 1;
  const maxScaleFactor = 5;
  const finalFactor = Math.min(scaleFactor, maxScaleFactor);

  const delta = event.deltaY > 0 ? finalFactor : -finalFactor;
  distanceScale = Math.max(0.01, Math.min(distanceScale + delta, 2000));
});

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
  });
};

// 动画循环（核心修改：使用时间控制器）
const animate = () => {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // 关键：通过时间控制器计算当前帧的时间增量（毫秒）
  const timeStepMs = calculateTimeStep(delta);
  // 更新模拟时间
  simulatedDate = new Date(simulatedDate.getTime() + timeStepMs);

  // 定期重置模拟时间（防长期运行偏移，可选保留）
  const maxSimulatedDays = 365 * 200;
  const simulatedDays =
    (simulatedDate - initialSimulatedDate) / (1000 * 3600 * 24);
  if (simulatedDays > maxSimulatedDays) {
    simulatedDate = new Date(initialSimulatedDate.getTime());
  }
  updatePlanets();
  updateSpriteSize(sunHalo);
  updateVisibility();

  if (selectedCelestial) {
    const targetPos = new THREE.Vector3();
    selectedCelestial.getWorldPosition(targetPos);
    const scaledOffset = cameraOffset
      .clone()
      .multiplyScalar(distanceScale)
      .applyQuaternion(camera.quaternion);
    camera.position.copy(targetPos).add(scaledOffset);
    controls.target.copy(targetPos);
  }

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
// 全屏控制函数
function toggleFullScreen() {
  // 获取文档元素（或场景容器）
  const docEl = document.documentElement; // 整个文档
  // 或 const docEl = document.getElementById('universe-container'); // 仅场景容器

  // 检查当前是否全屏
  const isFullScreen = document.fullscreenElement ||
                      document.webkitFullscreenElement ||
                      document.msFullscreenElement;

  if (!isFullScreen) {
    // 进入全屏（兼容不同浏览器）
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen();
    } else if (docEl.webkitRequestFullscreen) { // Safari
      docEl.webkitRequestFullscreen();
    } else if (docEl.msRequestFullscreen) { // IE/Edge
      docEl.msRequestFullscreen();
    }
  } else {
    // 退出全屏（兼容不同浏览器）
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}

// 自动隐藏手机地址栏（页面加载时）
function hideMobileAddressBar() {
  if (window.innerHeight <= 768) { // 检测移动设备
    setTimeout(() => {
      window.scrollTo(0, 1); // 触发地址栏隐藏
    }, 100);
  }
}

// 监听窗口大小变化，确保全屏状态下适配
window.addEventListener('resize', () => {
  if (document.fullscreenElement) {
    // 这里可以添加3D场景的适配逻辑（如更新相机、渲染器尺寸）
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
});

// 页面加载完成后执行
window.addEventListener('load', () => {
  hideMobileAddressBar(); // 自动隐藏地址栏

  // 添加全屏按钮（可选，放在场景容器内）
  const fullscreenBtn = document.createElement('button');
  fullscreenBtn.id = 'fullscreen-btn';
  fullscreenBtn.textContent = '全屏';
  fullscreenBtn.style.position = 'absolute';
  fullscreenBtn.style.bottom = '20px';
  fullscreenBtn.style.right = '20px';
  fullscreenBtn.style.zIndex = '100';
  fullscreenBtn.style.padding = '8px 12px';
  fullscreenBtn.style.backgroundColor = 'rgba(0,0,0,0.7)';
  fullscreenBtn.style.color = 'white';
  fullscreenBtn.style.border = 'none';
  fullscreenBtn.style.borderRadius = '4px';
  fullscreenBtn.style.cursor = 'pointer';
  document.getElementById('universe-container').appendChild(fullscreenBtn);

  // 绑定全屏按钮点击事件
  fullscreenBtn.addEventListener('click', toggleFullScreen);
});