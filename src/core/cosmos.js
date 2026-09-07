// 程序化宇宙呈现层（NASA Eyes 风格）
// - 天球星野：恒星按银河带密度分布，表现为无穷远背景
// - 银河系呈现层：
//   · 远景「照片盘」：程序化逐像素生成的棒旋星系纹理平面（连续雾状旋臂 /
//     暖金棒状核球 / 沿臂暗尘埃带 / 粉红星形成区），拉远时构成银河全貌主体
//   · 粒子层：真实太阳邻域恒星（缩放时「散开」）+ 盘恒星 + 臂脊亮星 +
//     旋臂辉光 + 核球，提供近中景的立体感与离散星点
//
// 尺度约定：行星/轨道沿用真实比例（1 单位 = 1 万公里）；
// 恒星与银河系采用压缩呈现比例 1 光年 = 1e5 单位，
// 使「行星 → 星际空间 → 银河系圆盘」能在一个连续缩放区间内呈现。
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

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
  ctx.fillStyle = g;
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

// —— 银河「照片盘」纹理：程序化逐像素渲染棒旋星系（NASA Eyes 观感） ——
// 对数螺旋公式与粒子层完全一致，保证纹理旋臂与盘粒子臂位置吻合
const ARM_PITCH = Math.tan(THREE.MathUtils.degToRad(13));
const ARM_COUNT = 4;

function angleDist(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

function smooth01(x) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * 生成银河系俯视纹理：连续雾状旋臂 + 暖金棒状核球 + 沿臂暗尘埃带 + 粉红星形成区
 * 加性混合下黑色即透明，alpha 通道无意义
 * @returns {THREE.CanvasTexture}
 */
function makeGalaxyTexture() {
  const SIZE = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(SIZE, SIZE);
  const out = img.data;

  // 平铺值噪声表 + 双线性采样（分形叠加出絮状结构，避免「数学塑料感」）
  const N = 256;
  const noiseTable = new Float32Array(N * N);
  const noiseRng = mulberry32(424242);
  for (let i = 0; i < N * N; i++) noiseTable[i] = noiseRng();
  const sampleNoise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = ((xi % N) + N) % N;
    const y0 = ((yi % N) + N) % N;
    const x1 = (x0 + 1) % N;
    const y1 = (y0 + 1) % N;
    const a = noiseTable[y0 * N + x0];
    const b = noiseTable[y0 * N + x1];
    const c = noiseTable[y1 * N + x0];
    const e = noiseTable[y1 * N + x1];
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
  };
  const fbm = (x, y) => 0.625 * sampleNoise(x, y) + 0.375 * sampleNoise(x * 2.13 + 11, y * 2.13 + 7);

  for (let py = 0; py < SIZE; py++) {
    // canvas y 向下，翻转为数学坐标（与平面局部 +Y 对齐）
    const y = (1 - py / SIZE) * 2 - 1;
    for (let px = 0; px < SIZE; px++) {
      const x = (px / SIZE) * 2 - 1;
      const r = Math.hypot(x, y);
      const idx = (py * SIZE + px) * 4;
      if (r >= 1.02) {
        out[idx + 3] = 255;
        continue;
      }
      const theta = Math.atan2(y, x);

      // 噪声调制：盘面絮状亮暗起伏
      const clumpy = 0.6 + 0.85 * fbm(px * 0.02, py * 0.02);

      // —— 结构分量 ——
      // 指数盘基底
      const diskI = Math.exp(-r * 4.2) * 0.3 * clumpy;
      // 棒状核球（沿 +X 拉长的暖金高斯）+ 致密核心
      const barI = Math.exp(-(x * x / 0.048 + y * y / 0.0056)) * 0.8;
      const coreI = Math.exp(-(r * r) / 0.0012) * 1.7;
      // 对数螺旋臂（与粒子层同公式，臂宽随半径展宽）：
      // 主臂 2 条 + 次臂 2 条（0.55 权重），旋臂自棒端伸出 —— 棒旋星系特征
      const armTheta = Math.log(Math.max(r, 0.02) * 52000 / 1200) / ARM_PITCH;
      let arm = 0;
      let dust = 0;
      const armSigma = 0.115 + 0.055 * r;
      const dustSigma = 0.06 + 0.03 * r;
      for (let a = 0; a < ARM_COUNT; a++) {
        const strength = a % 2 === 0 ? 1 : 0.55;
        const base = armTheta + (a * 2 * Math.PI) / ARM_COUNT;
        const da = angleDist(theta, base);
        const w = Math.exp(-(da * da) / (2 * armSigma * armSigma)) * strength;
        if (w > arm) arm = w;
        // 尘埃带：沿旋臂内缘（相位滞后）
        const dd = angleDist(theta, base - 0.1);
        const dw = Math.exp(-(dd * dd) / (2 * dustSigma * dustSigma)) * strength;
        if (dw > dust) dust = dw;
      }
      const armI = arm * (0.28 + 0.7 * r) * clumpy * smooth01((r - 0.08) / 0.06);
      // 粉红星形成区：高频噪声阈值斑，只出现在旋臂上
      const hii = Math.max(0, sampleNoise(px * 0.05 + 37, py * 0.05 + 91) - 0.62) * 3.2 * arm * (1 - r * 0.5);
      // 尘埃暗化（避开核心区）与外缘渐隐
      const dark = 1 - dust * 0.68 * smooth01((r - 0.1) / 0.12);
      const edge = 1 - smooth01((r - 0.86) / 0.12);

      // —— 颜色（内暖金 → 外蓝白）——
      const mixOut = Math.min(1, r * 1.5);
      const diskR = 0.98 - 0.36 * mixOut;
      const diskG = 0.9 - 0.18 * mixOut;
      const diskB = 0.72 + 0.23 * mixOut;

      let R =
        diskI * diskR +
        armI * 0.72 +
        barI * 1.0 +
        coreI * 1.0 +
        hii * 0.95;
      let G =
        diskI * diskG +
        armI * 0.82 +
        barI * 0.91 +
        coreI * 0.97 +
        hii * 0.42;
      let B =
        diskI * diskB +
        armI * 1.0 +
        barI * 0.7 +
        coreI * 0.88 +
        hii * 0.5;

      R = Math.min(1, R * dark * edge);
      G = Math.min(1, G * dark * edge);
      B = Math.min(1, B * dark * edge);

      out[idx] = R * 255;
      out[idx + 1] = G * 255;
      out[idx + 2] = B * 255;
      out[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * 真实银河系照片纹理：取自 NASA Eyes 最小缩放时的呈现（NASA/JPL-Caltech 概念图）
 * 从截帧中裁出银河主体，并抹掉帧内残留的 UI 标记；
 * 加色混合下黑色即透明。加载失败时回退到程序化纹理
 * @returns {THREE.CanvasTexture}
 */
function makeGalaxyPhotoTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const img = new Image();
  img.onload = () => {
    // 截帧中银河主体区域 [165,125] ~ [665,615]
    ctx.drawImage(img, 165, 125, 500, 490, 0, 0, 512, 512);
    // 抹掉帧内残留的 SUN 标记与光点（加色混合下黑色不可见）
    ctx.fillStyle = "#000";
    ctx.fillRect(348, 238, 150, 48);
    ctx.globalCompositeOperation = 'destination-in';
    const m = ctx.createRadialGradient(256, 256, 130, 256, 256, 256);
    m.addColorStop(0, 'rgba(0,0,0,1)');
    m.addColorStop(0.68, 'rgba(0,0,0,0.92)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, 512, 512);
    ctx.globalCompositeOperation = 'source-over';
    tex.needsUpdate = true;
  };
  img.onerror = () => {
    // 回退：程序化棒旋纹理
    ctx.drawImage(makeGalaxyTexture().image, 0, 0);
    tex.needsUpdate = true;
  };
  img.src = `${import.meta.env.BASE_URL}assets/galaxy-frame.png`;
  return tex;
}

/**
 * 银河系呈现层（分层结构，由远及近）：
 * - 照片盘纹理平面：拉远后银河全貌的主体（连续雾状旋臂，NASA Eyes 观感）
 * - 邻域恒星：太阳周围 ~1200 光年的三维分布（独立于本 group，由场景单独管理）
 * - 粒子盘 + 臂脊亮星 + 旋臂辉光 + 核球：近中景的立体感与离散星点
 * - 银心光晕 + 远景太阳标记（SUN 标签，极远时太阳系保持一个可见亮点）
 * @returns {{group: THREE.Group, materials: THREE.Material[], sunDot: THREE.Sprite, neighbors: THREE.Points, discTexture: THREE.Mesh}}
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

  // —— 照片盘：程序化棒旋星系纹理贴到银道面 ——
  const discTexture = new THREE.Mesh(
    new THREE.PlaneGeometry(DISC_RADIUS_LY * LY * 2.12, DISC_RADIUS_LY * LY * 2.12),
    new THREE.MeshBasicMaterial({
      map: makeGalaxyPhotoTexture(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  discTexture.material.userData.baseOpacity = 0.95;
  // 平面局部 X/Y 对齐银道坐标 u/v，法线指向银北极
  discTexture.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(frame.u, frame.v, frame.ngp)
  );
  discTexture.position.copy(gcWorld);
  discTexture.renderOrder = 0;
  group.add(discTexture);

  // —— 银盘：四条对数螺旋臂 + 臂间散布 ——
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
      const arm = Math.floor(rng() * ARM_COUNT);
      theta =
        Math.log(r / 1200) / ARM_PITCH +
        (arm * 2 * Math.PI) / ARM_COUNT +
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
  const disc = buildPointsLayer(discPos, discCol, 2.4, 0.85, false, makeGlowTexture());
  materials.push(disc.material);
  group.add(disc);

  // —— 臂脊亮星：沿旋臂骨架的年轻蓝白亮星，让旋臂清晰可辨 ——
  const ridgePos = new Float32Array(RIDGE_COUNT * 3);
  const ridgeCol = new Float32Array(RIDGE_COUNT * 3);
  for (let i = 0; i < RIDGE_COUNT; i++) {
    const r = 5200 + (DISC_RADIUS_LY - 5200) * Math.pow(rng(), 0.8);
    const arm = Math.floor(rng() * ARM_COUNT);
    const theta =
      Math.log(r / 1200) / ARM_PITCH +
      (arm * 2 * Math.PI) / ARM_COUNT +
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
    const arm = Math.floor(rng() * ARM_COUNT);
    const theta =
      Math.log(r / 1200) / ARM_PITCH +
      (arm * 2 * Math.PI) / ARM_COUNT +
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

  // —— 核球：中央 3D 高斯分布，暖黄色（与纹理的棒状核球位置一致） ——
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
    const lum = 0.65 + rng() * 0.6;
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
  const neighbors = buildPointsLayer(nbPos, nbCol, 1.5e5, 0.95, true, makeGlowTexture());
  neighbors.renderOrder = 1;

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

  // —— 远景太阳标记：极远处太阳系缩成一个可见亮点 + SUN 标签（NASA Eyes 风格） ——
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
  sunDot.scale.set(0.03, 0.03, 1);
  sunDot.renderOrder = 3;
  group.add(sunDot);

  const labelDiv = document.createElement("div");
  const lineEl = document.createElement("span");
  const textEl = document.createElement("span");
  textEl.textContent = "SUN";
  Object.assign(labelDiv.style, {
    color: "#F0F0FA",
    fontFamily: "'Archivo', sans-serif",
    fontSize: "11px",
    fontWeight: "600",
    letterSpacing: "2px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    transform: "translateY(-30px)",
    pointerEvents: "none",
  });
  Object.assign(lineEl.style, {
    display: "block",
    width: "1px",
    height: "14px",
    background: "rgba(240,240,250,0.55)",
    marginBottom: "4px",
  });
  labelDiv.appendChild(lineEl);
  labelDiv.appendChild(textEl);
  const sunLabel = new CSS2DObject(labelDiv);
  sunDot.add(sunLabel);

  return { group, materials, sunDot, neighbors, discTexture };
}
