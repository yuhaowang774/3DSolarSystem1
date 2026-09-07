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

// 真实太阳邻域恒星（20 秒差距内，可靠观测数据）
// [RA(小时), Dec(度), 距离(光年), 色型索引(0蓝白~5红), 视星等]
const NEARBY_STARS = [
  [14.51, -62.68, 4.25, 5, -0.27], // 半人马座α系统
  [10.11, -36.72, 8.6, 0, -1.46], // 天狼星
  [5.38, -1.19, 10.34, 4, -0.74], // 老人星
  [17.97, 4.69, 5.96, 4, -0.05], // 大角星
  [13.42, -11.16, 36.7, 0, -0.67], // 织女星
  [18.99, 38.78, 25.0, 0, 0.03], // 五车二
  [7.66, 28.03, 16.7, 0, 0.34], // 五车五
  [1.64, -57.4, 11.4, 3, 0.46], // 南门二β
  [16.81, -34.3, 16.1, 4, 0.96], // 心宿二
  [18.15, -22.96, 6.0, 5, 5.9], // 巴纳德星
  [10.75, -5.02, 6.1, 5, 5.95], // 沃尔夫359
  [22.46, -15.28, 10.9, 4, 3.49], // 印第安座α
  [1.06, -16.71, 8.53, 5, 3.73], // 鲸鱼座τ
  [4.44, -30.96, 11.9, 4, 4.83], // 波江座ε
  [8.05, -8.6, 19.7, 3, 2.58], // 长蛇座ε
  [14.05, 21.47, 20.4, 3, 2.83], // 牧夫座η
  [20.13, 36.9, 20.5, 3, 3.17], // 天鹅座δ
  [16.0, -8.32, 20.8, 3, 3.02], // 天秤座β
  [9.13, 41.57, 21.2, 3, 3.14], // 大熊座θ
  [4.95, 6.96, 22.0, 3, 3.31], // 猎户座τ
];

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

function buildPointsLayer(positions, colors, size, baseOpacity, attenuate, map) {
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
    map, // 圆形柔点贴图：无贴图的 Points 会渲染成方块
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
  g.addColorStop(0.35,'rgba(255,236,200,0.35)');g.addColorStop(0.7,'rgba(255,225,180,0.06)');  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // 圆形 alpha 遮罩：杜绝方形渐变边界
  ctx.globalCompositeOperation = "destination-in";
  const m = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  m.addColorStop(0, "rgba(0,0,0,1)");
  m.addColorStop(0.7, "rgba(0,0,0,1)");
  m.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = m;
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
  const DISC_COUNT = 46000;
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
  const disc = buildPointsLayer(discPos, discCol, 2.0, 0.85, false, makeGlowTexture());
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
  const ridge = buildPointsLayer(ridgePos, ridgeCol, 3.2, 0.95, false, makeGlowTexture());
  materials.push(ridge.material);
  group.add(ridge);

  // —— 旋臂辉光：大尺寸低透明度弥散光，形成「照片感」臂区辉光 ——
  const GLOW_COUNT = 9000;
  const glowPos = new Float32Array(GLOW_COUNT * 3);
  const glowCol = new Float32Array(GLOW_COUNT * 3);
  for (let i = 0; i < GLOW_COUNT; i++) {
    const r = 4500 + (DISC_RADIUS_LY - 4500) * Math.pow(rng(), 0.75);
    const arm = Math.floor(rng() * ARMS);
    const theta =
      Math.log(r / 1200) / PITCH +
      (arm * 2 * Math.PI) / ARMS +
      gaussian(rng) * (0.06 + 50 / r);
    const z = gaussian(rng) * (80 + r * 0.012);
    toWorld(r * Math.cos(theta), r * Math.sin(theta), z, tmp);
    glowPos[i * 3] = tmp.x;
    glowPos[i * 3 + 1] = tmp.y;
    glowPos[i * 3 + 2] = tmp.z;
    // 粉红星形成区（15%）与蓝白辉光（85%）交替点缀
    const nebula = rng() < 0.15;
    const lum = 0.1 + rng() * 0.14;
    const c = nebula ? [1.0, 0.62, 0.72] : [0.74, 0.84, 1.0];
    glowCol[i * 3] = c[0] * lum;
    glowCol[i * 3 + 1] = c[1] * lum;
    glowCol[i * 3 + 2] = c[2] * lum;
  }
  const armGlow = buildPointsLayer(glowPos, glowCol, 24, 0.6, false, makeGlowTexture());
  materials.push(armGlow.material);
  group.add(armGlow);

  // —— 暗尘埃带：旋臂内缘的深色纹理，普通混合压出「照片」层次 ——
  const DUST_COUNT = 5200;
  const dustPos = new Float32Array(DUST_COUNT * 3);
  const dustCol = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    const r = 5200 + (DISC_RADIUS_LY - 5200) * Math.pow(rng(), 0.78);
    const arm = Math.floor(rng() * ARMS);
    // 尘埃沿臂内缘偏移（θ 略小）
    const theta =
      Math.log(r / 1200) / PITCH +
      (arm * 2 * Math.PI) / ARMS -
      0.06 -
      gaussian(rng) * (0.05 + 40 / r);
    const z = gaussian(rng) * (55 + r * 0.008);
    toWorld(r * Math.cos(theta), r * Math.sin(theta), z, tmp);
    dustPos[i * 3] = tmp.x;
    dustPos[i * 3 + 1] = tmp.y;
    dustPos[i * 3 + 2] = tmp.z;
    const lum = 0.16 + rng() * 0.1;
    dustCol[i * 3] = 0.22 * lum;
    dustCol[i * 3 + 1] = 0.17 * lum;
    dustCol[i * 3 + 2] = 0.14 * lum;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute("color", new THREE.BufferAttribute(dustCol, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 16,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    map: makeGlowTexture(),
    blending: THREE.NormalBlending,
  });
  dustMat.userData.baseOpacity = 0.5;
  dustMat.userData.dust = true; // 尘埃须渲染在辉光粒子之后压暗
  materials.push(dustMat);
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.renderOrder = 2;
  group.add(dust);
  armGlow.renderOrder = 1;
  disc.renderOrder = 1;
  ridge.renderOrder = 1;

  // —— 核球：中央 3D 高斯分布，暖黄色 ——
  const BULGE_COUNT = 5200;
  const bulgePos = new Float32Array(BULGE_COUNT * 3);
  const bulgeCol = new Float32Array(BULGE_COUNT * 3);
  for (let i = 0; i < BULGE_COUNT; i++) {
    const x = gaussian(rng) * 3400; // 棒状：沿银心-太阳连线拉长
    const y = gaussian(rng) * 1400;
    const z = gaussian(rng) * 1300; // 垂直盘面（扁）
    toWorld(x, y, z, tmp);
    bulgePos[i * 3] = tmp.x;
    bulgePos[i * 3 + 1] = tmp.y;
    bulgePos[i * 3 + 2] = tmp.z;
    const lum = 0.55 + rng() * 0.55;
    bulgeCol[i * 3] = 1.0 * lum;
    bulgeCol[i * 3 + 1] = 0.9 * lum;
    bulgeCol[i * 3 + 2] = 0.7 * lum;
  }
  const bulge = buildPointsLayer(bulgePos, bulgeCol, 1.9, 0.9, false);
  bulge.renderOrder = 1;
  materials.push(bulge.material);
  group.add(bulge);

  // —— 太阳邻域恒星：缩放时的「星际散开」主角 ——
  // 真实双星/暗伴星（视位置小幅偏移）
  const COMPANIONS = [
    [14.51, -62.68, 4.25, 5, 0.5],
    [10.11, -36.72, 8.6, 1, 0.9],
    [18.15, -22.96, 6.0, 4, 0.6],
    [1.06, -16.71, 8.53, 4, 0.7],
    [7.66, 28.03, 16.7, 4, 0.8],
    [16.81, -34.3, 16.1, 3, 0.9],
  ];
  const NB = NEARBY_STARS.length + COMPANIONS.length;
  const nbPos = new Float32Array(NB * 3);
  const nbCol = new Float32Array(NB * 3);
  // 赤道坐标 → 场景方向（Y 轴为天极）
  const decToDir = (raH, decDeg, dist, out) => {
    const ra = (raH / 24) * Math.PI * 2;
    const dec = (decDeg * Math.PI) / 180;
    out.set(
      dist * Math.cos(dec) * Math.cos(ra),
      dist * Math.sin(dec),
      dist * Math.cos(dec) * Math.sin(ra)
    );
    return out;
  };
  NEARBY_STARS.forEach((st, i) => {
    const [ra, dec, distLy, type, mag] = st;
    decToDir(ra, dec, distLy * LY, tmp);
    nbPos[i * 3] = tmp.x;
    nbPos[i * 3 + 1] = tmp.y;
    nbPos[i * 3 + 2] = tmp.z;
    const c = STAR_COLORS[type].c;
    const lum = Math.max(0.35, Math.min(1.3, 1.05 - mag * 0.28)) * 1.4;
    nbCol[i * 3] = c[0] * lum;
    nbCol[i * 3 + 1] = c[1] * lum;
    nbCol[i * 3 + 2] = c[2] * lum;
  });
  COMPANIONS.forEach((st, j) => {
    const i = NEARBY_STARS.length + j;
    const [ra, dec, distLy, type, mag] = st;
    const off = 0.004 * (j + 1);
    decToDir(ra + off, dec + off, distLy * LY, tmp);
    nbPos[i * 3] = tmp.x;
    nbPos[i * 3 + 1] = tmp.y;
    nbPos[i * 3 + 2] = tmp.z;
    const c = STAR_COLORS[type].c;
    const lum = Math.max(0.3, 0.9 - mag * 0.25);
    nbCol[i * 3] = c[0] * lum;
    nbCol[i * 3 + 1] = c[1] * lum;
    nbCol[i * 3 + 2] = c[2] * lum;
  });
  const neighbors = buildPointsLayer(nbPos, nbCol, 4e5, 0.95, true, makeGlowTexture());
  neighbors.renderOrder = 1;
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
  glow.scale.set(9000 * LY, 9000 * LY, 1);
  glow.renderOrder = 3;
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
  sunDot.renderOrder = 3;
  group.add(sunDot);

  return { group, materials, sunDot };
}
