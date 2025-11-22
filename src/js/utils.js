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
  // 对M进行模运算，避免数值过大导致的精度问题
  let normalizedM = M % (2 * Math.PI);
  if (normalizedM < 0) normalizedM += 2 * Math.PI;
  
  // 使用更精确的初始值估计
  let E;
  if (e < 0.8) {
    // 对于小偏心率，使用泰勒展开的初始值
    E = normalizedM + e * Math.sin(normalizedM) + e * e * Math.sin(2 * normalizedM) / 2;
  } else {
    // 对于大偏心率，使用更鲁棒的初始值
    E = normalizedM > Math.PI ? Math.PI : 0;
  }
  
  let E0;
  const maxIterations = 100; // 增加最大迭代次数以确保收敛
  let iterations = 0;
  
  do {
    E0 = E;
    const f = E0 - e * Math.sin(E0) - normalizedM;
    const fPrime = 1 - e * Math.cos(E0);
    
    // 添加数值稳定性检查，避免除零错误
    if (Math.abs(fPrime) < 1e-10) {
      console.warn("开普勒方程求解器：导数接近零，可能导致收敛问题");
      E0 += 0.1; // 微小扰动以避免问题
      E = E0;
    } else {
      E = E0 - f / fPrime;
    }
    
    iterations++;
  } while (Math.abs(E - E0) > 1e-12 && iterations < maxIterations); // 提高精度要求
  
  if (iterations >= maxIterations) {
    console.warn("开普勒方程求解器：达到最大迭代次数，可能精度不足");
  }
  
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
  try {
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
    
    // 对角度参数进行模运算，保持数值稳定性
    const normalizedL = L % (2 * Math.PI);
    const normalizedLongPeri = longPeri % (2 * Math.PI);
    const normalizedLongNode = longNode % (2 * Math.PI);

    // 计算轨道要素
    let w = normalizedLongPeri - normalizedLongNode; // 近心点幅角
    w = w % (2 * Math.PI); // 模运算保持在合理范围内
    
    let M = normalizedL - normalizedLongPeri; // 平近点角
    
    // 验证轨道参数有效性
    if (isNaN(a) || isNaN(e) || isNaN(I) || isNaN(M)) {
      console.error("无效的轨道参数", { a, e, I, M });
      return new THREE.Vector3(centralPos.x, centralPos.y, centralPos.z);
    }
    
    // 确保偏心率在有效范围内
    const clampedE = Math.max(0, Math.min(0.99, e)); // 限制偏心率避免极端情况
    
    const E = keplerEquationSolver(M, clampedE); // 解开普勒方程
    
    // 使用高精度公式计算坐标
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const sqrtEcc = Math.sqrt(1 - clampedE * clampedE);
    
    const x = a * (cosE - clampedE);
    const y = a * sqrtEcc * sinE;
    const r = Math.sqrt(x * x + y * y); // 日心距离
    const v = Math.atan2(y, x); // 真近点角
    
    // 计算三角函数值以减少重复计算
    const sinNode = Math.sin(normalizedLongNode);
    const cosNode = Math.cos(normalizedLongNode);
    const sinVW = Math.sin(v + w);
    const cosVW = Math.cos(v + w);
    const sinI = Math.sin(I);
    const cosI = Math.cos(I);
    
    // 坐标转换（轨道平面 -> 天球赤道面）
    const relX = r * (sinNode * cosVW + cosNode * sinVW * cosI);
    const relY = r * sinVW * sinI;
    const relZ = r * (cosNode * cosVW - sinNode * sinVW * cosI);
    
    // 验证结果有效性
    if (isNaN(relX) || isNaN(relY) || isNaN(relZ)) {
      console.error("轨道计算结果无效", { relX, relY, relZ });
      return new THREE.Vector3(centralPos.x, centralPos.y, centralPos.z);
    }

    // 返回相对中心天体的位置
    return new THREE.Vector3(
      centralPos.x + relX,
      centralPos.y + relY,
      centralPos.z + relZ
    );
  } catch (error) {
    console.error("轨道位置计算错误:", error);
    return new THREE.Vector3(centralPos.x, centralPos.y, centralPos.z);
  }
};

/**
 * 获取天体位置（递归计算卫星位置）
 * @param {string} str - 天体名称
 * @param {Date} date - 日期
 * @returns {THREE.Vector3} 天体在世界坐标系中的位置
 */
const getPlanetPosition = (str, date) => {
  const data = planetData[str];
  if (!data) {
    console.error(`[轨道计算错误] 未找到天体数据：${str}`);
    return new THREE.Vector3(0, 0, 0); // 返回默认位置而不是抛出错误
  }

  // 处理卫星（围绕其他行星运行的天体）
  const isSatellite = !!data.centralPlanet;
  let centralPos = new THREE.Vector3(0, 0, 0);

  if (isSatellite) {
    if (!planetData[data.centralPlanet]) {
      console.error(`[轨道计算错误] 卫星${str}的中心行星${data.centralPlanet}不存在`);
      return new THREE.Vector3(0, 0, 0); // 返回默认位置
    }
    
    // 添加错误处理，避免递归失败导致整个计算崩溃
    try {
      // 递归获取中心行星位置
      centralPos = getPlanetPosition(data.centralPlanet, date);
    } catch (error) {
      console.error(`[轨道计算错误] 获取中心行星${data.centralPlanet}位置失败:`, error);
      return new THREE.Vector3(0, 0, 0);
    }
  }

  // 调用计算函数并添加错误处理
  try {
    return calculateOrbitPosition(data, date, centralPos);
  } catch (error) {
    console.error(`[轨道计算错误] 计算天体${str}位置失败:`, error);
    return new THREE.Vector3(centralPos.x, centralPos.y, centralPos.z);
  }
};

/**
 * 创建轨道线
 * @param {string} str - 天体名称
 * @param {Date} [date=new Date()] - 用于计算轨道参数的时间，默认为当前时间
 * @returns {THREE.LineLoop} 轨道线对象
 */
function createOrbit(str, date = new Date()) {
  const data = planetData[str];
  if (!data) throw new Error(`[轨道生成错误] 未找到天体数据：${str}`);

  const points = [];
  const isSatellite = !!data.centralPlanet;
  const pointCount = isSatellite ? 5000 : 40000; // 卫星轨道点数较少

  // 计算轨道参数 - 使用传入的时间来计算长期变化
  const JD = julianDate(date);
  const T = centuriesSinceJ2000(JD);
  let a = (data.a[0] + data.a[1] * T) * planetData.common.AU;
  const e = data.e[0] + data.e[1] * T;
  const I = degreesToRadians(data.I[0] + data.I[1] * T);
  const longPeri = degreesToRadians(data.longPeri[0] + data.longPeri[1] * T);
  const longNode = degreesToRadians(data.longNode[0] + data.longNode[1] * T);
  const w = longPeri - longNode;

  // 存储原始角度值，用于增量更新
  const angles = [];
  
  // 按角度均匀采样生成轨道点
  for (let i = 0; i < pointCount; i++) {
    const angle = (2 * Math.PI * i) / pointCount;
    angles.push(angle);
    const v = angle;
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(v));

    // 计算坐标 - 使用与calculateOrbitPosition相同的坐标转换逻辑
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

  // 创建基础材质和几何体
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: data.orbitColor || data.color,
    transparent: true,
    opacity: 0.5,
    linewidth: 1.0
  });

  const orbitLine = new THREE.LineLoop(geometry, material);
  
  // 存储更多轨道参数信息，便于后续增量更新
  orbitLine._orbitData = {
    name: str,
    data: data,
    angles: angles,
    pointCount: pointCount,
    creationDate: new Date(date.getTime()),
    lastUpdateDate: new Date(date.getTime())
  };

  return orbitLine;
}

/**
 * 增量更新轨道顶点位置
 * @param {THREE.LineLoop} orbitLine - 轨道线对象
 * @param {Date} date - 新的时间点
 * @returns {boolean} 更新是否成功
 */
function updateOrbitVertices(orbitLine, date) {
  try {
    const orbitData = orbitLine._orbitData;
    if (!orbitData || !orbitData.data || !orbitData.angles) {
      console.warn('轨道对象缺少必要的参数信息，无法增量更新');
      return false;
    }

    const data = orbitData.data;
    const angles = orbitData.angles;
    
    // 计算新的轨道参数
    const JD = julianDate(date);
    const T = centuriesSinceJ2000(JD);
    let a = (data.a[0] + data.a[1] * T) * planetData.common.AU;
    const e = data.e[0] + data.e[1] * T;
    const I = degreesToRadians(data.I[0] + data.I[1] * T);
    const longPeri = degreesToRadians(data.longPeri[0] + data.longPeri[1] * T);
    const longNode = degreesToRadians(data.longNode[0] + data.longNode[1] * T);
    const w = longPeri - longNode;

    // 获取几何体的顶点数据
    const positionAttribute = orbitLine.geometry.getAttribute('position');
    const positions = positionAttribute.array;
    
    // 增量更新每个顶点的位置
    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i];
      const v = angle;
      const r = (a * (1 - e * e)) / (1 + e * Math.cos(v));

      // 计算新坐标
      const relX =
        r *
        (Math.sin(longNode) * Math.cos(v + w) +
          Math.cos(longNode) * Math.sin(v + w) * Math.cos(I));
      const relY = r * Math.sin(v + w) * Math.sin(I);
      const relZ =
        r *
        (Math.cos(longNode) * Math.cos(v + w) -
          Math.sin(longNode) * Math.sin(v + w) * Math.cos(I));

      // 更新顶点数据
      positions[i * 3] = relX;
      positions[i * 3 + 1] = relY;
      positions[i * 3 + 2] = relZ;
    }

    // 通知Three.js几何体已更新
    positionAttribute.needsUpdate = true;
    orbitLine.geometry.computeBoundingSphere();
    
    // 更新时间戳
    orbitData.lastUpdateDate = new Date(date.getTime());
    
    return true;
  } catch (error) {
    console.error('增量更新轨道失败:', error);
    return false;
  }
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
// 假设你给发光精灵加了一个特定的名字

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
  const geometry = new THREE.SphereGeometry(radius, 128, 128);
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
  const geometry = new THREE.SphereGeometry(radius, 128, 128);
  const planet = new THREE.Mesh(geometry, material);
  planet.name = name;
  planet.castShadow = true;
  planet.receiveShadow = true;
  // 新增：月球初始旋转180度
  if (name === "moon") {
    planet.rotation.y = Math.PI; // 180度（弧度）
  }
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

  const geometry = new THREE.SphereGeometry(radius, 128, 128);
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

  // 创建材质
  const ringMaterial = new THREE.MeshStandardMaterial({
    map: ringTexture,
    side: THREE.DoubleSide,
    transparent: true
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
  updateOrbitVertices,
  createSprite,
  createSun,
  createPlanet,
  createUniverse,
  createRing,
  createGroup,
};
