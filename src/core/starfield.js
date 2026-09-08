import * as THREE from "three";
import brightStars from "./bright_stars.json";

/**
 * 真实星表星野层
 *
 * 数据：HYG v4.2 亮星子集（517 颗，mag ≤ 4.0），方向为黄道坐标系的单位向量，
 *       已由 ra/dec 独立路径逐位互证。Three.js Y-up 映射：v = (dx, dz, -dy)。
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
 *   - 星点为实心圆点，无光晕，所有星统一相同大小
 */

// ===================== 微调速查表（调优只改这里，不要改数据） =====================
const PC_TO_UNITS = 3.0857e9;   // 真实秒差距换算：1 pc = 3.0857e13 km / 1e4 km
const DIST_MAX_PC = 1000;       // 距离截断上界（pc），缺失哨兵值一并落到此处
const STAR_SIZE = 1.2;          // 统一点尺寸（CSS 像素）
const DIM_START_PC = 100;       // 亮度衰减起点（pc，之内全亮）
const DIM_END_PC = 1000;        // 亮度衰减终点（pc）
const DIM_MIN_ALPHA = 0.35;     // 最远恒星的透明度下限
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

  uniform float uPixelRatio;
  uniform float uSize;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * uPixelRatio;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // 实心圆点，硬边无光晕
    vec2 c = gl_PointCoord - vec2(0.5);
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

export function createStarfield() {
  const count = brightStars.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const alphas = new Float32Array(count);

  const dir = new THREE.Vector3();
  brightStars.forEach((s, i) => {
    // 黄道系 (dx, dy, dz) → Three.js Y-up：(dx, dz, -dy)；半径按真实距离线性映射 → 三维分布
    const r = distToRadius(s.dist);
    dir.set(s.dx, s.dz, -s.dy).normalize().multiplyScalar(r);
    positions[i * 3] = dir.x;
    positions[i * 3 + 1] = dir.y;
    positions[i * 3 + 2] = dir.z;

    const [cr, cg, cb] = ciToRgb(s.ci);
    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;

    alphas[i] = distToAlpha(s.dist);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSize: { value: STAR_SIZE },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true, // 远星按 aAlpha 半透明衰减
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
