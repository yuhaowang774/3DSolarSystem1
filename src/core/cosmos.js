// 程序化宇宙呈现层（NASA Eyes 风格）
// - 天球星野：替代贴图天球，恒星按银河带密度分布，表现为无穷远背景
// - 银河系呈现层：太阳邻域恒星（缩放时「散开」）+ 银盘旋臂 + 核球 + 银心光晕
//
// 尺度约定：行星/轨道沿用真实比例（1 单位 = 1 万公里）；
// 恒星与银河系采用压缩呈现比例 1 光年 = 1e5 单位，
// 使「行星 → 星际空间 → 银河系圆盘」能在一个连续缩放区间内呈现。
import * as THREE from "three";

const LY = 1e5; // 呈现比例：1 光年的场景单位数
const GC_DISTANCE_LY = 26490; // 太阳到银心（光年）
const DISC_RADIUS_LY = 52000; // 银盘呈现半径（光年）
const STARFIELD_RADIUS = 4e9; // 天球星野半径（无穷远背景）

// 可复现随机：保证每次加载的星空一致
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 银道坐标系：银北极与黄极（Y 轴）夹 60.2°，银心沿 +X 方向
function galacticFrame() {
  const tilt = THREE.MathUtils.degToRad(60.2);
  const ngp = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0).normalize();
  const center = new THREE.Vector3(1, 0, 0);
  const u = center.clone().sub(ngp.clone().multiplyScalar(center.dot(ngp))).normalize();
  const v = new THREE.Vector3().crossVectors(ngp, u).normalize();
  return { ngp, u, v };
}

// 恒星色板（按光谱型，权重近似肉眼亮星分布）
const STAR_COLORS = [
  { c: [0.62, 0.72, 1.0], w: 2 }, // O/B 蓝白
  { c: [0.8, 0.87, 1.0], w: 3 }, // A 白
  { c: [1.0, 1.0, 1.0], w: 4 }, // F 白
  { c: [1.0, 0.96, 0.88], w: 4 }, // G 黄白
  { c: [1.0, 0.87, 0.72], w: 3 }, // K 橙
  { c: [1.0, 0.72, 0.55], w: 1 }, // M 红
];
const COLOR_TOTAL = STAR_COLORS.reduce((s, x) => s + x.w, 0);

function pickStarColor(rng) {
  let r = rng() * COLOR_TOTAL;
  for (const item of STAR_COLORS) {
    if ((r -= item.w) <= 0) return item.c;
  }
  return STAR_COLORS[2].c;
}

// 天球方向采样：bandProb 概率落在银道带（|银纬| 高斯分布），
// 银道带内再向银心方向加密 —— 再现真实星空的「银河」
function randomSkyDirection(rng, frame, bandProb) {
  let b;
  let l;
  if (rng() < bandProb) {
    b = gaussian(rng) * THREE.MathUtils.degToRad(9);
    l = rng() < 0.32 ? gaussian(rng) * THREE.MathUtils.degToRad(35) : rng() * Math.PI * 2;
  } else {
    b = Math.asin(rng() * 2 - 1);
    l = rng() * Math.PI * 2;
  }
  const cosb = Math.cos(b);
  return frame.u
    .clone()
    .multiplyScalar(cosb * Math.cos(l))
    .add(frame.v.clone().multiplyScalar(cosb * Math.sin(l)))
    .add(frame.ngp.clone().multiplyScalar(Math.sin(b)))
    .normalize();
}

function buildPointsLayer(positions, colors, size, baseOpacity, attenuate) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size,
    sizeAttenuation: attenuate,
    vertexColors: true,
    transparent: true,
    opacity: baseOpacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mat.userData.baseOpacity = baseOpacity;
  return new THREE.Points(geo, mat);
}

/**
 * 天球星野：近/中/亮三层恒星，按银河带密度分布在天球上
 * sizeAttenuation 关闭 —— 无论相机拉多远都表现为无穷远的背景星海
 * @returns {THREE.Group}
 */
export function createStarfield() {
  const rng = mulberry32(20260907);
  const frame = galacticFrame();
  const group = new THREE.Group();
  const layers = [
    { count: 6200, size: 1.1, bandProb: 0.64 },
    { count: 1600, size: 1.9, bandProb: 0.55 },
    { count: 420, size: 3.0, bandProb: 0.45 },
  ];
  for (const layer of layers) {
    const positions = new Float32Array(layer.count * 3);
    const colors = new Float32Array(layer.count * 3);
    for (let i = 0; i < layer.count; i++) {
      const dir = randomSkyDirection(rng, frame, layer.bandProb);
      positions[i * 3] = dir.x * STARFIELD_RADIUS;
      positions[i * 3 + 1] = dir.y * STARFIELD_RADIUS;
      positions[i * 3 + 2] = dir.z * STARFIELD_RADIUS;
      const c = pickStarColor(rng);
      const lum = 0.5 + rng() * 0.5;
      colors[i * 3] = c[0] * lum;
      colors[i * 3 + 1] = c[1] * lum;
      colors[i * 3 + 2] = c[2] * lum;
    }
    group.add(buildPointsLayer(positions, colors, layer.size, 0.95, false));
  }
  return group;
}

// 银心光晕贴图（canvas 径向渐变，避免依赖外部资源）
function makeGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,244,220,1)");
  g.addColorStop(0.22, "rgba(255,234,196,0.55)");
  g.addColorStop(0.55, "rgba(255,218,168,0.12)");
  g.addColorStop(1, "rgba(255,218,168,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/**
 * 银河系呈现层
 * - 邻域恒星：太阳周围 ~1200 光年的三维分布，sizeAttenuation 开启，
 *   缩小时产生「恒星在星际空间中散开」的透视效果
 * - 银盘：四条对数螺旋臂 + 盘面散布 + 中央核球，太阳系位于盘内原点
 * - 银心光晕 + 远景太阳标记（缩到极远时太阳系保持一个可见亮点）
 * @returns {{group: THREE.Group, materials: THREE.Material[], sunDot: THREE.Sprite}}
 */
export function createGalaxy() {
  const rng = mulberry32(9917);
  const frame = galacticFrame();
  const group = new THREE.Group();
  const materials = [];

  // 世界坐标 = 银心 + 银道坐标偏移
  const gcWorld = frame.u.clone().multiplyScalar(GC_DISTANCE_LY * LY);
  const toWorld = (x, y, z, out) =>
    out.set(
      gcWorld.x + frame.u.x * x + frame.v.x * y + frame.ngp.x * z,
      gcWorld.y + frame.u.y * x + frame.v.y * y + frame.ngp.y * z,
      gcWorld.z + frame.u.z * x + frame.v.z * y + frame.ngp.z * z
    );

  // —— 银盘：四条对数螺旋臂 + 臂间散布 ——
  const ARMS = 4;
  const PITCH = Math.tan(THREE.MathUtils.degToRad(13));
  const DISC_COUNT = 36000;
  const RIDGE_COUNT = 9000; // 臂脊亮星：勾勒旋臂骨架
  const discPos = new Float32Array(DISC_COUNT * 3);
  const discCol = new Float32Array(DISC_COUNT * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < DISC_COUNT; i++) {
    const r = 2600 + (DISC_RADIUS_LY - 2600) * Math.pow(rng(), 0.72); // ly
    let onArm = false;
    let theta;
    if (rng() < 0.8) {
      // 旋臂：对数螺旋 + 随半径展宽的角向散布
      const arm = Math.floor(rng() * ARMS);
      theta =
        Math.log(r / 1200) / PITCH +
        (arm * 2 * Math.PI) / ARMS +
        gaussian(rng) * (0.07 + 60 / r);
      onArm = true;
    } else {
      theta = rng() * Math.PI * 2;
    }
    const rr = r + gaussian(rng) * r * 0.05; // 径向散布
    const z = gaussian(rng) * (90 + r * 0.02); // 盘厚随半径缓慢增厚
    toWorld(rr * Math.cos(theta), rr * Math.sin(theta), z, tmp);
    discPos[i * 3] = tmp.x;
    discPos[i * 3 + 1] = tmp.y;
    discPos[i * 3 + 2] = tmp.z;
    // 内暖外蓝：核区偏黄白，旋臂区偏蓝白，混入少量红巨星
    const warm = Math.max(0, 1 - r / 16000);
    const c = rng() < 0.12 ? [1.0, 0.72, 0.55] : pickStarColor(rng);
    // 旋臂上的年轻亮星更亮；外缘渐淡
    const edgeFade = 1 - 0.6 * THREE.MathUtils.smoothstep(r, 38000, DISC_RADIUS_LY);
    const lum =
      (0.42 + rng() * 0.5) * (0.75 + warm * 0.6) * (onArm ? 1.65 : 0.32) * edgeFade;
    discCol[i * 3] = c[0] * lum;
    discCol[i * 3 + 1] = c[1] * lum;
    discCol[i * 3 + 2] = c[2] * lum;
  }
  const disc = buildPointsLayer(discPos, discCol, 1.4, 0.85, false);
  materials.push(disc.material);
  group.add(disc);

  // —— 臂脊亮星：沿旋臂骨架的年轻蓝白亮星，让旋臂清晰可辨 ——
  const ridgePos = new Float32Array(RIDGE_COUNT * 3);
  const ridgeCol = new Float32Array(RIDGE_COUNT * 3);
  for (let i = 0; i < RIDGE_COUNT; i++) {
    const r = 5200 + (DISC_RADIUS_LY - 5200) * Math.pow(rng(), 0.8);
    const arm = Math.floor(rng() * ARMS);
    const theta =
      Math.log(r / 1200) / PITCH +
      (arm * 2 * Math.PI) / ARMS +
      gaussian(rng) * (0.035 + 28 / r);
    const z = gaussian(rng) * (70 + r * 0.012);
    toWorld(r * Math.cos(theta), r * Math.sin(theta), z, tmp);
    ridgePos[i * 3] = tmp.x;
    ridgePos[i * 3 + 1] = tmp.y;
    ridgePos[i * 3 + 2] = tmp.z;
    const c = rng() < 0.6 ? [0.72, 0.82, 1.0] : [1.0, 0.96, 0.88];
    const lum = 0.75 + rng() * 0.45;
    ridgeCol[i * 3] = c[0] * lum;
    ridgeCol[i * 3 + 1] = c[1] * lum;
    ridgeCol[i * 3 + 2] = c[2] * lum;
  }
  const ridge = buildPointsLayer(ridgePos, ridgeCol, 2.6, 0.95, false);
  materials.push(ridge.material);
  group.add(ridge);

  // —— 核球：中央 3D 高斯分布，暖黄色 ——
  const BULGE_COUNT = 5200;
  const bulgePos = new Float32Array(BULGE_COUNT * 3);
  const bulgeCol = new Float32Array(BULGE_COUNT * 3);
  for (let i = 0; i < BULGE_COUNT; i++) {
    const x = gaussian(rng) * 2400; // 盘面内
    const y = gaussian(rng) * 2400; // 盘面内
    const z = gaussian(rng) * 1500; // 垂直盘面（扁）
    toWorld(x, y, z, tmp);
    bulgePos[i * 3] = tmp.x;
    bulgePos[i * 3 + 1] = tmp.y;
    bulgePos[i * 3 + 2] = tmp.z;
    const lum = 0.5 + rng() * 0.5;
    bulgeCol[i * 3] = 1.0 * lum;
    bulgeCol[i * 3 + 1] = 0.88 * lum;
    bulgeCol[i * 3 + 2] = 0.66 * lum;
  }
  const bulge = buildPointsLayer(bulgePos, bulgeCol, 1.9, 0.9, false);
  materials.push(bulge.material);
  group.add(bulge);

  // —— 太阳邻域恒星：缩放时的「星际散开」主角 ——
  const NEIGHBOR_COUNT = 1500;
  const nbPos = new Float32Array(NEIGHBOR_COUNT * 3);
  const nbCol = new Float32Array(NEIGHBOR_COUNT * 3);
  for (let i = 0; i < NEIGHBOR_COUNT; i++) {
    // 指数盘：银道面聚集，尺度 ~500 光年
    const rr = -Math.log(1 - rng()) * 500;
    const theta = rng() * Math.PI * 2;
    const z = gaussian(rng) * 240;
    toWorld(rr * Math.cos(theta), rr * Math.sin(theta), z, tmp);
    nbPos[i * 3] = tmp.x;
    nbPos[i * 3 + 1] = tmp.y;
    nbPos[i * 3 + 2] = tmp.z;
    const c = pickStarColor(rng);
    const lum = 0.55 + rng() * 0.45;
    nbCol[i * 3] = c[0] * lum;
    nbCol[i * 3 + 1] = c[1] * lum;
    nbCol[i * 3 + 2] = c[2] * lum;
  }
  const neighbors = buildPointsLayer(nbPos, nbCol, 4e5, 0.95, true);
  materials.push(neighbors.material);
  group.add(neighbors);

  // —— 银心光晕 ——
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0xfff2d8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  glow.material.userData.baseOpacity = 0.9;
  glow.position.copy(gcWorld);
  glow.scale.set(5200 * LY, 5200 * LY, 1);
  materials.push(glow.material);
  group.add(glow);

  // —— 远景太阳标记：极远处太阳系缩成一个可见亮点 ——
  const sunDot = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0xfff6e0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: false,
      blending: THREE.AdditiveBlending,
    })
  );
  sunDot.scale.set(0.02, 0.02, 1);
  group.add(sunDot);

  return { group, materials, sunDot };
}
