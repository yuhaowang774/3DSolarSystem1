import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import {
  latLonToLocal,
  KEY_CIRCLES,
  GEO_CITIES,
  GRATICULE_LAT_STEP,
  GRATICULE_LON_STEP,
} from "../js/geo.js";

/**
 * ===================== 地球教学图层 =====================
 * 全部挂在地球网格之下（随地球自转与轴倾角一起运动），本地坐标即地理坐标，
 * 因此经纬网、城市、直射点、晨昏线的位置都与贴图经纬度严格对应。
 */

const RAD = Math.PI / 180;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** 纬线（平行圈）采样点 */
function parallelPoints(lat, radius, segments = 160) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    pts.push(latLonToLocal(lat, (360 * i) / segments - 180, radius, new THREE.Vector3()));
  }
  return pts;
}

/** 经线采样点（北极 → 南极半圆） */
function meridianPoints(lon, radius, segments = 120) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    pts.push(latLonToLocal(90 - (180 * i) / segments, lon, radius, new THREE.Vector3()));
  }
  return pts;
}

function lineFromPoints(points, { color = 0xffffff, opacity = 0.16, closed = false } = {}) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const line = closed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
  line.renderOrder = 3;
  return line;
}

/** 统一的标签 DOM（轻量、可点击、随遮挡/远近距离淡出） */
export function createSurfaceLabel(text, { cn = true, accent = "" } = {}) {
  const el = document.createElement("div");
  el.className = "surface-label";
  el.innerHTML = accent
    ? `<span class="surface-label-dot" style="background:${accent}"></span><span>${text}</span>`
    : `<span>${text}</span>`;
  Object.assign(el.style, {
    fontFamily: "'Archivo', system-ui, sans-serif",
    fontSize: cn ? "10px" : "9px",
    letterSpacing: cn ? "1px" : "2px",
    textTransform: cn ? "none" : "uppercase",
    color: "#f5f5f7",
    whiteSpace: "nowrap",
    textShadow: "0 1px 6px rgba(0,0,0,0.95)",
    pointerEvents: "none",
    transition: "opacity 0.2s ease",
    padding: "1px 4px",
  });
  return el;
}

/**
 * 地表标签可见性管理器：以「标签法线与相机方向夹角」判断正/背面，
 * 比逐标签射线投射便宜得多（城市 + 关键纬线共 20+ 个标签）
 */
export function createSurfaceLabelManager() {
  const items = [];
  const camDir = new THREE.Vector3();
  return {
    /** 注册一个贴地标签（localPos 为地球本地坐标） */
    add(el, localPos) {
      items.push({ el, dir: localPos.clone().normalize() });
    },
    /**
     * 每帧刷新
     * @param {THREE.Vector3} camLocalPos - 相机在地球本地坐标系中的位置
     * @param {number} distanceFactor - 距离淡出系数（0-1）
     */
    observe(camLocalPos, distanceFactor = 1) {
      camDir.copy(camLocalPos).normalize();
      for (const item of items) {
        const facing = THREE.MathUtils.smoothstep(item.dir.dot(camDir), -0.02, 0.22);
        const opacity = facing * distanceFactor;
        // 仅在可见性发生明显变化时写 DOM，避免每帧无谓的样式重算
        if (Math.abs(opacity - (item.lastOpacity ?? -1)) < 0.01) continue;
        item.lastOpacity = opacity;
        item.el.style.opacity = opacity.toFixed(3);
        item.el.style.visibility = opacity < 0.02 ? "hidden" : "visible";
      }
    },
    /** 整体销毁（移除 DOM） */
    dispose() {
      items.forEach((i) => i.el.remove());
      items.length = 0;
    },
  };
}

/**
 * 经纬网：15° 间隔的经纬线 + 五条教学重点纬线（赤道 / 回归线 / 极圈）
 * @param {number} radius - 地球半径（场景单位）
 * @param {ReturnType<typeof createSurfaceLabelManager>} labelManager
 * @returns {THREE.Group}
 */
export function buildGraticule(radius, labelManager) {
  const group = new THREE.Group();
  group.name = "earth-graticule";
  const r = radius * 1.0016;
  const labelR = radius * 1.012;

  // 普通纬线（跳过重点纬线，避免叠线）
  const keyLats = new Set(KEY_CIRCLES.map((c) => c.lat.toFixed(3)));
  for (let lat = -75; lat <= 75; lat += GRATICULE_LAT_STEP) {
    if (keyLats.has(lat.toFixed(3))) continue;
    group.add(lineFromPoints(parallelPoints(lat, r), { opacity: 0.13 }));
  }
  // 普通经线
  for (let lon = 0; lon < 360; lon += GRATICULE_LON_STEP) {
    group.add(lineFromPoints(meridianPoints(lon - 180, r), { opacity: 0.13 }));
  }

  // 教学重点纬线（加粗高亮，并在本初子午线上标注名称）
  KEY_CIRCLES.forEach((circle) => {
    const color = new THREE.Color(circle.color);
    group.add(
      lineFromPoints(parallelPoints(circle.lat, radius * 1.0026), {
        color,
        opacity: 0.5,
        closed: true,
      })
    );
    const el = createSurfaceLabel(circle.label, { accent: circle.color });
    const pos = latLonToLocal(circle.lat, 0, labelR);
    const label = new CSS2DObject(el);
    label.position.copy(pos);
    label.layers.set(0);
    group.add(label);
    if (labelManager) labelManager.add(el, pos);
  });

  return group;
}

/** 地轴：贯穿南北极并外延的自转轴线 + 极点标记 */
export function buildEarthAxis(radius) {
  const group = new THREE.Group();
  group.name = "earth-axis";
  const h = radius * 1.6;

  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -h, 0),
    new THREE.Vector3(0, h, 0),
  ]);
  const axis = new THREE.Line(geometry, material);
  axis.renderOrder = 3;
  group.add(axis);

  const poleGeo = new THREE.SphereGeometry(radius * 0.012, 12, 12);
  const poleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  [1, -1].forEach((sign) => {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0, sign * radius, 0);
    group.add(pole);
  });

  return group;
}

/**
 * 晨昏线：与太阳方向垂直的大圆（地球上昼夜半球的分界线）
 * @param {number} radius - 地球半径
 * @returns {{group: THREE.Group, update: (sunLocalDir: THREE.Vector3) => void}}
 */
export function buildTerminator(radius) {
  const group = new THREE.Group();
  group.name = "earth-terminator";

  const r = radius * 1.004;
  const pts = [];
  for (let i = 0; i <= 240; i++) {
    const a = (2 * Math.PI * i) / 240;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  const line = lineFromPoints(pts, { color: 0xffd7a1, opacity: 0.75, closed: true });
  line.renderOrder = 4;
  group.add(line);

  const quat = new THREE.Quaternion();
  return {
    group,
    /** @param {THREE.Vector3} sunLocalDir - 地球本地坐标系中指向太阳的单位向量 */
    update(sunLocalDir) {
      quat.setFromUnitVectors(Z_AXIS, sunLocalDir);
      group.quaternion.copy(quat);
    },
  };
}

/**
 * 太阳直射点标记：地表光环 + 实时坐标标签
 * （直射点随地球自转在本地坐标系中移动，故不接入地表标签管理器，
 *   其可见性由场景按「直射点方向 · 相机方向」逐帧判定）
 * @param {number} radius - 地球半径
 */
export function buildSubsolarMarker(radius) {
  const group = new THREE.Group();
  group.name = "earth-subsolar";

  const el = createSurfaceLabel("直射点", { accent: "#ffd166" });
  el.style.fontSize = "10px";
  const label = new CSS2DObject(el);
  group.add(label);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.016, radius * 0.024, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.renderOrder = 4;
  group.add(ring);

  const dir = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  function place(lat, lon) {
    latLonToLocal(lat, lon, radius * 1.008, anchor);
    dir.copy(anchor).normalize();
    quat.setFromUnitVectors(Z_AXIS, dir);
    ring.position.copy(anchor);
    ring.quaternion.copy(quat);
    label.position.copy(latLonToLocal(lat, lon, radius * 1.12, new THREE.Vector3()));
  }

  return {
    group,
    el,
    ring,
    place,
    setText(text) {
      el.querySelector("span:last-child").textContent = text;
    },
  };
}

/**
 * 城市标记：地表小球 + 中文名标签
 * @param {number} radius - 地球半径
 * @param {ReturnType<typeof createSurfaceLabelManager>} labelManager
 */
export function buildCityMarkers(radius, labelManager) {
  const group = new THREE.Group();
  group.name = "earth-cities";

  const dotGeo = new THREE.SphereGeometry(radius * 0.0052, 10, 10);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

  GEO_CITIES.forEach((city) => {
    const pos = latLonToLocal(city.lat, city.lon, radius * 1.004);
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(pos);
    group.add(dot);

    if (labelManager) {
      const el = createSurfaceLabel(city.cn);
      const label = new CSS2DObject(el);
      label.position.copy(latLonToLocal(city.lat, city.lon, radius * 1.035));
      label.layers.set(0);
      group.add(label);
      labelManager.add(el, pos);
    }
  });

  return group;
}
