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
  calculateEarthAxisAzimuth,
  calculateTrueSubsolarLongitude,
  calculateSolarDeclination,
  measureModelSubsolarLongitude,
  performSubsolarCalibration,
  softOrbitColor,
  applyRingShadowToPlanet,
  iauGroupQuaternion,
  iauSpinY,
} from "../js/utils.js";

import { planetData, cnNames } from "../js/dats.js";
import { formatHours, formatLatLon, localMeanTime, polarLatitude, moonPhaseFromDirections } from "../js/geo.js";
import { createStarfield } from "./starfield.js";
import { createGalaxyPlane } from "./galaxy.js";
import {
  buildGraticule,
  buildEarthAxis,
  buildTerminator,
  buildSubsolarMarker,
  buildCityMarkers,
  createSurfaceLabelManager,
  createSurfaceLabel,
} from "./earthLayers.js";
import {
  state,
  commands,
  showRightPanel,
} from "../store/useStore.js";
import { calculateTimeStep } from "../composables/useTimeController.js";

const ASSET = (name) => `${import.meta.env.BASE_URL}assets/${name}`;

// 具备 IAU 自转模型的行星（见 utils.IAU_ROTATION）：自转经度 W(t) 精确驱动
const IAU_SPIN_PLANETS = new Set([
  "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune",
]);

// ---------- 相机焦距 ----------
// 以 35mm 全画幅等效焦距对外呈现（用户直觉），内部换算为垂直 FOV。
// 基准：感光元件竖边 24mm → f = 12 / tan(fovV / 2)，故 12mm 恰好等于原默认 90°。
const SENSOR_HEIGHT_MM = 24;
const FOCAL_MIN_MM = 8; // ≈112.6°，超广角
const FOCAL_MAX_MM = 600; // ≈2.3°，长焦（用于行星特写）

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

    this._prevFollowTarget = null; // 刚性跟随的基准：上一帧锁定目标的世界坐标
    this.ringMeshes = {}; // 行星环网格（按行星名索引），驱动环影 uniform
    this._saturnRingShadow = null; // 土星盘面环影 uniforms（applyRingShadowToPlanet 返回）
    this.moonPhaseTag = null; // 月相教学标签（CSS2D，贴近月球时渐显）
    this._moonPhaseTime = 0;

    // 相机聚焦过渡动画状态
    this._isTransitioning = false;
    this._transitionRaf = null;
    // 相机锁定目标：与 UI 的选中状态解耦，关闭信息面板不会解除跟随
    this.cameraTarget = null;
    this._lockEl = null;
    // 指针拾取状态（用于区分「拖动旋转」与「点击选中」）
    this._pointerDown = null;
    this._hoverPending = false;

    // 轨道长期变化增量更新的基准时间（必须在构造时初始化，否则 yearsDiff 恒为 NaN）
    this._lastOrbitUpdateDate = new Date(this.simulatedDate.getTime());
    this._lastOrbitUpdateTime = 0;

    this.searchList = [];
    this._tmpVec = new THREE.Vector3();
    this._raf = null;
    this._disposed = false;

    // 地球教学图层
    this.earthLayers = null;
    this.surfaceLabels = null;
    this._sunLocalDir = new THREE.Vector3();
    this._camEarthLocal = new THREE.Vector3();
    this._earthQuatInv = new THREE.Quaternion();
    this._camLocalDir = new THREE.Vector3();
    this._layerTmp = {
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      d: new THREE.Vector3(),
      e: new THREE.Vector3(),
    };
    this._orientMatrix = new THREE.Matrix4();
    this._occDir = new THREE.Vector3();
    this._occPoint = new THREE.Vector3();
    this._geoInfoTime = 0;
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
    this._initEarthLayers();
    this._initMoonPhase();
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
    // 焦距以 store 为准（默认 12mm ↔ 90°），支持运行中通过 LENS 面板改焦
    this._setFocalLength(state.focalLength);

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
    // 极角限位：相机允许到达正上方/正下方（极点）时，lookAt 退化、
    // 水平旋转失效——表现为「上下转头卡位」；留 2° 缓冲保持全程可交互
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(2);
    this.controls.maxPolarAngle = Math.PI - THREE.MathUtils.degToRad(2);
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
    // 自动纳入 dats.js 中以行星为中心的卫星（木卫、土卫等）：
    // 新增一颗只需补数据，场景代码无需改动
    Object.keys(planetData).forEach((key) => {
      if (planetData[key].centralPlanet && !names.includes(key)) names.push(key);
    });

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

      // 卫星贴图为真实影像（NASA/JPL/USGS 公共领域，按 <name>.jpg 命名，来源见 dats.js 注释）
      const celestial =
        name === "sun"
          ? this.sun
          : createPlanet(
              data.name,
              data.radius,
              this.loadingManager,
              data.texture || (data.centralPlanet ? `${name}.jpg` : undefined),
              data.shape,
              data.mapShift
            );
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

    // 行星组对准 IAU 真实极向（赤经/赤纬，见 utils.IAU_ROTATION）：
    // 光环与卫星轨道面随真实赤道面倾斜——土星环指向、天王星"躺倒"等
    // 当前姿态与 NASA Eyes 一致；自转经度由 iauSpinY 每帧驱动
    Object.keys(this.celestialGroups).forEach((name) => {
      const q = iauGroupQuaternion(name);
      if (q) this.celestialGroups[name].quaternion.copy(q);
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

    // 卫星（木卫一 ~ 木卫四、土卫一 / 二 / 五 / 六 / 八 …）自动加入搜索列表
    Object.keys(planetData).forEach((name) => {
      const data = planetData[name];
      if (!data.centralPlanet || !this.planets[name]) return;
      if (this.searchList.some((s) => s.name === name)) return;
      this.searchList.push({
        name,
        displayName: cnNames[name] || data.name.toUpperCase(),
        mesh: this.planets[name],
        offset: data.radius,
        color: data.color,
      });
    });
  }

  _initRings() {
    const configs = [
      { planet: "saturn", ringName: planetData.saturn.ringName, inner: planetData.saturn.innerRing, outer: planetData.saturn.outerRing },
      { planet: "uranus", ringName: planetData.uranus.ringName, inner: planetData.uranus.innerRing, outer: planetData.uranus.outerRing },
      { planet: "neptune", ringName: planetData.neptune.ringName, inner: planetData.neptune.innerRing, outer: planetData.neptune.outerRing },
    ];
    configs.forEach((c) => {
      if (this.celestialGroups[c.planet]) {
        // 传入行星半径：环面着色器用它计算行星投在环上的本影楔形
        const ring = createRing(
          c.ringName,
          c.inner,
          c.outer,
          this.loadingManager,
          planetData[c.planet].radius
        );
        this.celestialGroups[c.planet].add(ring);
        this.ringMeshes[c.planet] = ring;
      }
    });

    // 土星盘面的环影：直射光穿过环面时被削弱（环投在行星上的暗带）
    if (this.planets.saturn && this.ringMeshes.saturn) {
      const saturn = planetData.saturn;
      this._saturnRingShadow = applyRingShadowToPlanet(this.planets.saturn.material);
      this._saturnRingShadow.uInner.value = saturn.innerRing;
      this._saturnRingShadow.uOuter.value = saturn.outerRing;
    }
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

  // ==================== 地球教学图层 ====================

  /**
   * 地球教学图层初始化：经纬网 / 地轴 / 晨昏线 / 太阳直射点 / 城市
   * 全部挂在地球网格之下 —— 网格本地坐标即地理坐标（约定见 js/geo.js），
   * 因此随地球自转与轴倾角一起运动，位置与贴图经纬度严格对应
   */
  _initEarthLayers() {
    const earth = this.planets?.earth;
    if (!earth) return;
    const R = planetData.earth.radius;
    // 两套地表标签管理器：关键纬线随「地表视距」淡出，城市标签需要更近才显示
    this.surfaceLabels = createSurfaceLabelManager();
    this.cityLabels = createSurfaceLabelManager();

    const graticule = buildGraticule(R, this.surfaceLabels);
    const axis = buildEarthAxis(R);
    const terminator = buildTerminator(R);
    const subsolar = buildSubsolarMarker(R);
    const cities = buildCityMarkers(R, this.cityLabels);

    earth.add(graticule);
    earth.add(axis);
    earth.add(terminator.group);
    earth.add(subsolar.group);
    earth.add(cities);

    this.earthLayers = { graticule, axis, terminator, subsolar, cities };
  }

  /** 地球本地坐标系中指向太阳的单位向量（用四元数求逆，与当前帧姿态严格同步） */
  _earthSunLocalDir(target) {
    const earth = this.planets?.earth;
    if (!earth || !this._earthSunDirWorld) return target.set(1, 0, 0);
    this._earthQuatInv.copy(earth.quaternion).invert();
    return target.copy(this._earthSunDirWorld).applyQuaternion(this._earthQuatInv);
  }

  /** 相机在地球本地坐标系中的位置（用于正背面判定与视距淡出） */
  _cameraInEarthLocal(target) {
    const earth = this.planets?.earth;
    if (!earth) return target.set(0, 0, 1);
    earth.getWorldPosition(this._tmpVec);
    target.copy(this.camera.position).sub(this._tmpVec);
    this._earthQuatInv.copy(earth.quaternion).invert();
    return target.applyQuaternion(this._earthQuatInv);
  }

  /** 图层整体淡入淡出：保留材质自身的基准透明度，按视距系数缩放 */
  _applyLayerFade(root, fade) {
    root.traverse((obj) => {
      const material = obj.material;
      if (!material) return;
      if (material.userData.baseOpacity === undefined) {
        material.userData.baseOpacity = material.opacity;
      }
      material.opacity = material.userData.baseOpacity * fade;
    });
  }

  /** 地表点是否被地球本体遮挡（本地坐标系内：相机→目标线段到球心的最短距离） */
  _isOccludedByEarth(localPos, camLocalPos, radius) {
    this._occDir.copy(localPos).sub(camLocalPos);
    const segLen = this._occDir.length();
    if (segLen < 1e-9) return false;
    this._occDir.divideScalar(segLen);
    const t = -camLocalPos.dot(this._occDir); // 最近点参数
    if (t <= 0 || t >= segLen) return false;
    this._occPoint.copy(camLocalPos).addScaledVector(this._occDir, t);
    return this._occPoint.length() < radius * 0.999;
  }

  /** 地球教学图层逐帧更新：晨昏线姿态、直射点位置、各图层的远近淡出 */
  _updateEarthLayers() {
    const layers = this.earthLayers;
    if (!layers) return;
    const R = planetData.earth.radius;
    const now = performance.now();
    const camLocal = this._cameraInEarthLocal(this._camEarthLocal);
    const distRatio = camLocal.length() / R;
    this._camLocalDir.copy(camLocal).normalize();
    const sunLocal = this._earthSunLocalDir(this._sunLocalDir);
    const flags = state.layers;

    // 视距淡出：行星尺度下不显示教学图层，贴近地球时渐显
    const surfaceFade = 1 - THREE.MathUtils.smoothstep(distRatio, 4, 10);
    const cityFade = 1 - THREE.MathUtils.smoothstep(distRatio, 1.8, 3.6);

    // 晨昏线：与太阳方向垂直的大圆（随地球自转与公转实时摆动）
    layers.terminator.group.visible = flags.terminator && surfaceFade > 0.01;
    if (layers.terminator.group.visible) {
      layers.terminator.update(sunLocal);
      this._applyLayerFade(layers.terminator.group, surfaceFade);
    }

    // 经纬网（含赤道 / 回归线 / 极圈）
    layers.graticule.visible = flags.graticule && surfaceFade > 0.01;
    if (layers.graticule.visible) this._applyLayerFade(layers.graticule, surfaceFade);

    // 地轴
    layers.axis.visible = flags.axis && surfaceFade > 0.01;
    if (layers.axis.visible) this._applyLayerFade(layers.axis, surfaceFade);

    // 城市（标签透明度由地表标签管理器统一驱动）
    layers.cities.visible = flags.cities && cityFade > 0.01;

    // 太阳直射点：位置随地球自转移动，标签按是否朝向相机淡出
    const facing = sunLocal.dot(this._camLocalDir);
    const subsolarVisible = flags.subsolar && surfaceFade > 0.01;
    layers.subsolar.group.visible = subsolarVisible;
    if (subsolarVisible) {
      const decl = calculateSolarDeclination(this.simulatedDate);
      const subLon = calculateTrueSubsolarLongitude(this.simulatedDate);
      layers.subsolar.place(decl, subLon);
      const labelFade = surfaceFade * THREE.MathUtils.smoothstep(facing, -0.05, 0.25);
      layers.subsolar.el.style.opacity = labelFade.toFixed(3);
      layers.subsolar.el.style.visibility = labelFade < 0.02 ? "hidden" : "visible";
      layers.subsolar.ring.material.opacity = 0.85 * surfaceFade * (facing > 0 ? 1 : 0.18);
    }

    // 地表标签：正背面判定 + 视距淡出
    this.surfaceLabels?.observe(camLocal, surfaceFade);
    this.cityLabels?.observe(camLocal, cityFade);

    // 地理教学读数：2Hz 写入 store，避免每帧触发 Vue 渲染
    if (now - this._geoInfoTime > 500) {
      this._geoInfoTime = now;
      const date = this.simulatedDate;
      const decl = calculateSolarDeclination(date);
      const subLon = calculateTrueSubsolarLongitude(date);
      state.geoInfo = {
        declination: decl,
        subsolarLat: decl,
        subsolarLon: subLon,
        utc: date.toISOString().slice(0, 19).replace("T", " ") + " UTC",
        beijingTime: formatHours(localMeanTime(date, 116.41)),
        londonTime: formatHours(localMeanTime(date, -0.13)),
        polarDayLat: polarLatitude(decl).polarDay,
      };
      // 直射点标签随读数一并刷新（2Hz，避免每帧写 DOM）
      layers.subsolar.setText(`直射点 ${formatLatLon(decl, subLon)}`);
    }
  }

  /** 聚焦视距所用的目标半径：取天体数据表半径，缺失时兜底 */
  _focusRadiusFor(object) {
    if (!object) return 100;
    const data = planetData[(object.name || "").toLowerCase()];
    return data ? data.radius : 100;
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
   * 天体标签 / 位置标记的遮挡体集合
   * 卫星只会被自己的母行星遮挡，直接返回母行星，避免逐帧对全部天体做射线检测
   * @param {string} name - 天体名
   * @returns {THREE.Object3D[]}
   */
  _occludersFor(name) {
    const data = planetData[name];
    if (data?.centralPlanet) {
      const parent = this.celestialGroups[data.centralPlanet];
      const parentMesh = parent?.children?.[0];
      if (parentMesh) return [parentMesh];
    }
    return [this.sun, ...Object.values(this.planets)];
  }

  /**
   * 挂接遮挡淡出：标签/标记被其他天体挡住时整体淡出
   * @param {CSS2DObject} iconLabel
   * @param {HTMLElement} iconDiv
   * @param {THREE.Mesh} selfMesh 自身网格（不参与自遮挡判定）
   * @param {THREE.Object3D[]} [occluders] 遮挡体集合（默认全部天体）
   */
  _attachOcclusionFade(iconLabel, iconDiv, selfMesh, occluders) {
    const _labelWorldPos = new THREE.Vector3();
    const _dir = new THREE.Vector3();
    const targets = occluders || [this.sun, ...Object.values(this.planets)];
    iconLabel.onBeforeRender = (_, __, camera) => {
      if (this._disposed) return;
      _labelWorldPos.setFromMatrixPosition(iconLabel.matrixWorld);
      const labelDistance = camera.position.distanceTo(_labelWorldPos);
      _dir.copy(_labelWorldPos).sub(camera.position).normalize();
      this.raycaster.set(camera.position, _dir);
      const intersects = this.raycaster.intersectObjects(targets, false);
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
    this._attachOcclusionFade(marker, ringDiv, mesh, name ? this._occludersFor(name) : null);
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
      const colorUniform = orbit.material.uniforms.uColor;
      const originalColor = colorUniform.value.clone();
      const highlightColor = originalColor.clone().lerp(new THREE.Color(1, 1, 1), 0.8);
      iconDiv.addEventListener("mouseover", () => {
        // 轨迹线高亮：大幅向白色插值（透明度会被每帧可见性逻辑覆写，不可用）
        colorUniform.value.copy(highlightColor);
        // 圆环放大联动
        ringInner.parentElement.classList.add("hover");
        Object.assign(iconDiv.style, { background: "rgba(0,0,0,0.4)", boxShadow: `0 4px 12px rgba(0,0,0,0.7),0 0 15px ${highlightColor.getStyle()}` });
      });
      iconDiv.addEventListener("mouseout", () => {
        colorUniform.value.copy(originalColor);
        ringInner.parentElement.classList.remove("hover");
        Object.assign(iconDiv.style, { background: "transparent", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" });
      });
    }

    const iconLabel = new CSS2DObject(iconDiv);
    iconLabel.position.set(0, size * 1.5, 0);
    iconLabel.layers.set(0);
    mesh.add(iconLabel);
    this._attachOcclusionFade(iconLabel, iconDiv, mesh, this._occludersFor(name));
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
    // 相机焦距（LENS 面板）
    commands.setFocalLength = (mm) => this._setFocalLength(mm);
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
    // 视距下限：保证天体最近表面仍在近裁剪面（0.001）之外，火卫二等
    // 极小卫星的半径本身已与近裁剪面同量级
    const finalDistance = Math.max(fixedDistance, radius * safety, 0.0025);

    // 逐目标缩放区间交给 OrbitControls：锁定期间滚轮/双指由其统一处理
    this.controls.minDistance = Math.max(radius * safety, 0.0025);
    // 锁定期间禁用平移：pan 会移动 controls.target，与每帧的跟随重置冲突
    this.controls.enablePan = false;

    // 保持当前观察方向：偏移固定为「相机后方 × 安全视距」
    const endOffset = new THREE.Vector3(0, 0, finalDistance).applyQuaternion(
      this.camera.quaternion
    );
    this._prevFollowTarget = null; // 过渡结束后由首帧跟随写入基准

    // 卫星取景：沿「中心天体 → 目标」向外取景，让中心行星留在背景画面中
    //（火卫一等小卫星视距极小，沿用「相机后方」方向会只剩星空背景）
    const targetData = planetData[(mesh.name || "").toLowerCase()];
    const parentGroup = targetData?.centralPlanet
      ? this.celestialGroups[targetData.centralPlanet]
      : null;
    if (parentGroup) {
      parentGroup.getWorldPosition(this._tmpVec);
      this._tmpVec2 = this._tmpVec2 || new THREE.Vector3();
      const outward = this._tmpVec2.copy(targetPos).sub(this._tmpVec);
      if (outward.lengthSq() > 1e-12) {
        endOffset.copy(outward.normalize()).multiplyScalar(finalDistance);
      }
    } else {
      // 近地小天体保护：月球等小天体视距很小，若沿用「相机后方」方向，
      // 相机可能落进地球球体内部（穿模、只剩星空背景）。
      // 此时改为沿「地心 → 目标」向外取景，得到「小天体 + 地球背景」的正确画面。
      const earthMesh = this.planets?.earth;
      if (earthMesh && mesh !== earthMesh && mesh !== this.sun) {
        earthMesh.getWorldPosition(this._tmpVec);
        this._tmpVec2 = this._tmpVec2 || new THREE.Vector3();
        const outward = this._tmpVec2.copy(targetPos).sub(this._tmpVec);
        if (outward.lengthSq() > 1e-12) {
          outward.normalize();
          const camPos = targetPos.clone().add(endOffset);
          if (camPos.distanceTo(this._tmpVec) < planetData.earth.radius * 1.15) {
            endOffset.copy(outward).multiplyScalar(finalDistance);
          }
        }
      }
    }

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

  /** 通用聚焦入口：按数据表取半径，聚焦并打开信息面板 */
  _focusByMesh(mesh) {
    if (!mesh) return;
    const name = (mesh.name || "").toLowerCase();
    this._selectAndFocus(mesh, this._focusRadiusFor(mesh));
    state.selectedBody = name || null;
    // 打开信息面板（并收起右侧的图层 / 镜头面板，三者互斥）
    showRightPanel("info");
  }

  /** 解除相机锁定，恢复自由漫游（Esc 键或点击徽标上的 RELEASE） */
  _unlockCamera() {
    this._cancelTransition();
    this.cameraTarget = null;
    this._prevFollowTarget = null;
    this.controls.minDistance = 0.001; // 恢复自由缩放区间（锁定时按目标收紧）
    this.controls.enablePan = true;
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

    const key = (mesh.name || "").toLowerCase();
    const name = (mesh.name || "").toUpperCase();
    const cn = cnNames[key];
    this._lockEl.querySelector(".lock-txt").textContent =
      `LOCKED · ${name}${cn ? " / " + cn : ""}`;
  }

  /** 可拾取目标（太阳 + 八大行星 + 月球 + 卫星） */
  _getPickTargets() {
    return [this.sun, ...Object.values(this.planets)];
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

  /** 轨道线以屏幕像素定义线宽：分辨率变化时同步给 ShaderMaterial */
  _updateOrbitResolution() {
    if (!this.renderer || !this.orbits) return;
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    Object.values(this.orbits).forEach((o) => {
      o?.material?.uniforms?.uResolution?.value?.set(w, h);
    });
  }

  /** 等效焦距（mm）→ 垂直 FOV（度）：f = 12 / tan(fov/2) */
  _focalToFov(mm) {
    return (2 * Math.atan(SENSOR_HEIGHT_MM / (2 * mm)) * 180) / Math.PI;
  }

  /**
   * 设置相机焦距（LENS 面板调用）
   *
   * 只改垂直 FOV，不改相机位置：因此「相机与目标的距离」不变，
   * 纯光学变焦；聚焦取景距离（_selectAndFocus）里的 tanHalf 会自适应新 FOV。
   * 滚轮/双指推拉由 OrbitControls 统一处理，与焦距互不干扰。
   *
   * @param {number} mm - 35mm 全画幅等效焦距
   */
  _setFocalLength(mm) {
    const focal = Math.min(
      FOCAL_MAX_MM,
      Math.max(FOCAL_MIN_MM, Number(mm) || state.focalLength || 12)
    );
    this.camera.fov = this._focalToFov(focal);
    this.camera.updateProjectionMatrix();
    // 运镜结束时以 _savedFov 恢复画面：同步刷新，避免用户改焦后被运镜回滚
    this._savedFov = this.camera.fov;
    state.focalLength = focal;
    // 太阳光晕按屏幕像素定尺寸，其换算依赖 FOV
    if (this.sunHalo) this._updateSpriteSize(this.sunHalo);
  }

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

  /**
   * 清理 OrbitControls 残留的指针捕获：pointerup 丢失（拖拽中失焦、
   * 事件被上层拦截等）会让其内部指针表残留旧指针，此后旋转被当成
   * 多点触控处理——表现为鼠标旋转「卡位/锁位」。
   *
   * 只能在「所有鼠标键均已释放」的时刻调用：OrbitControls 收到
   * pointercancel 会无条件把交互状态重置为 NONE，若在拖拽进行中
   * 补发会顺带杀掉正在进行的旋转。
   * @param {number} activeId - 当前事件的指针（跳过，不干扰正常手势）
   */
  _healStalePointers(activeId) {
    const canvas = this.renderer?.domElement;
    if (!canvas) return;
    for (let id = 0; id < 128; id++) {
      if (id === activeId) continue;
      try {
        if (canvas.hasPointerCapture(id)) {
          canvas.dispatchEvent(
            new PointerEvent("pointercancel", { pointerId: id, bubbles: true })
          );
        }
      } catch {
        /* hasPointerCapture 对未知 id 不抛错，此处仅为兜底 */
      }
    }
  }

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

  _onWindowPointerUp = (event) => {
    this._pointerDown = null;
    // 所有鼠标键均已释放的安全时刻：清理 OrbitControls 残留的指针捕获
    //（丢失 pointerup 的旧指针会让后续旋转被当作多点触控而卡位）
    if (this._disposed) return;
    if (event.buttons === 0 && event.pointerType !== "touch") {
      this._healStalePointers(event.pointerId);
    }
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
    this.controls.enablePan = true; // 运镜结束恢复自由漫游（锁定期间会被关闭）
    // 相机保持当前位置；下次锁定天体时按新位置起算（跟随基准届时重建）
    this.cameraTarget = null;
    this._prevFollowTarget = null;
    this.selectedCelestial = null;
    state.selectedBody = null;
    state.infoPanelOpen = false;
    this._syncDirectorState();
  }

  /** 运镜状态同步给 UI：TopBar 按钮据此切换 CINEMATIC / SKIP 文案与激活态 */
  _syncDirectorState() {
    state.directorActive = this.directorActive;
  }

  /** 运行帧数 + 镜头速度统计初始化：读数经 store 交给 HUD 组件渲染（DOM 由 Vue 管理） */
  _initFpsCounter() {
    this._fpsFrames = 0;
    this._fpsWindowStart = performance.now();
    // 速度使用独立短窗口：读数跟随更即时，且不影响 FPS 统计噪声
    this._speedWindowStart = performance.now();
    this._prevCamPos = this.camera.position.clone();
  }

  /** 帧计数 + 速度统计：FPS 0.5s / 速度 0.2s 各自刷新（频繁更新反而引入抖动） */
  _tickFps() {
    this._fpsFrames++;
    const now = performance.now();

    // 镜头速度：短窗口内平均位移速率。1 场景单位 = 1 万公里 → v 单位/s = v 万km/s
    const speedElapsed = now - this._speedWindowStart;
    if (speedElapsed >= 200) {
      const dist = this.camera.position.distanceTo(this._prevCamPos);
      state.camSpeed = this._formatSpeed(dist / (speedElapsed / 1000));
      this._prevCamPos.copy(this.camera.position);
      this._speedWindowStart = now;
    }

    const elapsed = now - this._fpsWindowStart;
    if (elapsed >= 500) {
      state.fps = Math.round((this._fpsFrames * 1000) / elapsed);
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
          // 月球潮汐锁定：贴图 0° 经线（正面月海面）恒指地球，
          // 自转相位由公转几何直接给出，而非与公转无对齐的累计自转
          if (name === "moon") {
            planet.rotation.y = Math.atan2(
              -(centralWorld.z - worldPosition.z),
              centralWorld.x - worldPosition.x
            );
          }
          group.position.copy(worldPosition.sub(centralWorld));
        }
      } else {
        group.position.copy(worldPosition);
      }

      if (name === "earth") {
        planet.rotation.set(0, 0, 0);
        // J2000 平黄赤交角；自转轴倾向方位由 utils 计入岁差后给出
        const axialTilt = (23.4393 * Math.PI) / 180;
        const azimuth = calculateEarthAxisAzimuth(this.simulatedDate);
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
      } else if (name !== "moon") {
        // 月球自转已按潮汐锁定单独处理（见上方卫星定位分支）
        if (IAU_SPIN_PLANETS.has(name)) {
          // 有 IAU 自转模型的行星：自转经度 W(t) 驱动贴图真实相位，
          // 绕组已对准的真实极轴旋转（土星环指向与 NASA Eyes 当前显示一致）
          planet.rotation.y = iauSpinY(name, this.simulatedDate);
        } else {
          const simulatedTimeDiff = (this.simulatedDate - this.initialSimulatedDate) / 1000;
          const rotationPeriodSeconds = Math.abs(data.day * 3600);
          const totalRotation = (2 * Math.PI * simulatedTimeDiff) / rotationPeriodSeconds;
          const rotationDirection = data.day > 0 ? 1 : -1;
          planet.rotation.y = rotationDirection * totalRotation;
        }
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

  /**
   * 月相教学标签初始化：CSS2D 标签挂在月球网格上方，
   * 贴近月球时渐显（透明度在 _updateMoonPhase 每帧驱动）
   */
  _initMoonPhase() {
    if (!this.planets.moon) return;
    const el = createSurfaceLabel("", { accent: "#c9c4bb" });
    el.style.opacity = "0";
    const obj = new CSS2DObject(el);
    obj.position.set(0, planetData.moon.radius * 2.6, 0);
    this.planets.moon.add(obj);
    this.moonPhaseTag = { el, obj };
  }

  /**
   * 月相教学每帧更新（数据 2Hz 节流写入 store，标签透明度每帧驱动）：
   * 距角/照明比/月龄由日-地-月几何实时计算，与场景中月球的明暗光照一致
   */
  _updateMoonPhase() {
    if (!this.planets.moon || !this.planets.earth) return;
    const moonWorld = new THREE.Vector3().setFromMatrixPosition(this.planets.moon.matrixWorld);
    const earthWorld = new THREE.Vector3().setFromMatrixPosition(this.planets.earth.matrixWorld);

    const now = performance.now();
    if (now - this._moonPhaseTime > 500) {
      this._moonPhaseTime = now;
      const sunDir = this.sun.position.clone().sub(earthWorld).normalize();
      const moonDir = moonWorld.clone().sub(earthWorld).normalize();
      state.moonPhase = moonPhaseFromDirections(sunDir, moonDir);
      if (this.moonPhaseTag) {
        const p = state.moonPhase;
        this.moonPhaseTag.el.innerHTML =
          `<span class="surface-label-dot" style="background:#c9c4bb"></span>` +
          `<span>月相 ${p.name} · 照明 ${p.illumPct}% · 月龄 ${p.ageDays} 天</span>`;
      }
    }

    // 标签透明度：贴近月球渐显（每帧）
    if (this.moonPhaseTag) {
      const d = this.camera.position.distanceTo(moonWorld);
      const fade = 1 - THREE.MathUtils.smoothstep(d, 1.5, 4.5);
      this.moonPhaseTag.el.style.opacity = fade.toFixed(2);
    }
  }

  /** 环影 uniform 每帧更新：太阳位置转入各环本地系；土星盘面环影用世界系姿态 */
  _updateRingShadows() {
    const rings = Object.values(this.ringMeshes);
    if (!rings.length) return;
    // 太阳固定在场景原点（position 即世界坐标）
    const sunWorld = this.sun.position;
    rings.forEach((ring) => {
      ring.updateWorldMatrix(true, false);
      const sunLocal = ring.userData.sunUniform.value;
      sunLocal.copy(sunWorld);
      ring.worldToLocal(sunLocal);
    });
    if (this._saturnRingShadow) {
      const ring = this.ringMeshes.saturn;
      const u = this._saturnRingShadow;
      u.uSunWorld.value.copy(sunWorld);
      this.planets.saturn.updateWorldMatrix(true, false);
      u.uPlanetWorld.value.setFromMatrixPosition(this.planets.saturn.matrixWorld);
      u.uRingNormal.value.set(0, 0, 1).transformDirection(ring.matrixWorld);
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
    // 新材质的 resolution 是默认值 (1,1)：不同步会让线宽换算错误（线被拉爆或不可见）
    this._updateOrbitResolution();
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
        orbit.material.uniforms.uOpacity.value = 0.45 * factor;
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
    // 过渡保险：rAF 链意外断链时自动复位，避免输入永久锁死
    //（正常路径 _transitionRaf 与 _isTransitioning 同步赋值/清理，不会误触发）
    if (this._isTransitioning && this._transitionRaf === null && !this.directorActive) {
      this._isTransitioning = false;
      this.controls.enabled = true;
    }
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
    // 地球教学图层：依赖 _updatePlanets 写入的地球姿态与太阳方向
    this._updateEarthLayers();
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
      // 刚性跟随：目标移动多少，相机与轨道中心就平移多少。
      // 缩放与旋转完全交给 OrbitControls（单一写入者，杜绝自动缩放）——
      // 旧实现每帧按 cameraOffset×distanceScale 覆盖相机位置，与 controls
      // 的阻尼/缩放互相打架，靠「偏差同步」补偿反而造成操控时的自动缩放
      const targetPos = new THREE.Vector3();
      this.cameraTarget.getWorldPosition(targetPos);
      if (this._prevFollowTarget) {
        this.camera.position.add(targetPos.clone().sub(this._prevFollowTarget));
      }
      this._prevFollowTarget = targetPos.clone();
      this.controls.target.copy(targetPos);

      // 太阳安全距离：偶发越界一次性推出，OrbitControls 会从新位置继续
      const sunPos = new THREE.Vector3();
      this.sun.getWorldPosition(sunPos);
      const sunSafe = this.sunRadius * 1.2;
      if (this.camera.position.distanceTo(sunPos) < sunSafe) {
        const dir = this.camera.position.clone().sub(sunPos).normalize();
        this.camera.position.copy(sunPos.add(dir.multiplyScalar(sunSafe)));
      }
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

    // 环影 uniform：太阳方向转入环本地系 / 土星盘面环影的世界姿态
    this._updateRingShadows();
    // 月相教学：实时要素写入 store + 标签文本/透明度
    this._updateMoonPhase();

    // 过渡/运镜期间禁用 controls.update()：它会按逐目标 minDistance 钳制
    // 插值中的相机距离（如土卫一 → 土星，下限从 0.0025 跳到 6.99），
    // 与飞行动画互相覆盖导致视角卡死；其余时候启用以应用用户旋转/缩放
    if (!this.directorActive && !this._isTransitioning) this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  dispose() {
    this._disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._cancelTransition();
    window.removeEventListener("resize", this._onResize);
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
    this.surfaceLabels?.dispose();
    this.cityLabels?.dispose();
    state.directorActive = false;
    commands.toggleDirector = null;
    commands.setFocalLength = null;
    this.controls?.dispose();
    this.renderer?.dispose();
    if (this.renderer?.domElement?.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    if (this.labelRenderer?.domElement?.parentNode) this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
  }
}
