import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

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
  calculateEarthRotation,
  calculateTrueSubsolarLongitude,
  measureModelSubsolarLongitude,
  performSubsolarCalibration,
} from "../js/utils.js";
import { planetData } from "../js/dats.js";
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
    this.isAutoMoving = false;

    this.searchList = [];
    this._tmpVec = new THREE.Vector3();
    this._raf = null;
    this._disposed = false;

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
      // 单个纹理加载失败时不卡住：计入已加载并继续
      this.loadingManager.onError = (url) => {
        console.warn(`[SolarSystem] texture load failed: ${url}`);
        // onError 后 LoadingManager 会继续处理剩余项，
        // 但如果某个请求挂起（不触发 itemEnd），需要超时兜底
      };
    });
    // 超时兜底：即使个别纹理挂起，最多等 12s 强制完成
    this._loadingTimeout = setTimeout(finishLoading, 12000);
  }

  async init() {
    const startedAt = performance.now();
    this._initScene();
    this._initLights();
    this._initBodies();
    this._initRings();
    this._initLabels();
    this._bindCommands();
    this._bindInput();
    // 等待真实纹理加载完成（缓存命中也会立即 resolve）
    await this._onLoaded;
    // 至少展示 900ms，让加载动画可见且有仪式感
    const elapsed = performance.now() - startedAt;
    if (elapsed < 900) await new Promise((r) => setTimeout(r, 900 - elapsed));
    this._updateLoadingState(true);
    this.animate();
  }

  _updateLoadingState(done) {
    state.loading = !done;
    if (done) {
      state.loadingProgress = 100;
      state.loadingStage = STAGES.length - 1;
      state.loadingText = "SYSTEMS ONLINE";
    }
  }

  _initScene() {
    const { clientWidth: w, clientHeight: h } = this.container;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(90, w / h, 0.001, 1e10);
    this.camera.position.set(139.2 * 100, 69.6 * 100, 139.2 * 100);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
    });
    this.renderer.setSize(w, h);
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
    this.controls.maxDistance = 1e9;
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
    this.scene.add(new THREE.AmbientLight(0x404040));
    this.pointLight = new THREE.PointLight(0xffffff, 8, 0, 0.1);
    this.pointLight.position.set(0, 0, 0);
    this.pointLight.castShadow = true;
    this.pointLight.shadow.mapSize.width = 1024;
    this.pointLight.shadow.mapSize.height = 1024;
    this.scene.add(this.pointLight);
  }

  _initBodies() {
    const names = [
      "mercury", "venus", "earth", "mars",
      "jupiter", "saturn", "uranus", "neptune", "moon",
    ];

    this.universe = createUniverse(planetData.universe.name, planetData.universe.radius, this.loadingManager);
    this.sun = createSun(planetData.sun.name, planetData.sun.radius, this.loadingManager);

    this.sunHalo = createSprite("sun-glow", this.loadingManager);
    const sunRadius = this.sun.geometry.parameters.radius;
    this.sunHalo.scale.set(sunRadius, sunRadius, 1);
    this.sun.add(this.sunHalo);
    this.sunRadius = sunRadius;

    this.scene.add(this.universe);
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

      if (data.centralPlanet) {
        const parent = this.celestialGroups[data.centralPlanet];
        if (parent) parent.add(orbit);
      } else {
        this.orbitGroup.add(orbit);
      }

      if (data.centralPlanet) {
        const parent = this.celestialGroups[data.centralPlanet];
        if (parent) parent.add(group);
      } else {
        this.scene.add(group);
      }
    });

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
  }

  _addLabel(group, orbit, size, name) {
    if (!group.children[0]) return;
    const mesh = group.children[0];
    const iconDiv = document.createElement("div");
    iconDiv.className = "celestial-label";

    const planetColor = planetData[name]?.color || 0xffffff;
    const colorHex = "#" + planetColor.toString(16).padStart(6, "0");

    iconDiv.innerHTML = `
      <span class="planet-dot" style="background:${colorHex};"></span>
      <span class="planet-name">${name.toUpperCase()}</span>`;
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
      display: "flex",
      alignItems: "center",
      gap: "6px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
    });

    const handleClick = () => {
      this._selectAndFocus(mesh, planetData[mesh.name.toLowerCase()]?.radius || 100);
      state.selectedBody = mesh.name.toLowerCase();
      state.infoPanelOpen = true;
    };
    iconDiv.addEventListener("click", handleClick);
    iconDiv.addEventListener("touchstart", (e) => { e.preventDefault(); handleClick(); }, { passive: false });

    if (name !== "sun") {
      const originalColor = orbit.material.color.clone();
      iconDiv.addEventListener("mouseover", () => {
        orbit.material.color.copy(originalColor).multiplyScalar(1.5);
        orbit.material.linewidth = 3.0;
        Object.assign(iconDiv.style, { background: "rgba(0,0,0,0.4)", transform: "scale(1.05)", boxShadow: `0 4px 12px rgba(0,0,0,0.7),0 0 15px ${orbit.material.color.getStyle()}` });
      });
      iconDiv.addEventListener("mouseout", () => {
        orbit.material.color.copy(originalColor);
        orbit.material.linewidth = 1.5;
        Object.assign(iconDiv.style, { background: "transparent", transform: "scale(1)", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" });
      });
    }

    const iconLabel = new CSS2DObject(iconDiv);
    iconLabel.position.set(0, size * 1.5, 0);
    iconLabel.layers.set(0);
    mesh.add(iconLabel);

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
        if (it.object !== mesh && it.distance < labelDistance - 0.1) {
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

  _bindCommands() {
    commands.focusBody = (name) => {
      const item = this.searchList.find((s) => s.name === name);
      if (item) {
        this._selectAndFocus(item.mesh, item.offset);
        state.selectedBody = name;
        state.infoPanelOpen = true;
      }
    };
    commands.setTimeScale = () => {};
    commands.togglePlay = () => {};
    commands.toggleRealtime = () => {};
    commands.selectBody = (name) => {
      const item = this.searchList.find((s) => s.name === name);
      if (item) this._selectAndFocus(item.mesh, item.offset);
    };
    commands.closePanel = () => {
      this.selectedCelestial = null;
    };
  }

  _selectAndFocus(mesh, radius) {
    this.selectedCelestial = mesh;
    const targetPos = new THREE.Vector3();
    mesh.getWorldPosition(targetPos);
    const fovRad = this.camera.fov * (Math.PI / 180);
    const tanHalf = Math.tan(fovRad / 2);
    const fixedDistance = (radius * this.container.clientHeight) / (500 * tanHalf);
    const safety = radius > 10000 ? 1.5 : 1.2;
    const finalDistance = Math.max(fixedDistance, radius * safety);
    this.cameraOffset.set(0, 0, finalDistance);
    this.distanceScale = 1;
    this.isAutoMoving = true;
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const duration = 1000;
    const startTime = performance.now();
    const animateTransition = (now) => {
      if (this._disposed) return;
      const progress = Math.min((now - startTime) / duration, 1);
      const ease = progress * (2 - progress);
      const scaledOffset = this.cameraOffset.clone().multiplyScalar(this.distanceScale).applyQuaternion(this.camera.quaternion);
      this.camera.position.lerpVectors(startPos, targetPos.clone().add(scaledOffset), ease);
      this.controls.target.lerpVectors(startTarget, targetPos, ease);
      this.controls.update();
      if (progress < 1) requestAnimationFrame(animateTransition);
      else setTimeout(() => { this.isAutoMoving = false; }, 300);
    };
    requestAnimationFrame(animateTransition);
  }

  _bindInput() {
    window.addEventListener("wheel", this._onWheel, { passive: false });
    window.addEventListener("resize", this._onResize);
  }

  _onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._updateSpriteSize(this.sunHalo);
  };

  _onWheel = (event) => {
    if (!this.selectedCelestial) return;
    event.preventDefault();
    const targetPos = new THREE.Vector3();
    this.selectedCelestial.getWorldPosition(targetPos);
    const currentDistance = this.camera.position.distanceTo(targetPos);
    const name = this.selectedCelestial.name.toLowerCase();
    const planetRadius = planetData[name]?.radius || 1;
    const safety = planetRadius > 10000 ? 1.5 : 1.2;
    const minDistance = planetRadius * safety;
    const maxDistance = 1e9;
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
  }

  _updateOrbits() {
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
    }
  }

  _rebuildOrbit(name) {
    if (this.orbits[name] && this.orbits[name].parent) {
      this.orbits[name].parent.remove(this.orbits[name]);
    }
    const newOrbit = createOrbit(name, this.simulatedDate);
    this.orbits[name] = newOrbit;
    this.orbitGroup.add(newOrbit);
  }

  _updateVisibility() {
    Object.keys(this.celestialGroups).forEach((name) => {
      const group = this.celestialGroups[name];
      const data = planetData[name];
      if (!group || !data) return;
      group.getWorldPosition(this._tmpVec);
      const distance = this.camera.position.distanceTo(this._tmpVec);
      const sizeRatio = data.radius / planetData.earth.radius;
      const maxVisible = (data.a ? data.a[0] * 200000 : 10000) * sizeRatio;
      const isSelectedOrSat =
        this.selectedCelestial === group.children[0] ||
        (data.centralPlanet && this.selectedCelestial === this.celestialGroups[data.centralPlanet]?.children[0]);
      const shouldBeVisible = isSelectedOrSat || distance < maxVisible;
      group.children.forEach((child) => {
        if (child.isMesh || child.isGroup) child.visible = shouldBeVisible;
      });
      if (this.orbits[name]) this.orbits[name].visible = shouldBeVisible && true;
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

    if (this.selectedCelestial) {
      const targetPos = new THREE.Vector3();
      this.selectedCelestial.getWorldPosition(targetPos);
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

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  dispose() {
    this._disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._loadingTimeout) clearTimeout(this._loadingTimeout);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("wheel", this._onWheel);
    this.controls?.dispose();
    this.renderer?.dispose();
    if (this.renderer?.domElement?.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    if (this.labelRenderer?.domElement?.parentNode) this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
  }
}
