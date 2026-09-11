import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { CameraDirector } from "./CameraDirector.js";
import { TOUR } from "./shots.js";

import {
  getPlanetPosition,
  createOrbit,
  updateOrbitVertices,
  createSprite,
  createSun,
  createPlanet,
  createRing,
  createUniverse,
  createGroup,
  createEarthMaterial,
  createEarthAtmosphere,
  calculateEarthRotation,
  calculateTrueSubsolarLongitude,
  measureModelSubsolarLongitude,
  performSubsolarCalibration,
  softOrbitColor,
} from "../js/utils.js";

import { planetData, cnNames } from "../js/dats.js";
import { createStarfield } from "./starfield.js";
import { createGalaxyPlane } from "./galaxy.js";
import {
  state,
  commands,
} from "../store/useStore.js";
import { calculateTimeStep } from "../composables/useTimeController.js";

const ASSET = (name) => `${import.meta.env.BASE_URL}assets/${name}`;

// SpaceX 风格任务序列：真实对应资源加载阶段
const STAGES = [
  "ACQUIRING TELEMETRY LINK",
  "LOADING ORBITAL TEXTURES",
  "CALIBRATING EPHEMERIS",
  "RENDERING STAR FIELD",
  "SYSTEMS NOMINAL",
];

export class SolarSystem {
  constructor(container) {
    this.container = container;
    this.planets = {};
    this.orbits = {};
    this.celestialGroups = {};
    this.clock = new THREE.Clock();
    this.simulatedDate = new Date();
    this.initialSimulatedDate = new Date(this.simulatedDate.getTime());

    this.earthInitialRotationOffset = 0;
    this.needsInitialCalibration = true;
    this.earthInitialBaseRotation = 0;
    this.selectedCelestial = null;

    this.cameraOffset = new THREE.Vector3(0, 0, 200);
    this.distanceScale = 0.02;

    // 相机聚焦过渡动画状态
    this._isTransitioning = false;
    this._transitionRaf = null;
    // 相机锁定目标：与 UI 的选中状态解耦，关闭信息面板不会解除跟随
    this.cameraTarget = null;
    this._lockEl = null;
    // 指针拾取状态（用于区分「拖动旋转」与「点击选中」）
    this._pointerDown = null;
    this._hoverPending = false;
    this._pickTargets = [];

    // 轨道长期变化增量更新的基准时间（必须在构造时初始化，否则 yearsDiff 恒为 NaN）
    this._lastOrbitUpdateDate = new Date(this.simulatedDate.getTime());
    this._lastOrbitUpdateTime = 0;

    this.searchList = [];
    this._tmpVec = new THREE.Vector3();
    this._raf = null;
    this._disposed = false;
    // 行星位置圆环标记的内层元素表（按天体名索引），驱动「贴近淡出」
    this._orbitMarkerInners = {};
    // 运镜系统：播放期间独占相机（animate 中与跟随/controls 互斥）
    this.directorActive = false;

    // 统一纹理加载管理器：真实跟踪资源加载进度
    this.loadingManager = new THREE.LoadingManager();
    this.loadingManager.onProgress = (url, loaded, total) => {
      state.loadingProgress = Math.min(99, Math.round((loaded / total) * 100));
      state.loadingStage = Math.min(STAGES.length - 1, Math.floor((loaded / total) * STAGES.length));
    };
    // 所有纹理真实加载完成后 resolve，确保加载层在资源就绪后才消失
    let _resolved = false;
    const finishLoading = () => {
      if (_resolved) return;
      _resolved = true;
      state.loadingStage = STAGES.length - 1;
      state.loadingProgress = 100;
      if (this._onLoadedResolve) this._onLoadedResolve();
    };
    this._onLoaded = new Promise((resolve) => {
      this._onLoadedResolve = resolve;
      this.loadingManager.onLoad = () => finishLoading();
    });
  }

  async init() {
    this._initScene();
    this._initLights();
    this._initBodies();
    this._initRings();
    this._initLabels();
    this._initDirector();
    this._initFpsCounter();
    this._bindCommands();
    this._bindInput();
    // 等待真实纹理加载完成（缓存命中也会立即 resolve）
    await this._onLoaded;
    this._updateLoadingState(true);
    this._updateOrbitResolution();
    this.animate();
    // 开发模式调试句柄：console 里可访问 __solar.camera / __solar.starfield 调参验证
    if (import.meta.env.DEV) window.__solar = this;
  }

  _updateLoadingState(done) {
    state.loading = !done;
    if (done) {
      state.loadingProgress = 100;
      state.loadingStage = STAGES.length - 1;
    }
  }

  _initScene() {
    const { clientWidth: w, clientHeight: h } = this.container;

    this.scene = new THREE.Scene();

    // 远裁剪面覆盖银河照片全盘（40 kpc 真实比例 = 1.23e14 单位）
    this.camera = new THREE.PerspectiveCamera(90, w / h, 0.001, 3e14);
    this.camera.position.set(139.2 * 100, 69.6 * 100, 139.2 * 100);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
      powerPreference: "high-performance", // 强制使用独立 GPU（双显卡设备常默认集显导致帧率低）
    });
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    Object.assign(this.labelRenderer.domElement.style, {
      position: "absolute",
      top: "0px",
      left: "0px",
      pointerEvents: "none",
      zIndex: "1",
      background: "transparent",
    });
    this.container.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.zoomSpeed = 5.0;
    this.controls.smoothZoom = true;
    this.controls.minDistance = 0.001;
    this.controls.maxDistance = 2e14;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.enablePan = true;
    this.controls.update();
    this.controls.target.set(0, 0, 0);

    this.raycaster = new THREE.Raycaster();

    window.addEventListener("resize", this._onResize);
  }

  _initLights() {
    // 环境光：提供基础亮度，确保行星背光面也能显出纹理（不再全黑）
    this.scene.add(new THREE.AmbientLight(0x888888));
    // 点光源（太阳）：decay=0 且 distance=0 表示无衰减、覆盖全场景
    // 注意不开启阴影：点光源阴影为立方体贴图，每帧需渲染场景 6 遍，
    // 而行星间距数万单位、1024 分辨率下根本产生不了可见阴影，纯浪费帧率
    this.pointLight = new THREE.PointLight(0xffffff, 3, 0, 0);
    this.pointLight.position.set(0, 0, 0);
    this.scene.add(this.pointLight);
  }

  _initBodies() {
    const names = [
      "mercury", "venus", "earth", "mars",
      "jupiter", "saturn", "uranus", "neptune", "moon",
    ];

    // 真实星表星野层：NASA Eyes 风格稀疏恒星，按相机距离驱动可见性（锚点见 starfield.js）
    this.starfield = createStarfield();
    this.scene.add(this.starfield);

    // 银河照片面片：Hurt 40KPC 俯视图，太阳 UV 点锚定在原点，姿态由
    // 北银极 (-0.868,0.497,0) 与银心向量 (-0.055,-0.096,0.994) 标定（见 galaxy.js）
    this.galaxyPlane = createGalaxyPlane(this.loadingManager);
    this.scene.add(this.galaxyPlane);

    // 旧贴图天球开关：已被真实星野替代，保留便于新旧对比（原决策点④：确认后可彻底移除）
    const TEXTURE_SKYSPHERE_ENABLED = false;
    this.universe = null;
    if (TEXTURE_SKYSPHERE_ENABLED) {
      this.universe = createUniverse(
        planetData.universe.name,
        planetData.universe.radius,
        this.loadingManager
      );
      this.scene.add(this.universe);
    }
    this.sun = createSun(planetData.sun.name, planetData.sun.radius, this.loadingManager);

    this.sunHalo = createSprite("sun-glow", this.loadingManager);
    const sunRadius = this.sun.geometry.parameters.radius;
    this.sunHalo.scale.set(sunRadius, sunRadius, 1);
    this.sun.add(this.sunHalo);
    this.sunRadius = sunRadius;

    this.scene.add(this.sun);

    this.orbitGroup = new THREE.Group();
    this.orbitGroup.visible = true;
    this.scene.add(this.orbitGroup);

    names.forEach((name) => {
      const data = planetData[name];
      if (!data) return;

      const celestial = name === "sun" ? this.sun : createPlanet(data.name, data.radius, this.loadingManager);
      if (name !== "sun") this.planets[name] = celestial;

      const group = createGroup(celestial);
      this.celestialGroups[name] = group;

      const orbit = createOrbit(name, this.simulatedDate);
      this.orbits[name] = orbit;

      this._orbitParentFor(name).add(orbit);

      if (data.centralPlanet) {
        const parent = this.celestialGroups[data.centralPlanet];
        if (parent) parent.add(group);
      } else {
        this.scene.add(group);
      }
    });

    // 地球专属：昼夜 Shader 材质（夜面城市灯光 + 晨昏线）与大气辉光外壳
    if (this.planets.earth && this.celestialGroups.earth) {
      // 地球表面与大气层共享同一个太阳方向向量（视空间），每帧只需更新一次
      this._earthSunDirection = new THREE.Vector3(1, 0, 0);
      this._earthSunDirWorld = new THREE.Vector3(1, 0, 0);
      this.planets.earth.material = createEarthMaterial(this.loadingManager);
      this.planets.earth.material.uniforms.uSunDirection.value = this._earthSunDirection;
      const atmosphere = createEarthAtmosphere(planetData.earth.radius * 1.03);
      atmosphere.material.uniforms.uSunDirection.value = this._earthSunDirection;
      this.celestialGroups.earth.add(atmosphere);
      this.earthAtmosphere = atmosphere;
    }

    // 搜索列表
    this.searchList = [
      { name: "sun", displayName: "太阳", mesh: this.sun, offset: planetData.sun.radius, color: planetData.sun.color },
      { name: "mercury", displayName: "水星", mesh: this.planets.mercury, offset: planetData.mercury.radius, color: planetData.mercury.color },
      { name: "venus", displayName: "金星", mesh: this.planets.venus, offset: planetData.venus.radius, color: planetData.venus.color },
      { name: "earth", displayName: "地球", mesh: this.planets.earth, offset: planetData.earth.radius, color: planetData.earth.color },
      { name: "moon", displayName: "月球", mesh: this.planets.moon, offset: planetData.moon.radius, color: planetData.moon.color },
      { name: "mars", displayName: "火星", mesh: this.planets.mars, offset: planetData.mars.radius, color: planetData.mars.color },
      { name: "jupiter", displayName: "木星", mesh: this.planets.jupiter, offset: planetData.jupiter.radius, color: planetData.jupiter.color },
      { name: "saturn", displayName: "土星", mesh: this.planets.saturn, offset: planetData.saturn.radius, color: planetData.saturn.color },
      { name: "uranus", displayName: "天王星", mesh: this.planets.uranus, offset: planetData.uranus.radius, color: planetData.uranus.color },
      { name: "neptune", displayName: "海王星", mesh: this.planets.neptune, offset: planetData.neptune.radius, color: planetData.neptune.color },
    ].filter((i) => i.mesh);
  }

  _initRings() {
    const configs = [
      { planet: "saturn", ringName: planetData.saturn.ringName, inner: planetData.saturn.innerRing, outer: planetData.saturn.outerRing },
      { planet: "uranus", ringName: planetData.uranus.ringName, inner: planetData.uranus.innerRing, outer: planetData.uranus.outerRing },
      { planet: "neptune", ringName: planetData.neptune.ringName, inner: planetData.neptune.innerRing, outer: planetData.neptune.outerRing },
    ];
    configs.forEach((c) => {
      if (this.celestialGroups[c.planet]) {
        const ring = createRing(c.ringName, c.inner, c.outer, this.loadingManager);
        this.celestialGroups[c.planet].add(ring);
      }
    });
  }

  _initLabels() {
    const names = Object.keys(this.celestialGroups);
    names.forEach((name) => {
      const group = this.celestialGroups[name];
      const orbit = this.orbits[name];
      const data = planetData[name];
      if (group && orbit && data) this._addLabel(group, orbit, data.radius, name);
    });
    // 太阳标签（太阳无轨道线，hover 高亮逻辑不适用）
    if (this.sun) this._addSunLabel();
  }

  /** 运镜系统初始化：director 实例；入口/跳过按钮在 TopBar，经 commands 桥接 */
  _initDirector() {
    this.director = new CameraDirector(this.camera, (name, out) => {
      if (name === "sun") return this.sun.getWorldPosition(out);
      const group = this.celestialGroups[name];
      return group ? group.getWorldPosition(out) : out.set(0, 0, 0);
    });
    this.director.onComplete = () => this._endDirector(true);

    commands.toggleDirector = () => {
      if (this.directorActive) this._endDirector(false);
      else this._startDirector();
    };
  }

  /** 太阳专属标签：SUN 文字标签 + 金色圆环，随镜头远去渐隐 */
  _addSunLabel() {
    const iconDiv = document.createElement("div");
    iconDiv.className = "celestial-label";
    iconDiv.innerHTML = `<span class="planet-name">SUN</span>`;
    Object.assign(iconDiv.style, {
      pointerEvents: "auto",
      color: "white",
      fontFamily: "'Archivo', sans-serif",
      fontSize: "12px",
      fontWeight: "600",
      textAlign: "center",
      background: "transparent",
      borderRadius: "16px",
      padding: "3px 10px",
      border: "none",
      cursor: "pointer",
      transition: "opacity 0.25s ease",
      whiteSpace: "nowrap",
      boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
      // 屏幕空间右上偏移：文字贴在圆环标记右上方，避免与天体重叠
      margin: "-18px 0 0 12px",
    });
    iconDiv.addEventListener("click", () => this._focusByMesh(this.sun));
    iconDiv.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this._focusByMesh(this.sun);
      },
      { passive: false }
    );

    const iconLabel = new CSS2DObject(iconDiv);
    iconLabel.position.set(0, planetData.sun.radius * 1.5, 0);
    iconLabel.layers.set(0);
    this.sun.add(iconLabel);

    const _labelWorldPos = new THREE.Vector3();
    iconLabel.onBeforeRender = (_, __, camera) => {
      if (this._disposed) return;
      _labelWorldPos.setFromMatrixPosition(iconLabel.matrixWorld);
      const labelDistance = camera.position.distanceTo(_labelWorldPos);

      // ① 远去淡出：log(d) 在 [5e9, 5e10] 区间线性渐隐
      const t = Math.max(
        0,
        Math.min(1, (Math.log10(labelDistance) - 9.7) / (10.7 - 9.7))
      );
      const distFade = 1 - t * t * (3 - 2 * t);

      // ② 遮挡淡出：被行星挡住时淡出
      this.raycaster.set(
        camera.position,
        _labelWorldPos.clone().sub(camera.position).normalize()
      );
      const intersects = this.raycaster.intersectObjects(
        [...Object.values(this.planets)],
        false
      );
      let closest = null;
      for (const it of intersects) {
        if (it.distance < labelDistance - 0.1) {
          if (!closest || it.distance < closest.distance) closest = it;
        }
      }
      const occlusionFade = closest
        ? Math.max(
            0,
            Math.min(1, 1 - (1 - closest.distance / labelDistance) * 1.2)
          )
        : 1;

      const fade = distFade * occlusionFade;
      iconDiv.style.opacity = String(fade);
      iconDiv.style.pointerEvents = fade < 0.1 ? "none" : "auto";
    };
  }

  /**
   * 挂接遮挡淡出：标签/标记被其他天体挡住时整体淡出
   * @param {CSS2DObject} iconLabel
   * @param {HTMLElement} iconDiv
   * @param {THREE.Mesh} selfMesh 自身网格（不参与自遮挡判定）
   */
  _attachOcclusionFade(iconLabel, iconDiv, selfMesh) {
    const _labelWorldPos = new THREE.Vector3();
    const _occluderTargets = () => [this.sun, ...Object.values(this.planets)];
    iconLabel.onBeforeRender = (_, __, camera) => {
      if (this._disposed) return;
      _labelWorldPos.setFromMatrixPosition(iconLabel.matrixWorld);
      const labelDistance = camera.position.distanceTo(_labelWorldPos);
      this.raycaster.set(camera.position, _labelWorldPos.clone().sub(camera.position).normalize());
      const intersects = this.raycaster.intersectObjects(_occluderTargets(), false);
      let closest = null;
      for (const it of intersects) {
        if (it.object !== selfMesh && it.distance < labelDistance - 0.1) {
          if (!closest || it.distance < closest.distance) closest = it;
        }
      }
      if (closest) {
        const ratio = Math.min(1, Math.max(0, (1 - closest.distance / labelDistance) * 1.2));
        iconDiv.style.opacity = String(1 - ratio);
      } else {
        iconDiv.style.opacity = "1";
      }
      iconDiv.style.pointerEvents = Number(iconDiv.style.opacity) < 0.1 ? "none" : "auto";
    };
  }

  /**
   * 行星位置圆环标记（NASA Eyes 风格）：空心圆环标示行星在轨迹线上的当前位置，
   * 锚定在天体中心、恒定屏幕尺寸，随遮挡淡出。
   * 颜色与透明度同对应轨迹线（共用柔化色 + 0.45 alpha）。
   * 内层元素注册到 _orbitMarkerInners，供 _updateVisibility 驱动「贴近淡出」
   * @returns {HTMLElement} 圆环内层元素
   */
  _addOrbitMarker(mesh, colorHex, name) {
    const ringDiv = document.createElement("div");
    ringDiv.className = "orbit-marker";
    const ringInner = document.createElement("span");
    ringInner.className = "orbit-marker-inner";
    const c = softOrbitColor(colorHex);
    ringInner.style.borderColor = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, 0.45)`;
    ringDiv.appendChild(ringInner);
    const marker = new CSS2DObject(ringDiv);
    marker.position.set(0, 0, 0);
    marker.layers.set(0);
    mesh.add(marker);
    this._attachOcclusionFade(marker, ringDiv, mesh);
    if (name) this._orbitMarkerInners[name] = ringInner;
    return ringInner;
  }

  _addLabel(group, orbit, size, name) {
    if (!group.children[0]) return;
    const mesh = group.children[0];
    const iconDiv = document.createElement("div");
    iconDiv.className = "celestial-label";

    const planetColor = planetData[name]?.color || 0xffffff;
    const colorHex = "#" + planetColor.toString(16).padStart(6, "0");

    iconDiv.innerHTML = `<span class="planet-name">${name.toUpperCase()}</span>`;
    Object.assign(iconDiv.style, {
      pointerEvents: "auto",
      color: "white",
      fontFamily: "'Archivo', sans-serif",
      fontSize: "12px",
      fontWeight: "600",
      textAlign: "center",
      background: "transparent",
      borderRadius: "16px",
      padding: "3px 10px",
      border: "none",
      cursor: "pointer",
      transition: "opacity 0.25s ease",
      whiteSpace: "nowrap",
      boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
      // 屏幕空间右上偏移：文字贴在圆环标记右上方，避免与天体重叠
      margin: "-18px 0 0 12px",
    });

    const handleClick = () => this._focusByMesh(mesh);
    iconDiv.addEventListener("click", handleClick);
    iconDiv.addEventListener("touchstart", (e) => { e.preventDefault(); handleClick(); }, { passive: false });

    // 行星位置空心圆环标记（贴在天体中心、轨迹线上），并联动标签 hover
    const ringInner = this._addOrbitMarker(mesh, colorHex, name);

    if (name !== "sun") {
      const originalColor = orbit.material.color.clone();
      const highlightColor = originalColor.clone().lerp(new THREE.Color(1, 1, 1), 0.8);
      iconDiv.addEventListener("mouseover", () => {
        // 轨迹线高亮：大幅向白色插值（opacity 会被每帧可见性逻辑覆写，不可用）
        orbit.material.color.copy(highlightColor);
        // 圆环放大联动
        ringInner.parentElement.classList.add("hover");
        Object.assign(iconDiv.style, { background: "rgba(0,0,0,0.4)", boxShadow: `0 4px 12px rgba(0,0,0,0.7),0 0 15px ${highlightColor.getStyle()}` });
      });
      iconDiv.addEventListener("mouseout", () => {
        orbit.material.color.copy(originalColor);
        ringInner.parentElement.classList.remove("hover");
        Object.assign(iconDiv.style, { background: "transparent", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" });
      });
    }

    const iconLabel = new CSS2DObject(iconDiv);
    iconLabel.position.set(0, size * 1.5, 0);
    iconLabel.layers.set(0);
    mesh.add(iconLabel);
    this._attachOcclusionFade(iconLabel, iconDiv, mesh);
  }

  _bindCommands() {
    commands.focusBody = (name) => {
      const item = this.searchList.find((s) => s.name === name);
      if (item) this._focusByMesh(item.mesh);
    };
    commands.setTimeScale = () => {};
    commands.togglePlay = () => {};
    commands.toggleRealtime = () => {};
    commands.selectBody = (name) => {
      const item = this.searchList.find((s) => s.name === name);
      if (item) this._selectAndFocus(item.mesh, item.offset);
    };
    // 仅收起 UI：不解除相机锁定，否则关闭面板后天体会飞出视野
    commands.closePanel = () => {
      this.selectedCelestial = null;
    };
  }

  /**
   * 聚焦到指定天体：计算安全视距并播放相机过渡动画
   * 过渡期间由本方法独占相机控制（animate 会跳过跟随），避免两者互相覆盖导致抖动
   */
  _selectAndFocus(mesh, radius) {
    if (!mesh) return;
    this._cancelTransition();

    this.selectedCelestial = mesh;
    // 锁定相机跟随目标：时间流动时相机持续跟随该天体
    this.cameraTarget = mesh;
    this._updateLockIndicator(mesh);

    const targetPos = new THREE.Vector3();
    mesh.getWorldPosition(targetPos);

    const fovRad = this.camera.fov * (Math.PI / 180);
    const tanHalf = Math.tan(fovRad / 2);
    const fixedDistance = (radius * this.container.clientHeight) / (500 * tanHalf);
    const safety = radius > 10000 ? 1.5 : 1.2;
    const finalDistance = Math.max(fixedDistance, radius * safety);

    // 保持当前观察方向：偏移固定为「相机后方 × 安全视距」
    this.cameraOffset.set(0, 0, finalDistance);
    this.distanceScale = 1;
    const endOffset = this.cameraOffset
      .clone()
      .applyQuaternion(this.camera.quaternion);

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    // 时长随飞行距离动态伸缩：近处约 0.7s，跨行星约 1.6s，
    // 对数增长避免超远距离（如从太阳系边缘聚焦）耗时过久，上限 3.2s
    const travelDistance = startPos.distanceTo(targetPos.clone().add(endOffset));
    const duration = Math.min(
      3200,
      Math.max(700, 550 * Math.log10(1 + travelDistance / 20))
    );
    const startTime = performance.now();

    this._isTransitioning = true;
    this.controls.enabled = false;

    const animateTransition = (now) => {
      if (this._disposed) return;
      const progress = Math.min((now - startTime) / duration, 1);
      // easeInOutCubic：起步与收尾都平滑，符合任务控制的电影感节奏
      const ease =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      // 天体在运动，每帧重新取世界坐标，保证动画终点不脱靶
      const movingTarget = new THREE.Vector3();
      mesh.getWorldPosition(movingTarget);

      this.camera.position.lerpVectors(
        startPos,
        movingTarget.clone().add(endOffset),
        ease
      );
      this.controls.target.lerpVectors(startTarget, movingTarget, ease);
      this.controls.update();

      if (progress < 1) {
        this._transitionRaf = requestAnimationFrame(animateTransition);
      } else {
        this._transitionRaf = null;
        this._isTransitioning = false;
        this.controls.enabled = true;
      }
    };
    this._transitionRaf = requestAnimationFrame(animateTransition);
  }

  _cancelTransition() {
    if (this._transitionRaf) {
      cancelAnimationFrame(this._transitionRaf);
      this._transitionRaf = null;
    }
    this._isTransitioning = false;
    if (this.controls) this.controls.enabled = true;
  }

  /** 通用聚焦入口：根据 mesh 反查天体数据，聚焦并打开信息面板 */
  _focusByMesh(mesh) {
    if (!mesh) return;
    const name = (mesh.name || "").toLowerCase();
    const data = planetData[name];
    this._selectAndFocus(mesh, data ? data.radius : 100);
    state.selectedBody = name || null;
    state.infoPanelOpen = true;
  }

  /** 解除相机锁定，恢复自由漫游（Esc 键或点击徽标上的 RELEASE） */
  _unlockCamera() {
    this._cancelTransition();
    this.cameraTarget = null;
    this.selectedCelestial = null;
    state.selectedBody = null;
    state.infoPanelOpen = false;
    if (this.renderer) this.renderer.domElement.style.cursor = "";
    this._updateLockIndicator(null);
  }

  /** 锁定状态徽标：让「相机正在跟随某天体」这一状态可见且可主动解除 */
  _updateLockIndicator(mesh) {
    if (!this.container) return;

    if (!mesh) {
      if (this._lockEl) {
        this._lockEl.remove();
        this._lockEl = null;
      }
      return;
    }

    if (!this._lockEl) {
      const el = document.createElement("div");
      el.className = "camera-lock-badge";
      el.innerHTML = `<span class="lock-dot"></span><span class="lock-txt"></span><button class="lock-release" type="button">RELEASE</button>`;
      el.querySelector(".lock-release").addEventListener("click", () => this._unlockCamera());
      this.container.appendChild(el);
      this._lockEl = el;
    }

    const name = (mesh.name || "").toUpperCase();
    const cn = cnNames[(mesh.name || "").toLowerCase()];
    this._lockEl.querySelector(".lock-txt").textContent =
      `LOCKED · ${name}${cn ? " / " + cn : ""}`;
  }

  /** 可拾取的天体网格（太阳 + 八大行星 + 月球） */
  _getPickTargets() {
    if (!this._pickTargets.length) {
      this._pickTargets = [this.sun, ...Object.values(this.planets)];
    }
    return this._pickTargets;
  }

  /** 沿父链判断是否可见：被视距剔除隐藏的天体不参与拾取 */
  _isRenderVisible(obj) {
    let node = obj;
    while (node) {
      if (node.visible === false) return false;
      node = node.parent;
    }
    return true;
  }

  /** 屏幕坐标 → 命中的天体网格 */
  _pickAt(clientX, clientY) {
    if (!this.renderer || !this.camera) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this._getPickTargets(), false);
    for (const hit of hits) {
      if (this._isRenderVisible(hit.object)) return hit.object;
    }
    return null;
  }

  _bindInput() {
    window.addEventListener("wheel", this._onWheel, { passive: false });
    window.addEventListener("resize", this._onResize);
    // 画布上的指针事件：点击天体聚焦、悬停反馈
    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", this._onPointerDown);
    dom.addEventListener("pointerup", this._onPointerUp);
    dom.addEventListener("pointermove", this._onPointerMove);
    dom.addEventListener("pointerleave", this._onPointerLeave);
    // 兜底：指针在画布外抬起时也复位，避免残留的按下状态阻塞 hover 检测
    window.addEventListener("pointerup", this._onWindowPointerUp);
    window.addEventListener("keydown", this._onKeyDown);
  }

  _onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._updateSpriteSize(this.sunHalo);
    this._updateOrbitResolution();
  };

  /** LineMaterial 按屏幕尺寸计算像素线宽，resize 与初始化时需同步 */
  _updateOrbitResolution() {
    if (!this.renderer || !this.orbits) return;
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    Object.values(this.orbits).forEach((o) => {
      o?.material?.resolution?.set(w, h);
    });
  }

  _onWheel = (event) => {
    if (!this.cameraTarget) return;
    event.preventDefault();
    const targetPos = new THREE.Vector3();
    this.cameraTarget.getWorldPosition(targetPos);
    const currentDistance = this.camera.position.distanceTo(targetPos);
    const name = this.cameraTarget.name.toLowerCase();
    const planetRadius = planetData[name]?.radius || 1;
    const safety = planetRadius > 10000 ? 1.5 : 1.2;
    const minDistance = planetRadius * safety;
    const maxDistance = 2e14;
    const sensitivity = 0.02;
    const zoomDelta = event.deltaY < 0 ? -sensitivity : sensitivity;
    let newDistance = currentDistance * (1 + zoomDelta);
    newDistance = Math.max(minDistance, Math.min(newDistance, maxDistance));
    const currentOffsetLength = this.cameraOffset.length();
    this.distanceScale = currentOffsetLength > 0 ? newDistance / currentOffsetLength : 1;
    const scaledOffset = this.cameraOffset.clone().multiplyScalar(this.distanceScale).applyQuaternion(this.camera.quaternion);
    this.camera.position.copy(targetPos).add(scaledOffset);
    this.controls.update();
  };

  _onPointerDown = (event) => {
    this._pointerDown = {
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
    };
  };

  _onPointerUp = (event) => {
    const down = this._pointerDown;
    this._pointerDown = null;
    if (!down || this._disposed) return;
    // 拖动旋转或长按不视为「点击」
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    if (performance.now() - down.t > 600) return;

    const hit = this._pickAt(event.clientX, event.clientY);
    // 仅命中天体时切换聚焦。点击空白不再解除锁定：
    // 顶栏、搜索框外层等 UI 为 pointer-events:none，点击会穿透到画布，
    // 若在此解除锁定会导致时间流动时视角不再跟随
    if (hit) this._focusByMesh(hit);
  };

  _onPointerMove = (event) => {
    if (this._pointerDown || this._hoverPending) return;
    this._hoverPending = true;
    const { clientX, clientY } = event;
    requestAnimationFrame(() => {
      this._hoverPending = false;
      if (this._disposed || !this.renderer) return;
      const hit = this._pickAt(clientX, clientY);
      this.renderer.domElement.style.cursor = hit ? "pointer" : "";
    });
  };

  _onPointerLeave = () => {
    this._pointerDown = null;
    if (this.renderer) this.renderer.domElement.style.cursor = "";
  };

  _onWindowPointerUp = () => {
    this._pointerDown = null;
  };

  _onKeyDown = (event) => {
    if (event.key === "Escape") {
      if (this.directorActive) this._endDirector(false);
      else if (this.cameraTarget) this._unlockCamera();
    }
  };

  /** 启动运镜：挂起一切相机控制权，交给 CameraDirector */
  _startDirector() {
    if (this.directorActive || this._isTransitioning) return;
    this.directorActive = true;
    this._cancelTransition();
    this.cameraTarget = null; // 停用跟随（animate 中互斥分支接管）
    this._updateLockIndicator(null); // 清除残留的锁定徽标，避免运镜画面被 UI 污染
    this.controls.enabled = false;
    this._savedFov = this.camera.fov;
    this.director.playTour(TOUR);
    this._syncDirectorState();
  }

  /** 结束运镜（completed=true 为自然播完）：恢复相机与交互 */
  _endDirector(completed) {
    if (!this.directorActive) return;
    this.directorActive = false;
    this.director.stop();
    this.camera.fov = this._savedFov;
    this.camera.updateProjectionMatrix();
    // 相机平滑接管：target 从当前视线点滑回原点，避免拖动突兀
    const cur = this.director._lookAtProxy.clone();
    this.controls.target.copy(cur);
    this.controls.enabled = true;
    // 相机保持当前位置，重新推导跟随基准（下次锁定天体时按新位置起算）
    this.cameraTarget = null;
    this.selectedCelestial = null;
    state.selectedBody = null;
    state.infoPanelOpen = false;
    this._syncDirectorState();
    if (completed) {
      // 播完后的运镜终点即全景俯视位：以当前距离重建 cameraOffset，便于继续漫游
      const dist = this.camera.position.length();
      this.cameraOffset.set(0, 0, dist);
      this.distanceScale = 1;
    }
  }

  /** 运镜状态同步给 UI：TopBar 按钮据此切换 CINEMATIC / SKIP 文案与激活态 */
  _syncDirectorState() {
    state.directorActive = this.directorActive;
  }

  /** 运行帧数 + 镜头速度显示：每 0.5s 统计一次，便于直观定位卡顿 */
  _initFpsCounter() {
    const el = document.createElement("div");
    el.className = "fps-counter";
    el.innerHTML = '<span class="fps-value">--</span> FPS<span class="fps-sep"> · </span><span class="speed-value">--</span> 万km/s';
    this.container.appendChild(el);
    this._fpsCounterEl = el;
    this._fpsEl = el.querySelector(".fps-value");
    this._speedEl = el.querySelector(".speed-value");
    this._fpsFrames = 0;
    this._fpsWindowStart = performance.now();
    this._prevCamPos = this.camera.position.clone();
  }

  /** 帧计数 + 速度统计：每 0.5s 刷新一次读数（频繁更新 DOM 反而引入抖动） */
  _tickFps() {
    if (!this._fpsEl) return;
    this._fpsFrames++;
    const now = performance.now();
    const elapsed = now - this._fpsWindowStart;
    if (elapsed >= 500) {
      this._fpsEl.textContent = String(Math.round((this._fpsFrames * 1000) / elapsed));
      // 镜头速度：窗口内平均位移速率。1 场景单位 = 1 万公里 → v 单位/s = v 万km/s
      const dist = this.camera.position.distanceTo(this._prevCamPos);
      const speed = dist / (elapsed / 1000);
      this._speedEl.textContent = this._formatSpeed(speed);
      this._prevCamPos.copy(this.camera.position);
      this._fpsFrames = 0;
      this._fpsWindowStart = now;
    }
  }

  /** 速度格式化：万km/s，量级跨度大时自动切换万/亿/科学计数 */
  _formatSpeed(v) {
    if (v >= 1e8) return v.toExponential(1);
    if (v >= 1e4) return (v / 1e4).toFixed(1) + " 亿";
    if (v >= 1000) return Math.round(v).toLocaleString();
    return v.toFixed(1);
  }

  _updatePlanets() {
    const names = Object.keys(this.planets);
    names.forEach((name) => {
      const planet = this.planets[name];
      const group = this.celestialGroups[name];
      const data = planetData[name];
      if (!planet || !group || !data) return;

      const worldPosition = getPlanetPosition(name, this.simulatedDate);
      if (data.centralPlanet) {
        const centralGroup = this.celestialGroups[data.centralPlanet];
        if (centralGroup) {
          const centralWorld = new THREE.Vector3();
          centralGroup.getWorldPosition(centralWorld);
          group.position.copy(worldPosition.sub(centralWorld));
        }
      } else {
        group.position.copy(worldPosition);
      }

      if (name === "earth") {
        planet.rotation.set(0, 0, 0);
        const axialTilt = (23.4 * Math.PI) / 180;
        const azimuth = (106.13 * Math.PI) / 180;
        const earthPos = getPlanetPosition("earth", this.simulatedDate);
        if (data.centralPlanet) {
          const centralGroup = this.celestialGroups[data.centralPlanet];
          if (centralGroup) {
            const centralWorld = new THREE.Vector3();
            centralGroup.getWorldPosition(centralWorld);
            group.position.copy(earthPos.clone().sub(centralWorld));
          }
        } else {
          group.position.copy(earthPos);
        }
        const matrix = new THREE.Matrix4();
        matrix.makeRotationY(azimuth);
        matrix.multiply(new THREE.Matrix4().makeRotationX(axialTilt));

        if (this.needsInitialCalibration) {
          planet.applyMatrix4(matrix);
          const result = performSubsolarCalibration(this.simulatedDate, planet, new THREE.Vector3(0, 0, 0));
          this.earthInitialRotationOffset = result.calibrationAngle;
          this.earthInitialBaseRotation = calculateEarthRotation(this.simulatedDate);
          this.needsInitialCalibration = false;
          state.debugInfo = result.debug;
          planet.matrix.identity();
          planet.rotation.set(0, 0, 0);
          planet.scale.set(1, 1, 1);
          planet.position.set(0, 0, 0);
          planet.rotateY(this.earthInitialRotationOffset);
          planet.applyMatrix4(matrix);
          planet.updateMatrixWorld(true);
        }

        const currentBaseRotation = calculateEarthRotation(this.simulatedDate);
        const rotationDelta = currentBaseRotation - this.earthInitialBaseRotation;
        const rotationAngle = rotationDelta + this.earthInitialRotationOffset;
        planet.rotateY(rotationAngle);
        planet.applyMatrix4(matrix);
      } else {
        const simulatedTimeDiff = (this.simulatedDate - this.initialSimulatedDate) / 1000;
        const rotationPeriodSeconds = Math.abs(data.day * 3600);
        const totalRotation = (2 * Math.PI * simulatedTimeDiff) / rotationPeriodSeconds;
        const rotationDirection = data.day > 0 ? 1 : -1;
        planet.rotation.y = rotationDirection * totalRotation + (name === "moon" ? Math.PI : 0);
      }
    });
    this._updateLightDirection();
  }

  _updateLightDirection() {
    const earthPos = getPlanetPosition("earth", this.simulatedDate);
    if (this.pointLight) {
      this.pointLight.position.set(0, 0, 0);
      if (!this.pointLight.target || !this.pointLight.target.position) {
        this.pointLight.target = new THREE.Object3D();
        this.scene.add(this.pointLight.target);
      }
      this.pointLight.target.position.copy(earthPos);
    }

    // 同步地球昼夜 Shader 的太阳方向（视空间单位向量）：
    // 世界空间方向由「原点(太阳) - 地球世界坐标」求得，
    // 再经当前帧相机姿态变换到视空间。着色器端只用视空间小坐标计算，
    // 避免 1.5e4 量级世界坐标的 float32 量化误差在近景造成光照抖动
    if (this._earthSunDirection && this.planets.earth && this.camera) {
      const earthWorld = new THREE.Vector3();
      this.planets.earth.getWorldPosition(earthWorld);
      // 世界空间：太阳指向地球的方向取反即地球指向太阳
      this._earthSunDirWorld.copy(earthWorld).multiplyScalar(-1).normalize();
      // 视空间：使用当前帧相机矩阵（渲染器稍后会重算，此处提前刷新保证零延迟）
      this.camera.updateMatrixWorld();
      this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
      this._earthSunDirection
        .copy(this._earthSunDirWorld)
        .transformDirection(this.camera.matrixWorldInverse);
    }
  }

  _updateOrbits() {
    const now = performance.now();
    // 真实时间内的最小更新间隔：高倍速档位下模拟时间每帧跨越数天，
    // 若不做节流会导致每帧重算全部轨道顶点（8×1024）
    if (now - this._lastOrbitUpdateTime < 200) return;

    const yearsDiff = (this.simulatedDate - this._lastOrbitUpdateDate) / (1000 * 60 * 60 * 24 * 365);
    if (Math.abs(yearsDiff) >= 1 / 52) {
      Object.keys(this.orbits).forEach((name) => {
        try {
          const orbit = this.orbits[name];
          if (orbit && orbit._orbitData) {
            if (!updateOrbitVertices(orbit, this.simulatedDate)) this._rebuildOrbit(name);
          } else {
            this._rebuildOrbit(name);
          }
        } catch {
          this._rebuildOrbit(name);
        }
      });
      this._lastOrbitUpdateDate = new Date(this.simulatedDate.getTime());
      this._lastOrbitUpdateTime = now;
    }
  }

  // 轨道线挂载父级：卫星 -> 中心天体 group；行星 -> orbitGroup
  _orbitParentFor(name) {
    const central = planetData[name] && planetData[name].centralPlanet;
    return (central && this.celestialGroups[central]) || this.orbitGroup;
  }

  _rebuildOrbit(name) {
    const oldOrbit = this.orbits[name];
    // 保留原有父级，否则卫星轨道会被错误地挂到 orbitGroup 下而与中心天体脱钩
    const parent = (oldOrbit && oldOrbit.parent) || this._orbitParentFor(name);
    if (oldOrbit && oldOrbit.parent) oldOrbit.parent.remove(oldOrbit);
    const newOrbit = createOrbit(name, this.simulatedDate);
    this.orbits[name] = newOrbit;
    parent.add(newOrbit);
  }

  _updateVisibility() {
    const names = Object.keys(this.celestialGroups);
    // 收集相机到各天体的距离（逐天体「贴近隐去自身轨迹线」使用）
    const distances = {};
    names.forEach((name) => {
      const group = this.celestialGroups[name];
      const data = planetData[name];
      if (!group || !data) return;
      group.getWorldPosition(this._tmpVec);
      distances[name] = this.camera.position.distanceTo(this._tmpVec);
    });

    names.forEach((name) => {
      const group = this.celestialGroups[name];
      const data = planetData[name];
      if (!group || !data) return;
      const distance = distances[name];
      const sizeRatio = data.radius / planetData.earth.radius;
      const maxVisible = (data.a ? data.a[0] * 200000 : 10000) * sizeRatio;
      const isSelectedOrSat =
        this.cameraTarget === group.children[0] ||
        (data.centralPlanet && this.cameraTarget === this.celestialGroups[data.centralPlanet]?.children[0]);
      const shouldBeVisible = isSelectedOrSat || distance < maxVisible;
      group.children.forEach((child) => {
        if (child.isMesh || child.isGroup) child.visible = shouldBeVisible;
      });
      // 轨迹线透明度 = 全局贴近淡出 × 逐天体距离淡出
      const orbit = this.orbits[name];
      if (orbit && orbit.material) {
        const fadeStart = data.radius * 300;
        const fadeEnd = data.radius * 80;
        let factor = 1;
        if (distance < fadeStart) {
          const t = Math.max(
            0,
            Math.min(1, (distance - fadeEnd) / (fadeStart - fadeEnd))
          );
          factor = t * t * (3 - 2 * t); // smoothstep
        }
        orbit.visible = shouldBeVisible && factor > 0.015;
        orbit.material.opacity = 0.45 * factor;
        // 圆环标记跟随轨迹线同步淡出（inner 的 opacity 与遮挡淡出的外层 opacity 相乘）
        const markerInner = this._orbitMarkerInners[name];
        if (markerInner) markerInner.style.opacity = String(factor);
      }
    });
  }

  _updateSpriteSize(sprite) {
    const distance = this.camera.position.distanceTo(sprite.position);
    sprite.visible = distance > 1000;
    const fov = this.camera.fov * (Math.PI / 180);
    const height = 2 * Math.tan(fov / 2) * distance;
    const width = height * this.camera.aspect;
    const wUnits = (100 / window.innerWidth) * width;
    const hUnits = (100 / window.innerHeight) * height;
    sprite.scale.set(wUnits, hUnits, 1);
  }

  animate = () => {
    if (this._disposed) return;
    this._raf = requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    this._tickFps();

    if (state.isRealtime) {
      this.simulatedDate = new Date();
    } else {
      const stepMs = calculateTimeStep(delta);
      this.simulatedDate = new Date(this.simulatedDate.getTime() + stepMs);
    }

    state.simDate = new Date(this.simulatedDate.getTime());

    this._updateOrbits();
    this._updatePlanets();
    this._updateSpriteSize(this.sunHalo);
    this._updateVisibility();
    // 真实星野按相机到太阳的距离驱动：淡入/逐颗隐去/全隐（锚点见 starfield.js）
    this.starfield.updateByDistance(this.camera.position.length());
    // 银河照片面片随距离淡入（见 galaxy.js）
    this.galaxyPlane.updateByDistance(this.camera.position.length());

    // 运镜期间：CameraDirector 独占相机（GSAP onUpdate 写位置，此处仅接管视线）
    if (this.directorActive) {
      this.director.applyLookAt();
    } else if (this.cameraTarget && !this._isTransitioning) {
      const targetPos = new THREE.Vector3();
      this.cameraTarget.getWorldPosition(targetPos);
      // 移动端双指缩放：OrbitControls 的 dolly 直接改相机位置，
      // 而锁定逻辑每帧用 cameraOffset×distanceScale 覆盖位置会吞掉该变化。
      // 在覆盖前检测实际距离与期望距离的偏差，反向同步到 distanceScale
      const actualDist = this.camera.position.distanceTo(targetPos);
      const desiredDist = this.cameraOffset.length() * this.distanceScale;
      if (desiredDist > 0 && Math.abs(actualDist - desiredDist) > desiredDist * 1e-3) {
        const name = this.cameraTarget.name.toLowerCase();
        const planetRadius = planetData[name]?.radius || 1;
        const safety = planetRadius > 10000 ? 1.5 : 1.2;
        const minScale = (planetRadius * safety) / this.cameraOffset.length();
        this.distanceScale = Math.max(minScale, actualDist / this.cameraOffset.length());
      }
      const scaledOffset = this.cameraOffset.clone().multiplyScalar(this.distanceScale).applyQuaternion(this.camera.quaternion);
      let desired = targetPos.clone().add(scaledOffset);
      const sunPos = new THREE.Vector3();
      this.sun.getWorldPosition(sunPos);
      const dSun = desired.distanceTo(sunPos);
      const sunSafe = this.sunRadius * 1.2;
      if (dSun < sunSafe) {
        const dir = desired.clone().sub(sunPos).normalize();
        desired = sunPos.clone().add(dir.multiplyScalar(sunSafe));
      }
      this.camera.position.copy(desired);
      this.controls.target.copy(targetPos);
    } else {
      const sunPos = new THREE.Vector3();
      this.sun.getWorldPosition(sunPos);
      const dSun = this.camera.position.distanceTo(sunPos);
      const sunSafe = this.sunRadius * 1.5;
      if (dSun < sunSafe) {
        const dir = this.camera.position.clone().sub(sunPos).normalize();
        this.camera.position.copy(sunPos.clone().add(dir.multiplyScalar(sunSafe)));
      }
    }

    // 运镜期间禁用 controls.update()：其内部仍会按阻尼状态重写相机位置，覆盖导演镜头
    if (!this.directorActive) this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  dispose() {
    this._disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._cancelTransition();
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("wheel", this._onWheel);
    const dom = this.renderer?.domElement;
    if (dom) {
      dom.removeEventListener("pointerdown", this._onPointerDown);
      dom.removeEventListener("pointerup", this._onPointerUp);
      dom.removeEventListener("pointermove", this._onPointerMove);
      dom.removeEventListener("pointerleave", this._onPointerLeave);
    }
    window.removeEventListener("pointerup", this._onWindowPointerUp);
    window.removeEventListener("keydown", this._onKeyDown);
    this._updateLockIndicator(null);
    state.directorActive = false;
    commands.toggleDirector = null;
    this._fpsCounterEl?.remove();
    this.controls?.dispose();
    this.renderer?.dispose();
    if (this.renderer?.domElement?.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    if (this.labelRenderer?.domElement?.parentNode) this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
  }
}
