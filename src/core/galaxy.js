import * as THREE from "three";

/**
 * 银河照片面片（NASA Eyes 风格第⑤⑥阶段）
 *
 * 素材：Robert Hurt 40 KPC 银河系俯视概念图（Top_D53，图幅约 40 kpc 宽），
 *       由 HYGdata/MilkyWay_25J14_40KPC_Top_D53_10K.jpg 压缩为 4096²。
 *       带标注版中 Sun 标记位于银心正下方（Orion Arm 旁）。
 *
 * 姿态标定（全部 Y-up 映射后的向量，勿再套 (dx, dz, -dy)）：
 *   北银极（面片法线）：(-0.868, 0.497, 0)，与北黄极夹角 arccos(0.497) ≈ 60.2°
 *   银心方向（太阳→银心，位于面片平面内）：(-0.055, -0.096, 0.994)
 *
 * 放置逻辑：面片中心 = 银心（照片中心），再把面片平移使照片中
 *   「Sun 的 UV 点」恰好落在世界原点（我们的太阳系位置），
 *   于是银心自然落在银心向量方向上，可独立校验。
 */

// ===================== 微调速查表（调优只改这里） =====================
// 物理真实比例：与太阳系（1 AU = 1.496e4 单位）、恒星层（1 pc = 3.0857e9 单位）同一单位体系
const PC_TO_UNITS = 3.0857e9;   // 1 pc = 3.0857e13 km / 1e4 km
const GALAXY_SIZE = 40000 * PC_TO_UNITS; // 图幅 40 kpc → 1.234e14 单位
const FADE_IN_START = 1e11;     // 淡入起点（≈3 pc，银盘渐显于恒星群之后）
const FADE_IN_END = 3e13;       // 淡入终点（≈1000 pc，与最远亮星同尺度）
const SUN_UV = [0.4981, 0.3037];   // 照片中太阳的 UV（由标注图读出）
const CENTER_UV = [0.4954, 0.5204]; // 照片中银心亮核的 UV
// =====================================================================

const GALAXY_NORTH_POLE = new THREE.Vector3(-0.868, 0.497, 0).normalize();
const GALACTIC_CENTER_DIR = new THREE.Vector3(-0.055, -0.096, 0.994).normalize();

function smoothstepJS(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * 创建银河照片面片
 * @param {THREE.LoadingManager} manager - 纹理加载管理器
 * @returns {THREE.Mesh} 带 updateByDistance(d) 方法
 */
export function createGalaxyPlane(manager) {
  const loader = new THREE.TextureLoader(manager);
  const texture = loader.load(
    `${import.meta.env.BASE_URL}assets/milkyway_top_4096.jpg`
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const geometry = new THREE.PlaneGeometry(GALAXY_SIZE, GALAXY_SIZE);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "galaxy-plane";
  mesh.renderOrder = -2; // 先于星点渲染，星点以加色混合叠在照片上
  mesh.frustumCulled = false;

  // ---- 姿态：面片法线对准北银极，图中「太阳→银心」方向对准银心向量 ----
  const N = GALAXY_NORTH_POLE.clone();
  const C = GALACTIC_CENTER_DIR.clone();
  // 初始正交基：Z=法线；X0 取 (0,1,0)×N（N 与世界 Y 轴不平行，安全）
  const X0 = new THREE.Vector3(0, 1, 0).cross(N).normalize();
  const Y0 = new THREE.Vector3().crossVectors(N, X0); // X0 × Y0 = N（右手系）
  const qBasis = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(X0, Y0, N)
  );

  // 图内「太阳→银心」的局部平面方向
  const dImg = new THREE.Vector2(
    CENTER_UV[0] - SUN_UV[0],
    CENTER_UV[1] - SUN_UV[1]
  ).normalize();
  // 该方向在初始基下的世界向量，与目标银心向量的有向夹角（绕法线）
  const dWorld0 = X0.clone().multiplyScalar(dImg.x).add(Y0.clone().multiplyScalar(dImg.y));
  const theta = Math.atan2(
    N.dot(new THREE.Vector3().crossVectors(dWorld0, C)),
    dWorld0.dot(C)
  );
  const qSpin = new THREE.Quaternion().setFromAxisAngle(N, theta);
  const qTotal = qSpin.clone().multiply(qBasis);
  mesh.quaternion.copy(qTotal);

  // ---- 位置：平移使照片中太阳 UV 点落在世界原点（银心随之落在银心向量上）----
  const sunLocal = new THREE.Vector3(
    (SUN_UV[0] - 0.5) * GALAXY_SIZE,
    (SUN_UV[1] - 0.5) * GALAXY_SIZE,
    0
  );
  mesh.position.copy(sunLocal.applyQuaternion(qTotal).negate());

  /**
   * 每帧驱动：按相机到原点的距离控制照片淡入
   * @param {number} d - 相机到太阳（原点）的距离
   */
  mesh.updateByDistance = (d) => {
    const fadeIn = smoothstepJS(
      Math.log10(FADE_IN_START),
      Math.log10(FADE_IN_END),
      Math.log10(Math.max(d, 1))
    );
    material.opacity = fadeIn;
    mesh.visible = material.opacity > 0.001;
  };

  return mesh;
}
