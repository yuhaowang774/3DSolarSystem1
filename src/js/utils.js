import * as THREE from "three";
import { planetData } from "./dats.js";

/**
 * 计算儒略日
 * @param {Date} date - 日期对象
 * @returns {number} 儒略日值
 */
const julianDate = (date) => date / 86400000 + 2440587.5;

/**
 * 计算自J2000.0以来的世纪数
 * @param {number} JD - 儒略日
 * @returns {number} 世纪数
 */
const centuriesSinceJ2000 = (JD) => (JD - 2451545.0) / 36525.0;

/**
 * 角度转弧度
 * @param {number} degrees - 角度值
 * @returns {number} 弧度值
 */
const degreesToRadians = (degrees) => degrees * (Math.PI / 180);

/**
 * 开普勒方程求解
 * @param {number} M - 平近点角（弧度）
 * @param {number} e - 偏心率
 * @returns {number} 偏近点角（弧度）
 */
const keplerEquationSolver = (M, e) => {
  let E = M + e * Math.sin(M) * (1.0 + e * Math.cos(M));
  let E0;
  do {
    E0 = E;
    E = E0 - (E0 - e * Math.sin(E0) - M) / (1 - e * Math.cos(E0));
  } while (Math.abs(E - E0) > 1e-6);
  return E;
};

/**
 * 通用轨道位置计算函数
 * @param {Object} celestialData - 天体数据
 * @param {Date} date - 日期
 * @param {THREE.Vector3} centralPos - 中心天体位置
 * @returns {THREE.Vector3} 天体位置
 */
const calculateOrbitPosition = (
  celestialData,
  date,
  centralPos = new THREE.Vector3(0, 0, 0)
) => {
  const JD = julianDate(date);
  const T = centuriesSinceJ2000(JD);

  // 计算轨道参数（包含长期变化）
  let a = (celestialData.a[0] + celestialData.a[1] * T) * planetData.common.AU;
  const e = celestialData.e[0] + celestialData.e[1] * T;
  const I = degreesToRadians(celestialData.I[0] + celestialData.I[1] * T);
  const L = degreesToRadians(celestialData.L[0] + celestialData.L[1] * T);
  const longPeri = degreesToRadians(
    celestialData.longPeri[0] + celestialData.longPeri[1] * T
  );
  const longNode = degreesToRadians(
    celestialData.longNode[0] + celestialData.longNode[1] * T
  );

  // 计算轨道要素
  const w = longPeri - longNode; // 近心点幅角
  const M = L - longPeri; // 平近点角
  const E = keplerEquationSolver(M, e); // 解开普勒方程
  const x = a * (Math.cos(E) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const r = Math.sqrt(x * x + y * y); // 日心距离
  const v = Math.atan2(y, x); // 真近点角

  // 坐标转换（轨道平面 -> 天球赤道面）
  const relX =
    r *
    (Math.sin(longNode) * Math.cos(v + w) +
      Math.cos(longNode) * Math.sin(v + w) * Math.cos(I));
  const relY = r * (Math.sin(v + w) * Math.sin(I));
  const relZ =
    r *
    (Math.cos(longNode) * Math.cos(v + w) -
      Math.sin(longNode) * Math.sin(v + w) * Math.cos(I));

  // 返回相对中心天体的位置
  return new THREE.Vector3(
    centralPos.x + relX,
    centralPos.y + relY,
    centralPos.z + relZ
  );
};

/**
 * 获取天体位置（递归计算卫星位置）
 * @param {string} str - 天体名称
 * @param {Date} date - 日期
 * @returns {THREE.Vector3} 天体在世界坐标系中的位置
 */
const getPlanetPosition = (str, date) => {
  const data = planetData[str];
  if (!data) throw new Error(`[轨道计算错误] 未找到天体数据：${str}`);

  // 处理卫星（围绕其他行星运行的天体）
  const isSatellite = !!data.centralPlanet;
  let centralPos = new THREE.Vector3(0, 0, 0);

  if (isSatellite) {
    if (!planetData[data.centralPlanet]) {
      throw new Error(
        `[轨道计算错误] 卫星${str}的中心行星${data.centralPlanet}不存在`
      );
    }
    // 递归获取中心行星位置
    centralPos = getPlanetPosition(data.centralPlanet, date);
  }

  return calculateOrbitPosition(data, date, centralPos);
};

/**
 * 创建轨道线
 * @param {string} str - 天体名称
 * @returns {THREE.LineLoop} 轨道线对象
 */
function createOrbit(str) {
  const data = planetData[str];
  if (!data) throw new Error(`[轨道生成错误] 未找到天体数据：${str}`);

  const points = [];
  const isSatellite = !!data.centralPlanet;
  const pointCount = isSatellite ? 1000 : 8000; // 卫星轨道点数较少
  const baseDate = new Date(); // 固定基准时间，确保轨道形状稳定

  // 计算轨道参数
  const JD = julianDate(baseDate);
  const T = centuriesSinceJ2000(JD);
  let a = (data.a[0] + data.a[1] * T) * planetData.common.AU;
  const e = data.e[0] + data.e[1] * T;
  const I = degreesToRadians(data.I[0] + data.I[1] * T);
  const longPeri = degreesToRadians(data.longPeri[0] + data.longPeri[1] * T);
  const longNode = degreesToRadians(data.longNode[0] + data.longNode[1] * T);
  const w = longPeri - longNode;

  // 按角度均匀采样生成轨道点
  for (let i = 0; i < pointCount; i++) {
    const angle = (2 * Math.PI * i) / pointCount; // 0~2π均匀角度
    const v = angle; // 真近点角
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(v)); // 轨道半径

    // 计算相对于主行星的局部坐标
    const relX =
      r *
      (Math.sin(longNode) * Math.cos(v + w) +
        Math.cos(longNode) * Math.sin(v + w) * Math.cos(I));
    const relY = r * Math.sin(v + w) * Math.sin(I);
    const relZ =
      r *
      (Math.cos(longNode) * Math.cos(v + w) -
        Math.sin(longNode) * Math.sin(v + w) * Math.cos(I));

    points.push(new THREE.Vector3(relX, relY, relZ));
  }

  // 创建轨道线材质和几何体
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: data.orbitColor || data.color,
    transparent: true,
    opacity: 0.8,
    linewidth: 1.5,
    depthTest: true, // 开启深度测试
    depthWrite: false, // 不写入深度缓冲区
  });

  return new THREE.LineLoop(geometry, material);
}

/**
 * 创建精灵（用于光晕等效果）
 * @param {string} type - 精灵类型
 * @returns {THREE.Sprite} 精灵对象
 */
function createSprite(type) {
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(`./assets/${type}.png`);

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });

  const sprite = new THREE.Sprite(material);
  const size = type === "sun-glow" ? 1392 : 10; // 太阳光晕特殊尺寸
  sprite.scale.set(size, size, 1);

  return sprite;
}

/**
 * 创建太阳
 * @param {string} name - 名称
 * @param {number} radius - 半径
 * @returns {THREE.Mesh} 太阳网格对象
 */
const createSun = (name, radius) => {
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(`./assets/${name}.jpg`);
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const geometry = new THREE.SphereGeometry(radius, 32, 32);
  const sun = new THREE.Mesh(geometry, material);
  sun.add(new THREE.PointLight(0xffffff, 2, 1000)); // 太阳光源
  return sun;
};

/**
 * 创建行星/卫星
 * @param {string} name - 名称
 * @param {number} radius - 半径
 * @returns {THREE.Mesh} 行星网格对象
 */
const createPlanet = (name, radius) => {
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(`./assets/${name}.jpg`);
  const material = new THREE.MeshPhongMaterial({ map: texture });
  const geometry = new THREE.SphereGeometry(radius, 32, 32);
  const planet = new THREE.Mesh(geometry, material);
  planet.name = name;
  planet.castShadow = true;
  planet.receiveShadow = true;
  return planet;
};

/**
 * 创建宇宙背景
 * @param {string} name - 名称
 * @param {number} radius - 半径
 * @returns {THREE.Mesh} 宇宙背景网格对象
 */
const createUniverse = (name, radius) => {
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(`./assets/${name}.jpg`);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide, // 内表面可见
    color: 0x777777,
    opacity: 0.5,
  });

  const geometry = new THREE.SphereGeometry(radius, 32, 32);
  const universe = new THREE.Mesh(geometry, material);

  return universe;
};

/**
 * 创建行星环
 * @param {string} name - 名称
 * @param {number} innerRadius - 内环半径
 * @param {number} outerRadius - 外环半径
 * @returns {THREE.Mesh} 行星环网格对象
 */
const createRing = (name, innerRadius, outerRadius) => {
  const ringTextureLoader = new THREE.TextureLoader();
  const ringTexture = ringTextureLoader.load(`./assets/${name}.png`);

  ringTexture.colorSpace = THREE.SRGBColorSpace;
  const ringGeometry = new THREE.RingGeometry(innerRadius, outerRadius, 128);

  // 设置UV坐标
  const pos = ringGeometry.attributes.position;
  const v3 = new THREE.Vector3();
  const center = (innerRadius + outerRadius) * 0.5;

  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    ringGeometry.attributes.uv.setXY(i, v3.length() < center ? 0 : 1, 1);
  }

  const ringMaterial = new THREE.MeshStandardMaterial({
    map: ringTexture,
    side: THREE.DoubleSide,
    transparent: true,
  });

  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.castShadow = true;
  ring.receiveShadow = true;
  ring.rotation.x = Math.PI / 2; // 水平放置

  return ring;
};

/**
 * 创建组容器
 * @param {THREE.Object3D} body - 天体对象
 * @returns {THREE.Group} 组对象
 */
const createGroup = (body) => {
  const group = new THREE.Group();
  group.add(body);
  return group;
};

export {
  getPlanetPosition,
  createOrbit,
  createSprite,
  createSun,
  createPlanet,
  createUniverse,
  createRing,
  createGroup,
};
