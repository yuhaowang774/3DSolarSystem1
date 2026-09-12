import * as THREE from "three";
import starTable from "./bright_stars.json";

/**
 * 真实星表星野层
 *
 * 数据：HYG v4.2 亮星子集（9933 颗，mag ≤ 6.6），方向为黄道坐标系的单位向量，
 *       已由 ra/dec 独立路径逐位互证。Three.js Y-up 映射：v = (dx, dz, -dy)。
 *       星表按列存储（name / mag / ci / dist / dx / dy / dz 各为一个等长数组），
 *       省去逐条重复的键名，同样数据体积约为逐条对象写法的 2/3。
 *
 * 三维位置（真实比例，与太阳系同一单位体系）：
 *   场景单位 1 = 1 万公里 → 1 pc = 3.0857e13 km = 3.0857e9 单位。
 *   恒星按真实距离线性放置：半人马α 1.3 pc → 4.1e9，天狼星 2.6 pc → 8.1e9，
 *   100 pc → 3.1e11，1000 pc → 3.1e12（相机远裁剪面已相应扩大）。
 *   银河照片面片为背景呈现层（其比例尺是艺术压缩，不与恒星距离混用）。
 *   距离缺失的哨兵值（1e5 pc）截断到 1000 pc。
 *
 * 呈现需求（按用户确认）：
 *   - 页面打开（行星尺度）恒星即显示，全程常驻，拉远不隐去
 *   - 星点为实心圆点（无光晕），并按视星等区分大小与亮度：
 *     亮星更大更亮、暗星更小更淡，形成自然的星等层次
 */

// ===================== 微调速查表（调优只改这里，不要改数据） =====================
const PC_TO_UNITS = 3.0857e9;   // 真实秒差距换算：1 pc = 3.0857e13 km / 1e4 km
const DIST_MAX_PC = 1000;       // 距离截断上界（pc），缺失哨兵值一并落到此处
// 视星等 →（尺寸 / 亮度）的线性映射两端
const MAG_RANGE = [-1.5, 6.6];  // 星等区间：最亮端（天狼星 −1.44）→ 最暗端（筛选上限 6.6）
const SIZE_RANGE = [2.5, 0.9];  // 对应点尺寸（CSS 像素）
const ALPHA_RANGE = [1.0, 0.38];// 对应不透明度
const SIZE_SCALE = 1.0;         // 全局尺寸倍率（整体放大 / 缩小星点用）
const DIM_START_PC = 100;       // 距离衰减起点（pc，之内不额外压暗）
const DIM_END_PC = 1000;        // 距离衰减终点（pc）
const DIM_MIN_ALPHA = 0.6;      // 距离衰减下限：只作轻微景深提示
                                // （亮度已由星等决定，避免与距离重复压暗使暗星消失）
// ===============================================================================

/** 真实距离（pc）→ 场景单位（真实比例线性映射） */
function distToRadius(distPc) {
  const d = Math.min(distPc || DIST_MAX_PC, DIST_MAX_PC);
  return Math.max(d, 0.5) * PC_TO_UNITS;
}

/** 真实距离（pc）→ 透明度：越远越暗（模拟远星视觉亮度衰减） */
function distToAlpha(distPc) {
  const d = Math.min(distPc || DIST_MAX_PC, DIST_MAX_PC);
  const t = Math.max(0, Math.min(1, (d - DIM_START_PC) / (DIM_END_PC - DIM_START_PC)));
  return 1 - t * (1 - DIM_MIN_ALPHA);
}

/** 视星等 → 0~1 归一化（0 = 最暗端，1 = 最亮端） */
function magToT(mag) {
  const [bright, faint] = MAG_RANGE;
  const t = (faint - mag) / (faint - bright);
  return Math.max(0, Math.min(1, t));
}

/** 视星等 → 点尺寸（CSS 像素）：亮星更大 */
function magToSize(mag) {
  const [max, min] = SIZE_RANGE;
  return min + (max - min) * magToT(mag);
}

/** 视星等 → 不透明度：亮星更实、暗星更淡 */
function magToAlpha(mag) {
  const [max, min] = ALPHA_RANGE;
  return min + (max - min) * magToT(mag);
}

/** 色指数 B−V → 近似星色：蓝白 → 白 → 黄 → 橙红 */
function ciToRgb(ci) {
  const stops = [
    [-0.3, [0.62, 0.72, 1.0]], // O/B 型：蓝白
    [0.0, [0.82, 0.88, 1.0]], // A 型：白偏蓝
    [0.4, [1.0, 0.98, 0.92]], // F/G 型：白
    [0.8, [1.0, 0.87, 0.7]], // K 型：橙黄
    [1.4, [1.0, 0.72, 0.5]], // M 型：橙
    [2.0, [1.0, 0.58, 0.4]], // 深橙红
  ];
  const x = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], ci));
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, c0] = stops[i];
    const [x1, c1] = stops[i + 1];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

const STAR_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;      // 该恒星的像素尺寸（按视星等映射，亮星更大）

  uniform float uPixelRatio;
  uniform float uSizeScale;   // 全局尺寸倍率

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSizePx;      // 实际点尺寸（帧缓冲像素），供片元做边缘羽化

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uSizeScale * uPixelRatio;
    vSizePx = gl_PointSize;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSizePx;

  void main() {
    // 实心圆点（无光晕）：圆形裁切 + 约半像素边缘羽化。
    // 羽化宽度直接由点尺寸推出（1 像素 = 1 / vSizePx 个点坐标单位），无需导数指令
    float d = length(gl_PointCoord - vec2(0.5));
    float aa = 0.45 / max(vSizePx, 1.0);
    float edge = 1.0 - smoothstep(0.5 - aa, 0.5, d);
    if (edge <= 0.002) discard;
    gl_FragColor = vec4(vColor, vAlpha * edge);
  }
`;

export function createStarfield() {
  const count = starTable.mag.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const sizes = new Float32Array(count);

  const dir = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // 黄道系 (dx, dy, dz) → Three.js Y-up：(dx, dz, -dy)；半径按真实距离线性映射 → 三维分布
    const r = distToRadius(starTable.dist[i]);
    dir.set(starTable.dx[i], starTable.dz[i], -starTable.dy[i]).normalize().multiplyScalar(r);
    positions[i * 3] = dir.x;
    positions[i * 3 + 1] = dir.y;
    positions[i * 3 + 2] = dir.z;

    const [cr, cg, cb] = ciToRgb(starTable.ci[i]);
    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;

    // 亮度 = 星等映射 × 距离衰减：亮星更实，暗星更淡且更远更淡
    alphas[i] = magToAlpha(starTable.mag[i]) * distToAlpha(starTable.dist[i]);
    // 尺寸只看星等：亮星更大
    sizes[i] = magToSize(starTable.mag[i]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSizeScale: { value: SIZE_SCALE },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true, // 按 aAlpha（星等 × 距离）半透明衰减
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "starfield";
  points.frustumCulled = false;
  points.renderOrder = -1;

  /**
   * 每帧驱动接口（保留供渲染循环调用）
   * 恒星常驻显示，无距离驱动的淡入淡出；仅同步设备像素比
   */
  points.updateByDistance = () => {
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    if (material.uniforms.uPixelRatio.value !== pr) {
      material.uniforms.uPixelRatio.value = pr;
    }
  };

  return points;
}
