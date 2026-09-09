import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
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
  return degreesToRadians(degrees);
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
 * ΔT（TT − UT1，此处以 TT − UTC 近似）估算
 * Espenak & Meeus 2005-2050 区间多项式；区间外按 2024 年实测值线性外推
 * @param {Date} date - UTC 日期对象
 * @returns {number} ΔT（秒）
 */
function getDeltaT(date) {
  const y =
    date.getUTCFullYear() +
    (date.getUTCMonth() + (date.getUTCDate() - 1) / 31) / 12;
  if (y >= 2005 && y <= 2050) {
    const t = y - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t * t;
  }
  return 69.2 + (y - 2024) * 0.5;
}

/**
 * 基于 TT（地球时）的儒略日
 * 轨道要素表与太阳理论均以 TT 为时间引数，UTC 直接当 TT 使用会引入
 * ΔT（约 69 秒）对应的引数误差（月球约 38″，行星约 3″）
 * @param {Date} date - UTC 日期对象
 * @returns {number} 儒略日（TT）
 */
function julianDateTT(date) {
  return julianDate(date) + getDeltaT(date) / 86400;
}

/**
 * 月球平黄经的主要周期摄动项（度）
 * Meeus《Astronomical Algorithms》第 47 章截断版
 * 注意：最大的「偏心差」6.289°·sin(M') 已由椭圆模型的开普勒方程自然覆盖，
 * 此处仅补充椭圆要素模型缺失的周期项，将月球经度误差从约 ±1.5° 降至约 ±0.2°
 * @param {number} T - 自 J2000.0 的儒略世纪数（TT）
 * @returns {number} 经度修正（度）
 */
function lunarLongitudePerturbation(T) {
  const D = degreesToRadians(
    297.8501921 + 445267.1114034 * T - 0.0018819 * T * T
  ); // 平距角（日月）
  const M = degreesToRadians(
    357.5291092 + 35999.0502909 * T - 0.0001536 * T * T
  ); // 太阳平近点角
  const Mp = degreesToRadians(
    134.9633964 + 477198.8675055 * T + 0.0087414 * T * T
  ); // 月球平近点角
  const F = degreesToRadians(
    93.272095 + 483202.0175233 * T - 0.0036539 * T * T
  ); // 月球升交点距角
  return (
    1.274 * Math.sin(2 * D - Mp) + // 出差（Evection）
    0.658 * Math.sin(2 * D) + // 二均差（Variation）
    0.214 * Math.sin(2 * Mp) + // 年差（Annual equation）
    -0.186 * Math.sin(M) + // 月角差（Equation of year）
    -0.114 * Math.sin(2 * F) // 升交点经度项
  );
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
    const JD = julianDateTT(date); // 轨道要素以 TT 为引数
    const T = centuriesSinceJ2000(JD);

    // 计算轨道参数（包含长期变化）
    let a =
      (celestialData.a[0] + celestialData.a[1] * T) * planetData.common.AU;
    const e = celestialData.e[0] + celestialData.e[1] * T;
    const I = degreesToRadians(celestialData.I[0] + celestialData.I[1] * T);
    let L = degreesToRadians(celestialData.L[0] + celestialData.L[1] * T);
    // 月球：叠加椭圆要素模型未包含的主要周期摄动
    if (celestialData === planetData.moon) {
      L += degreesToRadians(lunarLongitudePerturbation(T));
    }
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
 * NASA Eyes 风格轨道柔化色：低饱和、低亮度，轨迹线与行星位置圆环标记共用，
 * 保证二者颜色深浅一致
 * @param {number|string} colorLike - 原始颜色（行星主题色）
 * @returns {THREE.Color} 柔化后的颜色
 */
function softOrbitColor(colorLike) {
  const c = new THREE.Color(colorLike);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(hsl.s * 0.6, 0.85), Math.min(Math.min(hsl.l, 0.62) * 1.08, 0.62));
  return c;
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
  const pointCount = isSatellite ? 256 : 1024; // 卫星轨道点数较少，行星轨道1024点足够平滑

  // 计算轨道参数 - 使用传入的时间来计算长期变化（TT 引数）
  const JD = julianDateTT(date);
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
  // 用 Line2/LineMaterial 实现真正的像素级线宽（LineBasicMaterial 的 linewidth 在 WebGL 中固定为 1px）
  // Line2 是折线而非闭环：末尾追加首点形成闭合
  points.push(points[0].clone());
  const flat = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    flat[i * 3] = p.x;
    flat[i * 3 + 1] = p.y;
    flat[i * 3 + 2] = p.z;
  });
  const geometry = new LineGeometry();
  geometry.setPositions(Array.from(flat));
  const material = new LineMaterial({
    color: softOrbitColor(data.orbitColor || data.color),
    transparent: true,
    opacity: 0.45,
    linewidth: 2.0, // 屏幕像素单位
    worldUnits: false,
  });

  const orbitLine = new Line2(geometry, material);

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

    // 计算新的轨道参数（TT 引数）
    const JD = julianDateTT(date);
    const T = centuriesSinceJ2000(JD);
    let a = (data.a[0] + data.a[1] * T) * planetData.common.AU;
    const e = data.e[0] + data.e[1] * T;
    const I = degreesToRadians(data.I[0] + data.I[1] * T);
    const longPeri = degreesToRadians(data.longPeri[0] + data.longPeri[1] * T);
    const longNode = degreesToRadians(data.longNode[0] + data.longNode[1] * T);
    const w = longPeri - longNode;

    // 获取几何体的顶点数据
    // Line2 的 position 是 InterleavedBufferAttribute（instanceStart，stride=6，offset=0；
    // 每段线段的终点 instanceEnd 位于 offset=3），写入需按交错布局进行
    const positionAttribute = orbitLine.geometry.getAttribute("position");
    const positions = positionAttribute.array;
    const isInterleaved = !!positionAttribute.isInterleavedBufferAttribute;
    const stride = isInterleaved ? positionAttribute.data.stride : 3;
    const offset = isInterleaved ? positionAttribute.offset : 0;

    /** 写入第 idx 个顶点：同时更新对应线段的起点与本段终点 */
    const writeVertex = (idx, x, y, z) => {
      positions[idx * stride + offset] = x;
      positions[idx * stride + offset + 1] = y;
      positions[idx * stride + offset + 2] = z;
      if (idx > 0) {
        // 上一段线段的终点即本点
        positions[(idx - 1) * stride + offset + 3] = x;
        positions[(idx - 1) * stride + offset + 3 + 1] = y;
        positions[(idx - 1) * stride + offset + 3 + 2] = z;
      }
    };

    // 增量更新每个顶点的位置
    let firstX = 0, firstY = 0, firstZ = 0;
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

      writeVertex(i, relX, relY, relZ);
      if (i === 0) {
        firstX = relX;
        firstY = relY;
        firstZ = relZ;
      }
    }

    // Line2 为折线：同步末尾的闭合点（= 首点）
    if (isInterleaved) {
      const n = angles.length;
      writeVertex(n, firstX, firstY, firstZ);
      // 最后一段线段的终点也是闭合点
      positions[(n - 1) * stride + offset + 3] = firstX;
      positions[(n - 1) * stride + offset + 3 + 1] = firstY;
      positions[(n - 1) * stride + offset + 3 + 2] = firstZ;
    }

    // 通知Three.js几何体已更新
    if (isInterleaved) {
      positionAttribute.data.needsUpdate = true;
    } else {
      positionAttribute.needsUpdate = true;
    }
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
function createSprite(type, manager) {
  // 参数有效性检查
  if (typeof type !== "string" || !type) {
    console.error("createSprite: 无效的精灵类型");
    return null;
  }

  const textureLoader = new THREE.TextureLoader(manager);
  const texture = textureLoader.load(`${import.meta.env.BASE_URL}assets/${type}.webp`);

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
 * 根据半径计算合适的球体分段数
 * @param {number} radius - 球体半径
 * @returns {number} 分段数（16~64之间）
 */
function getSphereSegments(radius) {
  if (radius > 5) return 64; // 大型天体（木星、土星、太阳等）
  if (radius > 1) return 48; // 中型天体（天王星、海王星）
  return 32; // 小型天体（地球、月球、水星等）
}

/**
 * 创建太阳
 * @param {string} name - 名称
 * @param {number} radius - 半径
 * @returns {THREE.Mesh} 太阳网格对象
 */
function createSun(name, radius, manager) {
  const textureLoader = new THREE.TextureLoader(manager);
  const texture = textureLoader.load(`${import.meta.env.BASE_URL}assets/${name}.webp`);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const geometry = new THREE.SphereGeometry(radius, 64, 64);
  const sun = new THREE.Mesh(geometry, material);
  sun.name = name;
  return sun;
}

/**
 * 创建行星/卫星
 * @param {string} name - 名称
 * @param {number} radius - 半径
 * @returns {THREE.Mesh} 行星网格对象
 */
function createPlanet(name, radius, manager) {
  const textureLoader = new THREE.TextureLoader(manager);
  const texture = textureLoader.load(`${import.meta.env.BASE_URL}assets/${name}.webp`);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshPhongMaterial({ map: texture });
  const segments = getSphereSegments(radius);
  const geometry = new THREE.SphereGeometry(radius, segments, segments);
  const planet = new THREE.Mesh(geometry, material);
  planet.name = name;
  planet.castShadow = true;
  planet.receiveShadow = true;

  // 新增：月球初始旋转180度
  if (name === "moon") {
    planet.rotation.y = Math.PI; // 180度（弧度）
  }

  return planet;
}

/**
 * 地球昼夜 Shader 顶点着色器
 * 全部在视空间计算：modelViewMatrix 的平移分量是相机相对坐标，
 * 避免 1.5e4 量级的世界坐标经 float32 上传 GPU 后在近景产生量化抖动
 */
const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;

  // 对数深度：渲染器开启 logarithmicDepthBuffer 时必须写入对数深度，
  // 否则与内置材质（太阳/光晕）的深度值不在同一坐标系，导致太阳穿透地球
  #include <common>
  #include <logdepthbuf_pars_vertex>

  void main() {
    vUv = uv;
    vViewNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
    #include <logdepthbuf_vertex>
  }
`;

/**
 * 地球昼夜 Shader 片元着色器
 * 按真实太阳方向（视空间）混合昼半球贴图与夜半球城市灯光，
 * 晨昏线带暖色散射、海面镜面耀斑、大气瑞利蓝边
 */
const EARTH_FRAG = /* glsl */ `
  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform sampler2D uSpecularTexture;
  uniform vec3 uSunDirection; // 视空间单位向量，CPU 每帧更新

  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;

  #include <logdepthbuf_pars_fragment>

  void main() {
    #include <logdepthbuf_fragment>

    vec3 normal = normalize(vViewNormal);
    vec3 sunDir = normalize(uSunDirection);
    vec3 viewDir = normalize(-vViewPos);

    float cosSun = dot(normal, sunDir);

    // 昼夜混合因子：晨昏线附近保留柔和过渡带（约 ±7°）
    float dayFactor = smoothstep(-0.12, 0.12, cosSun);

    vec3 dayColor = texture2D(uDayTexture, vUv).rgb;
    vec3 nightColor = texture2D(uNightTexture, vUv).rgb;

    // 昼半球：Lambert 漫反射
    float diffuse = max(cosSun, 0.0);
    vec3 lit = dayColor * (0.08 + 1.25 * diffuse);

    // 晨昏线暖色调：日出日落带的红橙散射
    float twilight = pow(1.0 - clamp(abs(cosSun) / 0.22, 0.0, 1.0), 2.0);
    lit += dayColor * vec3(1.0, 0.42, 0.14) * twilight * 0.55;

    // 夜半球：微弱蓝色底光 + 暖色城市灯光（入夜后逐渐点亮）
    vec3 lights = nightColor * vec3(1.0, 0.88, 0.62) * 2.4;
    lights *= smoothstep(0.25, -0.05, cosSun);
    vec3 night = dayColor * vec3(0.012, 0.018, 0.035) + lights;

    vec3 color = mix(night, lit, dayFactor);

    // 海面镜面反射（太阳耀斑）：仅昼半球有效，防止太阳位于地球正后方时夜面出现假光斑
    float specMask = texture2D(uSpecularTexture, vUv).r;
    vec3 halfDir = normalize(sunDir + viewDir);
    float specular = pow(max(dot(normal, halfDir), 0.0), 42.0) * specMask * diffuse * dayFactor;
    color += vec3(0.9, 0.85, 0.7) * specular * 0.9;

    // 大气瑞利散射：球体边缘的蓝色辉光，向阳侧更亮
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.2);
    color += vec3(0.18, 0.35, 0.9) * fresnel * (0.12 + 0.65 * dayFactor);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * 地球大气辉光着色器（外壳，BackSide + 加色混合）
 * 边缘菲涅尔辉光，向阳侧亮、背阳侧暗淡，形成真实的晨昏线光晕
 */
const ATMOSPHERE_FRAG = /* glsl */ `
  uniform vec3 uSunDirection; // 视空间单位向量，CPU 每帧更新

  varying vec3 vViewNormal;

  #include <logdepthbuf_pars_fragment>

  void main() {
    #include <logdepthbuf_fragment>

    // 背面渲染：视线与法线越接近垂直（轮廓边缘）辉光越强
    float rim = pow(1.0 - abs(dot(normalize(vViewNormal), vec3(0.0, 0.0, 1.0))), 4.0);
    float sunLit = clamp(dot(normalize(vViewNormal), normalize(uSunDirection)) * 1.6 + 0.5, 0.0, 1.0);
    vec3 color = vec3(0.25, 0.5, 1.0) * rim * (0.08 + 0.9 * sunLit);
    gl_FragColor = vec4(color, rim);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * 创建地球昼夜材质：昼半球卫星贴图 + 夜半球城市灯光 + 海面高光
 * 太阳方向由 SolarSystem 每帧写入 uSunDirection，晨昏线随真实时间移动
 * @param {THREE.LoadingManager} manager - 纹理加载管理器
 * @returns {THREE.ShaderMaterial} 地球材质
 */
function createEarthMaterial(manager) {
  const loader = new THREE.TextureLoader(manager);
  const dayTexture = loader.load(`${import.meta.env.BASE_URL}assets/earth.webp`);
  const nightTexture = loader.load(`${import.meta.env.BASE_URL}assets/earth_lights_2048.png`);
  const specularTexture = loader.load(`${import.meta.env.BASE_URL}assets/earth_specular_2048.jpg`);
  dayTexture.colorSpace = THREE.SRGBColorSpace;
  nightTexture.colorSpace = THREE.SRGBColorSpace;
  specularTexture.colorSpace = THREE.NoColorSpace;
  dayTexture.anisotropy = 8;
  nightTexture.anisotropy = 8;

  return new THREE.ShaderMaterial({
    uniforms: {
      uDayTexture: { value: dayTexture },
      uNightTexture: { value: nightTexture },
      uSpecularTexture: { value: specularTexture },
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG,
  });
}

/**
 * 创建地球大气辉光外壳（半径略大于地球，附加混合渲染）
 * @param {number} radius - 外壳半径
 * @returns {THREE.Mesh} 大气辉光网格
 */
function createEarthAtmosphere(radius) {
  const geometry = new THREE.SphereGeometry(radius, 64, 64);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: EARTH_VERT,
    fragmentShader: ATMOSPHERE_FRAG,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const atmosphere = new THREE.Mesh(geometry, material);
  atmosphere.name = "earth-atmosphere";
  return atmosphere;
}

/**
 * 创建宇宙背景
 * @param {string} name - 名称
 * @param {number} radius - 半径
 * @returns {THREE.Mesh} 宇宙背景网格对象
 */
function createUniverse(name, radius, manager) {
  const textureLoader = new THREE.TextureLoader(manager);
  const texture = textureLoader.load(
    `${import.meta.env.BASE_URL}assets/${name}.webp`
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
  });

  const geometry = new THREE.SphereGeometry(radius, 32, 32);
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
function createRing(name, innerRadius, outerRadius, manager) {
  const ringTextureLoader = new THREE.TextureLoader(manager);
  const ringTexture = ringTextureLoader.load(`${import.meta.env.BASE_URL}assets/${name}.webp`);

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
 * 太阳视黄经（度）
 * Meeus《Astronomical Algorithms》第 25 章：几何平黄经 + 中心差 + 光行差 + 章动主要项
 * 精度约 0.01°（取代原实现所依据的低精度经验简式）
 * @param {number} T - 自 J2000.0 的儒略世纪数（TT）
 * @returns {number} 太阳视黄经（度）
 */
function solarApparentLongitude(T) {
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T; // 几何平黄经
  const M = degreesToRadians(357.52911 + 35999.05029 * T - 0.0001537 * T * T); // 平近点角
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M); // 中心差
  const omega = degreesToRadians(125.04 - 1934.136 * T); // 月球升交点平黄经
  return L0 + C - 0.00569 - 0.00478 * Math.sin(omega); // 含光行差(-0.00569)与章动经度项
}

/**
 * 计算均时差（Equation of Time）
 * 由「太阳几何平黄经 − 视赤经」直接求得（含光行差常数修正），
 * 取代原 NOAA 经验简式（误差约 ±1 分钟 → 本实现约 ±5 秒），
 * 直接决定日下点经度的准确性（1 分钟均时差 ≈ 0.25° 经度）
 * @param {Date} utcDate - UTC日期对象
 * @returns {number} 均时差（分钟），正值表示真太阳比平太阳快
 */
function calculateEquationOfTime(utcDate) {
  const T = centuriesSinceJ2000(julianDateTT(utcDate));
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T; // 几何平黄经
  const lambda = degreesToRadians(solarApparentLongitude(T)); // 视黄经
  const omega = degreesToRadians(125.04 - 1934.136 * T);
  // 黄赤交角（IAU 1980 多项式 + 章动交角主要项）
  const eps0 = 23.43929111 - 0.01300417 * T - 0.00000016 * T * T;
  const eps = degreesToRadians(eps0 + 0.00256 * Math.cos(omega));
  // 太阳视赤经
  const alpha = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  let eotDeg = L0 - 0.0057183 - radToDeg(alpha); // 平黄经 − 视赤经（含光行差常数）
  // 归一化到 -180 ~ 180
  while (eotDeg > 180) eotDeg -= 360;
  while (eotDeg < -180) eotDeg += 360;
  return eotDeg * 4; // 度 → 分钟
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
  createEarthMaterial,
  createEarthAtmosphere,
  softOrbitColor,
  createLocationMarker,
  calculateEarthRotation,

  // 日下点差量校准法导出
  calculateTrueSubsolarLongitude,
  measureModelSubsolarLongitude,
  performSubsolarCalibration,
};
