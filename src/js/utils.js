import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { planetData } from "./dats.js";

/**
 * 将UTC时间转换为儒略日(JD)
 * @param {Date} utcDate - UTC日期对象
 * @returns {number} 儒略日值
 */
function utcToJulianDate(utcDate) {
  // 获取UTC日期的各个分量
  const Y = utcDate.getUTCFullYear();
  const M = utcDate.getUTCMonth() + 1; // JavaScript月份从0开始
  const D = utcDate.getUTCDate();
  const h = utcDate.getUTCHours();
  const m = utcDate.getUTCMinutes();
  const s = utcDate.getUTCSeconds() + utcDate.getUTCMilliseconds() / 1000;

  // 应用公式计算儒略日
  // JD = (1461 * (Y + 4800 + (M - 14)/12))/4 + (367 * (M - 2 - 12 * ((M - 14)/12)))/12 - (3 * ((Y + 4900 + (M - 14)/12)/100))/4 + D - 32075 + (h - 12)/24 + m/1440 + s/86400
  const A = Math.floor((M - 14) / 12);
  const JD =
    Math.floor((1461 * (Y + 4800 + A)) / 4) +
    Math.floor((367 * (M - 2 - 12 * A)) / 12) -
    Math.floor((3 * Math.floor((Y + 4900 + A) / 100)) / 4) +
    D -
    32075 +
    (h - 12) / 24 +
    m / 1440 +
    s / 86400;

  return JD;
}

/**
 * 计算天体精确位置和自转的天文辅助函数
 * 基于J2000坐标系和地球时
 */

/**
 * 将角度转换为弧度
 * @param {number} degrees - 角度值
 * @returns {number} 弧度值
 */
function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * 将弧度转换为角度
 * @param {number} radians - 弧度值
 * @returns {number} 角度值
 */
function radToDeg(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * 计算地球自转角速度
 * @returns {number} 自转角速度（弧度/秒）
 */
function getEarthRotationRate() {
  // 地球自转周期（恒星日）: 23h 56m 4.0905s = 86164.0905秒
  const siderealDay = 86164.0905;
  return (2 * Math.PI) / siderealDay;
}

/**
 * 计算地球精确自转角度
 * @param {Date} date - 日期对象
 * @returns {number} 地球自转角度（弧度）
 */
function calculateEarthRotation(date) {
  try {
    // 获取UTC时间组件
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // 0-11 to 1-12
    const day = date.getUTCDate();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds() + date.getUTCMilliseconds() / 1000;

    // 计算日期在年内的天数
    const dayOfYear =
      Math.floor((date - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1;

    // 计算平太阳时角（小时）
    // 基于简化的公式：GMT + 经度 + 季节性调整
    const gmtHours = hours + minutes / 60 + seconds / 3600;
    const seasonalAdjustment =
      2.466 * Math.sin(degToRad((360 * (dayOfYear - 81)) / 365)) -
      1.26 * Math.sin(degToRad((720 * (dayOfYear - 81)) / 365));

    // 计算总小时数，考虑地球自转不均匀性
    const totalHours = gmtHours + seasonalAdjustment / 60;

    // 将小时转换为弧度（2π rad = 24小时）
    const rotationAngle = degToRad(totalHours * 15); // 15度/小时

    return rotationAngle;
  } catch (error) {
    console.error("计算地球自转角度错误:", error);
    return 0;
  }
}

/**
 * 计算儒略日
 * @param {Date} date - 日期对象
 * @returns {number} 儒略日值
 */
function julianDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    console.error("julianDate: 无效的日期参数");
    return 2440587.5; // 返回J1970.0作为默认值
  }
  return date / 86400000 + 2440587.5;
}

/**
 * 计算自J2000.0以来的世纪数
 * @param {number} JD - 儒略日
 * @returns {number} 世纪数
 */
function centuriesSinceJ2000(JD) {
  if (typeof JD !== "number" || isNaN(JD)) {
    console.error("centuriesSinceJ2000: 无效的儒略日参数");
    return 0; // 返回J2000.0作为默认值
  }
  return (JD - 2451545.0) / 36525.0;
}

/**
 * 角度转弧度
 * @param {number} degrees - 角度值
 * @returns {number} 弧度值
 */
function degreesToRadians(degrees) {
  if (typeof degrees !== "number" || isNaN(degrees)) {
    console.error("degreesToRadians: 无效的角度参数");
    return 0;
  }
  return degrees * (Math.PI / 180);
}

/**
 * 开普勒方程求解
 * @param {number} M - 平近点角（弧度）
 * @param {number} e - 偏心率
 * @returns {number} 偏近点角（弧度）
 */
function keplerEquationSolver(M, e) {
  // 参数有效性检查
  if (typeof M !== "number" || typeof e !== "number" || isNaN(M) || isNaN(e)) {
    console.error("keplerEquationSolver: 无效的参数");
    return 0;
  }

  // 对M进行模运算，避免数值过大导致的精度问题
  let normalizedM = M % (2 * Math.PI);
  if (normalizedM < 0) normalizedM += 2 * Math.PI;

  // 使用更精确的初始值估计
  let E;
  if (e < 0.8) {
    // 对于小偏心率，使用泰勒展开的初始值
    E =
      normalizedM +
      e * Math.sin(normalizedM) +
      (e * e * Math.sin(2 * normalizedM)) / 2;
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
}

/**
 * 通用轨道位置计算函数
 * @param {Object} celestialData - 天体数据
 * @param {Date} date - 日期
 * @param {THREE.Vector3} centralPos - 中心天体位置
 * @returns {THREE.Vector3} 天体位置
 */
function calculateOrbitPosition(
  celestialData,
  date,
  centralPos = new THREE.Vector3(0, 0, 0)
) {
  try {
    const JD = julianDate(date);
    const T = centuriesSinceJ2000(JD);

    // 计算轨道参数（包含长期变化）
    let a =
      (celestialData.a[0] + celestialData.a[1] * T) * planetData.common.AU;
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
}

/**
 * 获取天体位置（递归计算卫星位置）
 * @param {string} str - 天体名称
 * @param {Date} date - 日期
 * @returns {THREE.Vector3} 天体在世界坐标系中的位置
 */
function getPlanetPosition(str, date) {
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
      console.error(
        `[轨道计算错误] 卫星${str}的中心行星${data.centralPlanet}不存在`
      );
      return new THREE.Vector3(0, 0, 0); // 返回默认位置
    }

    // 添加错误处理，避免递归失败导致整个计算崩溃
    try {
      // 递归获取中心行星位置
      centralPos = getPlanetPosition(data.centralPlanet, date);
    } catch (error) {
      console.error(
        `[轨道计算错误] 获取中心行星${data.centralPlanet}位置失败:`,
        error
      );
      return new THREE.Vector3(0, 0, 0);
    }
  }

  // 调用计算函数（calculateOrbitPosition内部已有错误处理）
  return calculateOrbitPosition(data, date, centralPos);
}

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
    linewidth: 1.0,
  });

  const orbitLine = new THREE.LineLoop(geometry, material);

  // 存储更多轨道参数信息，便于后续增量更新
  orbitLine._orbitData = {
    name: str,
    data: data,
    angles: angles,
    pointCount: pointCount,
    creationDate: new Date(date.getTime()),
    lastUpdateDate: new Date(date.getTime()),
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
      console.warn("轨道对象缺少必要的参数信息，无法增量更新");
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
    const positionAttribute = orbitLine.geometry.getAttribute("position");
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
    console.error("增量更新轨道失败:", error);
    return false;
  }
}

/**
 * 创建精灵（用于光晕等效果）
 * @param {string} type - 精灵类型
 * @returns {THREE.Sprite} 精灵对象
 */
function createSprite(type) {
  // 参数有效性检查
  if (typeof type !== "string" || !type) {
    console.error("createSprite: 无效的精灵类型");
    return null;
  }

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

  // 添加名称标识便于后续引用
  sprite.name = `${type}-sprite`;

  return sprite;
}

/**
 * 创建太阳
 * @param {string} name - 名称
 * @param {number} radius - 半径
 * @returns {THREE.Mesh} 太阳网格对象
 */
function createSun(name, radius) {
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(`./assets/${name}.jpg`);
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const geometry = new THREE.SphereGeometry(radius, 128, 128);
  const sun = new THREE.Mesh(geometry, material);
  sun.add(new THREE.PointLight(0xffffff, 2, 1000)); // 太阳光源
  return sun;
}

/**
 * 创建行星/卫星
 * @param {string} name - 名称
 * @param {number} radius - 半径
 * @returns {THREE.Mesh} 行星网格对象
 */
function createPlanet(name, radius) {
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(`./assets/${name}.jpg`);
  const material = new THREE.MeshPhongMaterial({ map: texture });
  const geometry = new THREE.SphereGeometry(radius, 128, 128);
  const planet = new THREE.Mesh(geometry, material);
  planet.name = name;
  planet.castShadow = true;
  planet.receiveShadow = true;

  // 地球局部坐标系辅助线已移除

  // 新增：月球初始旋转180度
  if (name === "moon") {
    planet.rotation.y = Math.PI; // 180度（弧度）
  }

  return planet;
}

/**
 * 创建宇宙背景
 * @param {string} name - 名称
 * @param {number} radius - 半径
 * @returns {THREE.Mesh} 宇宙背景网格对象
 */
function createUniverse(name, radius) {
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
}

/**
 * 创建行星环
 * @param {string} name - 名称
 * @param {number} innerRadius - 内环半径
 * @param {number} outerRadius - 外环半径
 * @returns {THREE.Mesh} 行星环网格对象
 */
function createRing(name, innerRadius, outerRadius) {
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
    transparent: true,
  });

  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.castShadow = true;
  ring.receiveShadow = true;
  ring.rotation.x = Math.PI / 2; // 水平放置

  return ring;
}

/**
 * 创建组容器
 * @param {THREE.Object3D} body - 天体对象
 * @returns {THREE.Group} 组对象
 */
function createGroup(body) {
  // 参数有效性检查
  if (!body || !(body instanceof THREE.Object3D)) {
    console.error("createGroup: 无效的天体对象");
    return new THREE.Group();
  }
  const group = new THREE.Group();
  group.add(body);
  return group;
}

/**
 * 在地球上创建地理位置标记
 * @param {number} lat - 纬度（度）
 * @param {number} lon - 经度（度）
 * @param {number} planetRadius - 行星半径
 * @param {string} label - 标记名称
 * @returns {Object} 包含标记和标签的对象
 */
function createLocationMarker(lat, lon, planetRadius, label = "") {
  // 转换地理坐标到球面坐标
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  // 计算局部坐标系中的3D坐标（相对于地球中心点）
  // 增加一个小的偏移量，使标记略微突出地球表面
  const actualRadius = planetRadius * 1.05;
  const x = -actualRadius * Math.sin(phi) * Math.cos(theta);
  const y = actualRadius * Math.cos(phi);
  const z = actualRadius * Math.sin(phi) * Math.sin(theta);

  // 创建标记几何体（小锥体）
  const markerGeometry = new THREE.ConeGeometry(0.02, 0.1, 8);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const marker = new THREE.Mesh(markerGeometry, markerMaterial);

  // 设置标记位置（在地球的局部坐标系中）
  marker.position.set(x, y, z);

  // 使标记始终指向球体外部（在局部坐标系中，指向远离地球中心的方向）
  marker.lookAt(0, 0, 0); // 先看向地球中心
  marker.rotateX(Math.PI); // 反转锥体方向，使其尖端指向外部

  // 创建标记组
  const markerGroup = new THREE.Group();
  markerGroup.add(marker);

  // 移除了标签创建代码

  return {
    marker: markerGroup,
    position: new THREE.Vector3(x, y, z),
  };
}

/**
 * ===================== 日下点差量校准法 =====================
 * 核心思路：先测现状、再算目标、最后求差旋转
 */

/**
 * 计算均时差（Equation of Time）
 * @param {Date} utcDate - UTC日期对象
 * @returns {number} 均时差（分钟），正值表示真太阳比平太阳快
 */
function calculateEquationOfTime(utcDate) {
  // 计算一年中的第几天
  const startOfYear = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const dayOfYear =
    Math.floor((utcDate - startOfYear) / (1000 * 60 * 60 * 24)) + 1;

  // B = 360/365 * (d - 81)，转换为弧度
  const B = degToRad((360 / 365) * (dayOfYear - 81));

  // 均时差公式（分钟）
  const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

  return EoT;
}

/**
 * 步骤2：计算真实日下点经度（太阳直射点经度）
 * @param {Date} utcDate - UTC日期对象
 * @returns {number} 日下点经度（度），东经为正，西经为负，范围 -180 到 180
 */
function calculateTrueSubsolarLongitude(utcDate) {
  // 1. 计算UTC时间的小时数（带小数）
  const utcHours =
    utcDate.getUTCHours() +
    utcDate.getUTCMinutes() / 60 +
    utcDate.getUTCSeconds() / 3600 +
    utcDate.getUTCMilliseconds() / 3600000;

  // 2. 计算平太阳直射经度
  // UTC 12:00 时太阳直射0°经线（格林尼治正午）
  // 地球自西向东转，所以UTC时间越大，太阳直射点越往西（经度越小/越负）
  let meanSubsolarLon = (12 - utcHours) * 15;

  // 3. 计算均时差修正（1° = 4分钟，所以分钟数 / 4 = 度数）
  const EoT = calculateEquationOfTime(utcDate);
  const EoT_deg = EoT / 4; // 均时差转换为经度修正

  // 4. 真实日下点经度 = 平太阳经度 + 均时差修正
  let trueSubsolarLon = meanSubsolarLon + EoT_deg;

  // 5. 归一化到 -180 到 180 范围
  while (trueSubsolarLon > 180) trueSubsolarLon -= 360;
  while (trueSubsolarLon < -180) trueSubsolarLon += 360;

  return trueSubsolarLon;
}

/**
 * 从地球本地坐标系中的太阳方向向量计算日下点经度
 * @param {THREE.Vector3} sunDirection - 地球本地坐标系中太阳的方向向量（从地球指向太阳）
 * @returns {number} 日下点经度（度），东经为正，西经为负，范围 -180 到 180
 */
function calculateLongitudeFromSunDirection(sunDirection) {
  // 在地球本地坐标系中（与Three.js SphereGeometry UV映射一致）：
  // - 本初子午线(0°经度) 在正X轴方向 (x>0, z=0)
  // - 东经90° 在正Z轴方向 (x=0, z>0)
  // - 西经90° 在负Z轴方向 (x=0, z<0)
  // - 180°经度 在负X轴方向 (x<0, z=0)
  //
  // 但是！Three.js的地球纹理可能需要旋转90°！
  // 如果纹理默认是本初子午线在+Z轴，那么需要调整
  //
  // 公式：lng = atan2(z, x)
  // 修正：添加负号以纠正东西半球经度反向问题
  let longitude = -radToDeg(Math.atan2(sunDirection.z, sunDirection.x));

  // 归一化到 -180 到 180
  while (longitude > 180) longitude -= 360;
  while (longitude < -180) longitude += 360;

  return longitude;
}

/**
 * 步骤1：测量地球模型当前状态下的日下点经度
 * @param {THREE.Mesh} earthMesh - 地球模型对象
 * @param {THREE.Vector3} sunWorldPosition - 太阳在世界坐标系中的位置
 * @returns {number} 模型当前日下点经度（度）
 */
function measureModelSubsolarLongitude(earthMesh, sunWorldPosition) {
  // 0. 强制更新地球的世界矩阵，确保变换是最新的
  earthMesh.updateMatrixWorld(true);

  // 1. 获取地球在世界坐标系中的位置
  const earthWorldPosition = new THREE.Vector3();
  earthMesh.getWorldPosition(earthWorldPosition);

  // 2. 计算从地球指向太阳的方向向量（世界坐标系）
  const sunDirectionWorld = new THREE.Vector3()
    .subVectors(sunWorldPosition, earthWorldPosition)
    .normalize();

  // 3. 提取地球世界矩阵的旋转部分（法线矩阵）
  // 使用normalMatrix只包含旋转，不包含位移和缩放
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(
    earthMesh.matrixWorld
  );

  // 4. 计算法线矩阵的逆矩阵，用于将世界方向转换到本地坐标
  const normalMatrixInverse = new THREE.Matrix3().copy(normalMatrix).invert();

  // 5. 将太阳方向向量转换到地球本地坐标系
  const localSunDirection = sunDirectionWorld
    .clone()
    .applyMatrix3(normalMatrixInverse)
    .normalize();

  // 6. 从本地坐标系的方向向量计算经度
  const modelSubsolarLon =
    calculateLongitudeFromSunDirection(localSunDirection);

  return modelSubsolarLon;
}

/**
 * 步骤3：计算地球模型校准角度（日下点差量校准法核心函数）
 * @param {number} modelLon - 模型当前日下点经度（度）
 * @param {number} trueLon - 真实日下点经度（度）
 * @returns {number} 需要旋转的角度（弧度）
 */
function calculateCalibrationAngle(modelLon, trueLon) {
  // 计算经度差：目标经度 - 当前经度
  let deltaLon = trueLon - modelLon;

  // 归一化到 -180 到 180 范围
  while (deltaLon > 180) deltaLon -= 360;
  while (deltaLon < -180) deltaLon += 360;

  // 使用360度减去经度差值来得到校准角度
  let calibrationAngle = 360 - deltaLon;

  // 归一化到0-360范围
  while (calibrationAngle >= 360) calibrationAngle -= 360;
  while (calibrationAngle < 0) calibrationAngle += 360;

  // 转换为弧度
  const deltaRad = degToRad(calibrationAngle);

  return deltaRad;
}

/**
 * 执行日下点差量校准（完整校准流程）
 * @param {Date} utcDate - 当前UTC时间
 * @param {THREE.Mesh} earthMesh - 地球模型（已应用轴倾斜，未应用自转）
 * @param {THREE.Vector3} sunWorldPosition - 太阳世界坐标位置
 * @returns {Object} 校准结果，包含校准角度和调试信息
 */
function performSubsolarCalibration(utcDate, earthMesh, sunWorldPosition) {
  // 步骤1：测量模型当前日下点经度（现状）
  const modelSubsolarLon = measureModelSubsolarLongitude(
    earthMesh,
    sunWorldPosition
  );

  // 步骤2：计算真实日下点经度（目标）
  const trueSubsolarLon = calculateTrueSubsolarLongitude(utcDate);

  // 步骤3：计算校准角度（差值）
  const calibrationAngle = calculateCalibrationAngle(
    modelSubsolarLon,
    trueSubsolarLon
  );

  // 计算经度差值（用于调试显示）
  let deltaLon = trueSubsolarLon - modelSubsolarLon;
  while (deltaLon > 180) deltaLon -= 360;
  while (deltaLon < -180) deltaLon += 360;

  // 返回校准结果和调试信息
  return {
    calibrationAngle: calibrationAngle,
    debug: {
      trueSubsolarLon: trueSubsolarLon,
      modelSubsolarLon: modelSubsolarLon,
      deltaLonDeg: deltaLon,
      calibrationAngleDeg: radToDeg(calibrationAngle),
      utcTime: utcDate.toISOString(),
    },
  };
}

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
  utcToJulianDate,
  createLocationMarker,
  calculateEarthRotation,

  // 日下点差量校准法导出
  calculateTrueSubsolarLongitude,
  measureModelSubsolarLongitude,
  performSubsolarCalibration,
};
