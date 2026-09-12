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
 * 计算地球自转绝对角度（相对当日春分点，弧度）
 *
 * 采用 GMST（格林尼治平恒星时）的一阶形式：
 *   自转角 = 2π × frac(1.00273790935079524 × d)，d = 自 J2000 起的 UT1 日数
 * 即速率 = 1.00273790935079524 圈/平太阳日（恒星日速率，相对当日春分点）。
 *
 * 两个要点：
 * ① 必须包含「整天数」：若只用「当天时刻」这类周期量，模拟时间每远离初始时刻一天，
 *    日下点经度就漂移约 1°（昼夜分界线整体错位）。
 * ② 速率须与岁差处理保持一致：本模型的自转轴随岁差一同转动（见 calculateEarthAxisAzimuth），
 *    故取相对春分点的 GMST 速率。若取相对 CIO 的 ERA 速率（1.00273781191135448 圈/日），
 *    两者相差的岁差在赤经中的累积会使日下点经度漂移约 0.0128°/年
 *    （实测 2026 → 2111 漂移 1.09°；改用 GMST 速率后为 0.007°）。
 *
 * 实测（对照 calculateTrueSubsolarLongitude）：2026 / 2040 / 2111 / 2400 年
 * 日下点经度偏差均 < 0.01°。角度常数项与纹理本初子午线的对齐由
 * 「日下点差量校准法」在初始化时一并测定，无需在此体现。
 *
 * @param {Date} date - 日期对象（UTC，此处以 UTC 近似 UT1，差异 < 0.9 s ≈ 0.004°）
 * @returns {number} 地球自转角度（弧度，[0, 2π)）
 */
function calculateEarthRotation(date) {
  try {
    const daysSinceJ2000 = julianDate(date) - 2451545.0;
    // 相对「当日春分点」的恒星日速率：1.00273790935079524 圈/平太阳日（即 GMST 速率）。
    // 本模型的黄极与自转轴随岁差一同转动（见 calculateEarthAxisAzimuth），
    // 因此自转角必须与春分点同步取 GMST 速率；若取 ERA 速率（相对 CIO，1.00273781191135448），
    // 二者相差的岁差在赤经中的累积会让日下点经度以约 0.0128°/年漂移。
    let turns = (1.00273790935079524 * daysSinceJ2000) % 1;
    if (turns < 0) turns += 1;
    return turns * 2 * Math.PI;
  } catch (error) {
    console.error("计算地球自转角度错误:", error);
    return 0;
  }
}

/**
 * 地球自转轴的倾向方位角（场景系中绕 +Y 的方位，弧度）
 *
 * 北天极在黄道面内的投影指向「夏至点」（黄经 90°）。在 J2000 惯性框架下，
 * 黄道坐标系本身相对 J2000 存在长期岁差：春分点沿黄道西退
 *   p(T) ≈ 5029.0966″·T + 1.11113″·T²  （T 为自 J2000 起的儒略世纪数，TT）
 * 因此北天极的方位角 = 180° − p。
 * （黄道系 → 场景系为 (x, z, -y)：黄经 90° 对应场景 −Z，即方位角 180°；
 *   忽略该岁差会让二分二至时刻偏差约 0.36°/世纪·T，例如 2026 年春分晚约 9 小时。）
 *
 * @param {Date} date - UTC 日期
 * @returns {number} 方位角（弧度）
 */
function calculateEarthAxisAzimuth(date) {
  const T = centuriesSinceJ2000(julianDateTT(date));
  const precessionDeg = (5029.0966 * T + 1.11113 * T * T) / 3600;
  return Math.PI - (precessionDeg * Math.PI) / 180;
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

    // 坐标转换（轨道平面 -> J2000 黄道坐标系：x 指向春分点，z 指向北黄极）
    const xEcl = r * (cosNode * cosVW - sinNode * sinVW * cosI);
    const yEcl = r * (sinNode * cosVW + cosNode * sinVW * cosI);
    const zEcl = r * sinVW * sinI;

    // 验证结果有效性
    if (isNaN(xEcl) || isNaN(yEcl) || isNaN(zEcl)) {
      console.error("轨道计算结果无效", { xEcl, yEcl, zEcl });
      return new THREE.Vector3(centralPos.x, centralPos.y, centralPos.z);
    }

    // 黄道系 → 场景系（与星野 / 银河照片面片同一约定）：(x, y, z) → (x, z, -y)
    // 即 +Y = 北黄极，XZ 平面 = 黄道面，+X = 春分点方向
    return new THREE.Vector3(
      centralPos.x + xEcl,
      centralPos.y + zEcl,
      centralPos.z - yEcl
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

/* ============ 轨道线：连续绸带（屏幕像素线宽 + 斜接拐角 + 解析式抗锯齿） ============
 * 为什么不用 Line2：Line2 把折线拆成一段段各自独立的四边形（每段两端还会各外扩
 * 半个线宽），当某段投影后只有一两像素长时（拉远后的外行星轨道），段间重叠与
 * 接缝被放大成一串"珠子"。改为整条轨道共享站点的连续三角带后：
 *   - 每个采样点只贡献一条"站"（左右两个顶点，由 aSide 区分）；
 *   - 法线取相邻两段方向的角平分线（miter）+ 长度补偿，拐角内外侧宽度一致；
 *   - 线宽在屏幕空间恒定（像素定义），边缘用 smoothstep 羽化，任何缩放级别都平滑。
 */

const ORBIT_LINE_WIDTH = 2.0; // 轨道线宽（屏幕像素）

const ORBIT_VERT = /* glsl */ `
  uniform vec2 uResolution;   // 画布尺寸（像素）
  uniform float uLineWidth;   // 线宽（像素）

  attribute vec3 aPrev;       // 相邻采样点（与 position 同步更新的轨道坐标）
  attribute vec3 aNext;
  attribute float aSide;      // -1 / +1：绸带两侧

  varying float vSide;

  #include <common>
  #include <logdepthbuf_pars_vertex>

  void main() {
    vSide = aSide;

    vec4 mvCur = modelViewMatrix * vec4(position, 1.0);
    vec4 mvPrev = modelViewMatrix * vec4(aPrev, 1.0);
    vec4 mvNext = modelViewMatrix * vec4(aNext, 1.0);

    vec4 clipCur = projectionMatrix * mvCur;
    vec4 clipPrev = projectionMatrix * mvPrev;
    vec4 clipNext = projectionMatrix * mvNext;

    float aspect = uResolution.x / uResolution.y;

    // 屏幕空间方向：x 乘 aspect 换成等比空间，避免非正方形视口下法线歪斜
    vec2 ndcCur = clipCur.xy / max(clipCur.w, 1e-6);
    vec2 ndcPrev = clipPrev.xy / max(clipPrev.w, 1e-6);
    vec2 ndcNext = clipNext.xy / max(clipNext.w, 1e-6);

    vec2 dirPrev = ndcCur - ndcPrev;
    vec2 dirNext = ndcNext - ndcCur;
    dirPrev.x *= aspect;
    dirNext.x *= aspect;

    // 相机平面之后 / 投影重合的相邻点方向会翻折，用另一侧方向兜底，避免可见处炸出长刺
    bool okPrev = clipPrev.w > 0.0 && dot(dirPrev, dirPrev) > 1e-14;
    bool okNext = clipNext.w > 0.0 && dot(dirNext, dirNext) > 1e-14;
    if (!okPrev && !okNext) {
      dirPrev = vec2(1.0, 0.0);
      dirNext = vec2(1.0, 0.0);
    } else if (!okPrev) {
      dirPrev = normalize(dirNext);
    } else if (!okNext) {
      dirNext = normalize(dirPrev);
    } else {
      dirPrev = normalize(dirPrev);
      dirNext = normalize(dirNext);
    }

    // miter：相邻两段法线的角平分线，长度补偿 1/cos(θ/2) 并钳制以避免尖角过长
    vec2 nPrev = vec2(-dirPrev.y, dirPrev.x);
    vec2 nNext = vec2(-dirNext.y, dirNext.x);
    vec2 miter = nPrev + nNext;
    miter = dot(miter, miter) < 1e-12 ? nNext : normalize(miter);
    float miterScale = 1.0 / max(dot(miter, nNext), 0.35);

    // 半线宽（像素）→ 等比屏幕空间 → NDC（还原 aspect）→ 裁剪空间
    vec2 offsetS = miter * miterScale * (uLineWidth * 0.5) * (2.0 / uResolution.y);
    vec2 offsetNdc = vec2(offsetS.x / aspect, offsetS.y);
    clipCur.xy += offsetNdc * clipCur.w * aSide;

    gl_Position = clipCur;

    #include <logdepthbuf_vertex>
  }
`;

const ORBIT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uLineWidth;

  varying float vSide;

  #include <logdepthbuf_pars_fragment>

  void main() {
    #include <logdepthbuf_fragment>

    // 解析式抗锯齿：vSide 沿整条线宽从 -1 线性过渡到 1，屏幕导数恒为 2 / 线宽，
    // 据此取约 0.5 像素的羽化带，边缘平滑且不依赖 MSAA
    float aa = 1.0 / max(uLineWidth, 0.5);
    float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, abs(vSide));
    if (alpha <= 0.002) discard;

    gl_FragColor = vec4(uColor, uOpacity * alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * 生成轨道绸带几何体（闭合折线 → 连续三角带）
 * 站数 = 采样点数 + 1（末站复制首站，闭合接缝）；每站两个顶点由 aSide 区分
 * @param {THREE.Vector3[]} points - 闭合折线采样点（不含重复首点）
 * @returns {THREE.BufferGeometry} 含 position / aPrev / aNext / aSide 的几何体
 */
function createOrbitGeometry(points) {
  const n = points.length;
  const stations = n + 1;
  const vertexCount = stations * 2;

  const position = new Float32Array(vertexCount * 3);
  const aPrev = new Float32Array(vertexCount * 3);
  const aNext = new Float32Array(vertexCount * 3);
  const aSide = new Float32Array(vertexCount);
  const index = [];

  const write = (arr, vertex, p) => {
    const o = vertex * 3;
    arr[o] = p.x;
    arr[o + 1] = p.y;
    arr[o + 2] = p.z;
  };

  for (let i = 0; i < stations; i++) {
    const c = points[i % n];
    const p = points[(i - 1 + n) % n];
    const q = points[(i + 1) % n];
    write(position, i * 2, c);
    write(position, i * 2 + 1, c);
    write(aPrev, i * 2, p);
    write(aPrev, i * 2 + 1, p);
    write(aNext, i * 2, q);
    write(aNext, i * 2 + 1, q);
    aSide[i * 2] = -1;
    aSide[i * 2 + 1] = 1;
    if (i < stations - 1) {
      const v = i * 2;
      index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aPrev", new THREE.BufferAttribute(aPrev, 3));
  geometry.setAttribute("aNext", new THREE.BufferAttribute(aNext, 3));
  geometry.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 创建轨道线（连续绸带：屏幕像素线宽，任何缩放级别都不会出现分段斑点）
 * @param {string} str - 天体名称
 * @param {Date} [date=new Date()] - 用于计算轨道参数的时间，默认为当前时间
 * @returns {THREE.Mesh} 轨道线对象
 */
function createOrbit(str, date = new Date()) {
  const data = planetData[str];
  if (!data) throw new Error(`[轨道生成错误] 未找到天体数据：${str}`);

  const points = [];
  const isSatellite = !!data.centralPlanet;
  const pointCount = isSatellite ? 512 : 1024; // 卫星轨道点数较少，行星轨道1024点足够平滑

  // 计算轨道参数 - 使用传入的时间来计算长期变化（TT 引数）
  const JD = julianDateTT(date);
  const T = centuriesSinceJ2000(JD);
  const a = (data.a[0] + data.a[1] * T) * planetData.common.AU;
  const e = data.e[0] + data.e[1] * T;
  const I = degreesToRadians(data.I[0] + data.I[1] * T);
  const longPeri = degreesToRadians(data.longPeri[0] + data.longPeri[1] * T);
  const longNode = degreesToRadians(data.longNode[0] + data.longNode[1] * T);
  const w = longPeri - longNode;

  // 存储原始角度值，用于增量更新
  const angles = [];

  // 按角度均匀采样生成轨道点（坐标转换与 calculateOrbitPosition 一致）
  for (let i = 0; i < pointCount; i++) {
    const v = (2 * Math.PI * i) / pointCount;
    angles.push(v);
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(v));
    // 黄道坐标（x 指向春分点，z 指向北黄极）
    const xEcl =
      r *
      (Math.cos(longNode) * Math.cos(v + w) -
        Math.sin(longNode) * Math.sin(v + w) * Math.cos(I));
    const yEcl =
      r *
      (Math.sin(longNode) * Math.cos(v + w) +
        Math.cos(longNode) * Math.sin(v + w) * Math.cos(I));
    const zEcl = r * Math.sin(v + w) * Math.sin(I);
    // 黄道系 → 场景系：(x, y, z) → (x, z, -y)（与星野约定一致）
    points.push(new THREE.Vector3(xEcl, zEcl, -yEcl));
  }

  const geometry = createOrbitGeometry(points);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: softOrbitColor(data.orbitColor || data.color) },
      uOpacity: { value: 0.45 },
      uLineWidth: { value: ORBIT_LINE_WIDTH },
      uResolution: { value: new THREE.Vector2(1, 1) }, // 由场景在初始化 / resize 时同步
    },
    vertexShader: ORBIT_VERT,
    fragmentShader: ORBIT_FRAG,
    transparent: true,
    depthWrite: false, // 透明线不写深度：避免给其它透明元素"打洞"或被其反噬
    side: THREE.DoubleSide,
  });

  const orbitLine = new THREE.Mesh(geometry, material);
  orbitLine.name = `orbit-${str}`;
  // 在透明队列中最后绘制：银河 / 星野 / 太阳光晕 / 行星球环 / 大气等叠加层
  // 不再把轨迹线冲淡；实心天体仍按深度正常遮挡轨迹线
  orbitLine.renderOrder = 2;

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
 * 增量更新轨道绸带顶点位置
 *
 * 几何体为「站 × 2 顶点」的连续三角带：
 *   站 i 的中心点 = 采样点 (i % n)；aPrev = 采样点 ((i-1+n) % n)；aNext = 采样点 ((i+1) % n)
 * 末站（i = n）复制首站数据，闭合接缝。三个属性同步重写即可改变轨道形状。
 *
 * @param {THREE.Mesh} orbitLine - 轨道线对象
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
    const n = angles.length;

    // 计算新的轨道参数（TT 引数）
    const JD = julianDateTT(date);
    const T = centuriesSinceJ2000(JD);
    const a = (data.a[0] + data.a[1] * T) * planetData.common.AU;
    const e = data.e[0] + data.e[1] * T;
    const I = degreesToRadians(data.I[0] + data.I[1] * T);
    const longPeri = degreesToRadians(data.longPeri[0] + data.longPeri[1] * T);
    const longNode = degreesToRadians(data.longNode[0] + data.longNode[1] * T);
    const w = longPeri - longNode;
    const sinNode = Math.sin(longNode);
    const cosNode = Math.cos(longNode);
    const sinI = Math.sin(I);
    const cosI = Math.cos(I);
    const p = a * (1 - e * e);

    const geometry = orbitLine.geometry;
    const positionAttr = geometry.getAttribute("position");
    const prevAttr = geometry.getAttribute("aPrev");
    const nextAttr = geometry.getAttribute("aNext");
    if (!positionAttr || !prevAttr || !nextAttr) return false;

    const posArr = positionAttr.array;
    const prevArr = prevAttr.array;
    const nextArr = nextAttr.array;
    const stations = Math.min(n + 1, Math.floor(posArr.length / 6));

    /** 采样点 v → 坐标写入指定顶点 */
    const writeVertex = (arr, vertex, v) => {
      const r = p / (1 + e * Math.cos(v));
      const s = v + w;
      const o = vertex * 3;
      // 黄道坐标（x 指向春分点，z 指向北黄极）→ 场景系 (x, z, -y)
      const xEcl = r * (cosNode * Math.cos(s) - sinNode * Math.sin(s) * cosI);
      const yEcl = r * (sinNode * Math.cos(s) + cosNode * Math.sin(s) * cosI);
      const zEcl = r * Math.sin(s) * sinI;
      arr[o] = xEcl;
      arr[o + 1] = zEcl;
      arr[o + 2] = -yEcl;
    };

    for (let i = 0; i < stations; i++) {
      const vc = angles[i % n];
      const vp = angles[(i - 1 + n) % n];
      const vq = angles[(i + 1) % n];
      writeVertex(posArr, i * 2, vc);
      writeVertex(posArr, i * 2 + 1, vc);
      writeVertex(prevArr, i * 2, vp);
      writeVertex(prevArr, i * 2 + 1, vp);
      writeVertex(nextArr, i * 2, vq);
      writeVertex(nextArr, i * 2 + 1, vq);
    }

    positionAttr.needsUpdate = true;
    prevAttr.needsUpdate = true;
    nextAttr.needsUpdate = true;
    geometry.computeBoundingSphere();

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
 * 不规则小天体几何：三轴椭球基形 + 确定性低频起伏。
 * 火卫一（27×22×18 km）/ 火卫二（15×12.2×11 km）等小卫星并非圆球，
 * 用「平均半径 × 三轴比」的椭球叠加噪声起伏近似其土豆形外形。
 * UV 沿用球体展开，等距圆柱投影贴图不受形变影响；顶点位移只与方向有关，
 * 经线接缝与极点的重合顶点位移一致，曲面保持闭合。
 * @param {number} radius - 平均半径（场景单位）
 * @param {{axis:number[], seed?:number, lumps?:number}} shape - 三轴比与起伏参数
 * @returns {THREE.SphereGeometry}
 */
function createIrregularMoonGeometry(radius, shape) {
  const mean = (shape.axis[0] + shape.axis[1] + shape.axis[2]) / 3;
  const [ax, ay, az] = shape.axis.map((a) => a / mean);
  const seed = shape.seed ?? 1;
  const lumps = shape.lumps ?? 0.06;
  const geometry = new THREE.SphereGeometry(radius, 64, 48);
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  // 确定性伪噪声：三组不同频率的三角函数按 seed 错相叠加，输出约 ±1
  const noise = (x, y, z) =>
    Math.sin(x * 2.3 + seed * 1.9 + y * 1.1) * 0.5 +
    Math.sin(y * 3.7 + seed * 2.7 + z * 2.3) * 0.3 +
    Math.sin(z * 5.1 + seed * 3.7 + x * 1.7) * 0.2;
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize();
    // 该方向上到椭球面的距离（椭球半轴 = 平均半径 × 归一化三轴比）
    const ellipsoid =
      1 / Math.sqrt((v.x / ax) ** 2 + (v.y / ay) ** 2 + (v.z / az) ** 2);
    const bump = 1 + lumps * noise(v.x * 2.9, v.y * 2.9, v.z * 2.9);
    const r = radius * ellipsoid * bump;
    position.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 创建行星/卫星
 * @param {string} name - 名称
 * @param {number} radius - 半径
 * @param {THREE.LoadingManager} manager - 纹理加载管理器
 * @param {string} [textureFile] - 贴图文件名（默认 `<name>.webp`；卫星用 `<name>.jpg`）
 * @param {{axis:number[], seed?:number, lumps?:number}} [shape] - 不规则外形参数（小卫星用）
 * @param {number} [mapShift] - 源图经度约定修正：源图 0° 在左缘时传 -0.5，
 *   使特征地貌落在场景约定的真实经度上（球面 u=0.5 ↔ 0° 经线，东经向右）
 * @returns {THREE.Mesh} 行星网格对象
 */
function createPlanet(name, radius, manager, textureFile, shape, mapShift) {
  const textureLoader = new THREE.TextureLoader(manager);
  const texture = textureLoader.load(
    `${import.meta.env.BASE_URL}assets/${textureFile || `${name}.webp`}`
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  if (mapShift) {
    // 平移采样列对齐经度约定（包裹采样避免缝隙）
    texture.wrapS = THREE.RepeatWrapping;
    texture.offset.x = mapShift;
  }
  const material = new THREE.MeshPhongMaterial({ map: texture });
  const geometry = shape
    ? createIrregularMoonGeometry(radius, shape)
    : new THREE.SphereGeometry(radius, getSphereSegments(radius), getSphereSegments(radius));
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
 * ===================== IAU 行星自转模型（J2000） =====================
 *
 * 各行星北极方向（赤经 α₀ / 赤纬 δ₀）与自转经度 W = W₀ + dW·d
 * （d 为距 J2000 的 TT 天数）。数据来源 IAU/WGCCRE 2009 报告（现行值）。
 * 用于把行星组姿态对准真实极向——土星环指向、天王星"躺倒"、火星极冠
 * 方位等与 NASA Eyes 的当前显示一致；自转经度决定某一时刻哪条经线朝向太阳。
 */
const IAU_ROTATION = {
  mercury: { alpha: 281.01, delta: 61.45, w0: 329.548, dw: 6.1385025 },
  venus: { alpha: 272.76, delta: 67.16, w0: 160.2, dw: -1.4813688 },
  mars: { alpha: 317.681, delta: 52.887, w0: 176.63, dw: 350.89198226 },
  jupiter: { alpha: 268.057, delta: 64.496, w0: 284.95, dw: 870.536 },
  saturn: { alpha: 40.589, delta: 83.537, w0: 38.9, dw: 810.7939024 },
  uranus: { alpha: 257.311, delta: -15.175, w0: 203.81, dw: -501.1600928 },
  neptune: { alpha: 299.36, delta: 43.46, w0: 253.18, dw: 536.3128492 },
};

/** 黄赤交角（J2000，弧度） */
const OBLIQUITY_J2000 = 23.4393 * (Math.PI / 180);

/**
 * IAU 赤道坐标系单位向量 → 场景坐标系。
 * 赤道 (α,δ) → 黄道（绕 x 轴 -ε）→ 场景 (x, z, -y)，与轨道计算同一映射
 * （场景 +Y = 北黄极，+X = 春分点，见 calculateOrbitPosition）
 */
function equatorialToScene(alphaDeg, deltaDeg, target = new THREE.Vector3()) {
  const a = degreesToRadians(alphaDeg);
  const d = degreesToRadians(deltaDeg);
  const x = Math.cos(d) * Math.cos(a);
  const y = Math.cos(d) * Math.sin(a);
  const z = Math.sin(d);
  const yEcl = y * Math.cos(OBLIQUITY_J2000) + z * Math.sin(OBLIQUITY_J2000);
  const zEcl = z * Math.cos(OBLIQUITY_J2000) - y * Math.sin(OBLIQUITY_J2000);
  return target.set(x, zEcl, -yEcl);
}

/**
 * 行星组姿态四元数：本地 +Y = IAU 北极，本地 +X = 行星赤道对地球赤道的升交点。
 * 光环 / 卫星轨道作为组的子节点随真实赤道面倾斜（土星环指向与 NASA Eyes 一致）
 * @param {string} name - 行星名（IAU_ROTATION 内的天体）
 * @returns {THREE.Quaternion|null}
 */
function iauGroupQuaternion(name) {
  const iau = IAU_ROTATION[name];
  if (!iau) return null;
  const pole = equatorialToScene(iau.alpha, iau.delta);
  const node = equatorialToScene(iau.alpha + 90, 0); // 行星赤道升交点方向
  const zAxis = new THREE.Vector3().crossVectors(node, pole).normalize();
  const matrix = new THREE.Matrix4().makeBasis(node, pole, zAxis);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

/**
 * IAU 自转经度 W(t)（弧度）：t 时刻面向的经线角度，驱动行星贴图的真实自转相位
 * @param {string} name - 行星名
 * @param {Date} date - 模拟时间
 * @returns {number} 弧度；无 IAU 数据的天体返回 0
 */
function iauSpinY(name, date) {
  const iau = IAU_ROTATION[name];
  if (!iau) return 0;
  const d = julianDateTT(date) - 2451545.0;
  const w = (((iau.w0 + iau.dw * d) % 360) + 360) % 360;
  return degreesToRadians(w);
}

/**
 * 创建行星环
 * 环面按「片段 → 太阳」光线与行星球体求交计算本影：被行星遮挡的环面
 * 呈楔形阴影（土星环的经典逆光形态，参见 NASA Eyes）。
 * 太阳位置每帧由场景写入环本地系（uSunLocal），行星中心即本地原点。
 * @param {string} name - 名称
 * @param {number} innerRadius - 内环半径
 * @param {number} outerRadius - 外环半径
 * @param {THREE.LoadingManager} manager - 纹理加载管理器
 * @param {number} planetRadius - 行星半径（本影计算用，场景单位）
 * @returns {THREE.Mesh} 行星环网格对象
 */
function createRing(name, innerRadius, outerRadius, manager, planetRadius = 0) {
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

  // 环面着色器：贴图 × 行星本影（解析球体求交，替代阴影贴图——
  // 点光源立方体阴影在数万单位的场景尺度下不可用，见 _initLights 注释）
  // alphaTest 语义保留：全透明区域直接丢弃，避免写深度挡住身后轨迹线
  const ringMaterial = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: ringTexture },
      // 太阳在环本地坐标系中的位置（场景每帧更新）
      uSunLocal: { value: new THREE.Vector3(0, 0, 1) },
      uPlanetRadius: { value: planetRadius },
    },
    side: THREE.DoubleSide,
    transparent: true,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vLocalPos;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv;
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uSunLocal;
      uniform float uPlanetRadius;
      varying vec2 vUv;
      varying vec3 vLocalPos;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec4 tex = texture2D(map, vUv);
        if (tex.a < 0.05) discard;
        // 本影：片段到太阳的光线与行星球（本地原点）的最短距离小于半径即被遮挡
        vec3 ringRd = normalize(uSunLocal - vLocalPos);
        vec3 ringOc = -vLocalPos;
        float ringT = dot(ringOc, ringRd);
        float ringD = length(ringOc - ringRd * max(ringT, 0.0));
        float shadow = 1.0 -
          (1.0 - smoothstep(uPlanetRadius * 0.97, uPlanetRadius * 1.03, ringD)) * step(0.0, ringT);
        gl_FragColor = vec4(tex.rgb * mix(0.08, 1.0, shadow), tex.a);
        #include <colorspace_fragment>
      }
    `,
  });

  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2; // 水平放置
  // 场景每帧把太阳位置写入该 uniform（见 SolarSystem._updateRingShadows）
  ring.userData.sunUniform = ringMaterial.uniforms.uSunLocal;

  return ring;
}

/**
 * 把「环影」注入行星材质：行星盘面上，射向太阳的光线若先穿过环面
 * （环平面内、内外半径之间）则直射光被削弱——土星盘面上的暗色环带。
 * 通过 onBeforeCompile 注入 Phong 光照末端，环境光不受影响。
 * @param {THREE.MeshPhongMaterial} material - 行星材质
 * @returns {Object} uniforms（场景每帧更新太阳/行星/环面法线的世界姿态）
 */
function applyRingShadowToPlanet(material) {
  const uniforms = {
    uSunWorld: { value: new THREE.Vector3() },
    uPlanetWorld: { value: new THREE.Vector3() },
    uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
    uInner: { value: 0 },
    uOuter: { value: 0 },
    uStrength: { value: 0.25 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vRingShadowWorldPos;"
      )
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvRingShadowWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vRingShadowWorldPos;
uniform vec3 uSunWorld;
uniform vec3 uPlanetWorld;
uniform vec3 uRingNormal;
uniform float uInner;
uniform float uOuter;
uniform float uStrength;`
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
{
  vec3 ringShadowRd = normalize(uSunWorld - vRingShadowWorldPos);
  float ringShadowDenom = dot(uRingNormal, ringShadowRd);
  if (abs(ringShadowDenom) > 1e-6) {
    float ringShadowT = dot(uRingNormal, uPlanetWorld - vRingShadowWorldPos) / ringShadowDenom;
    if (ringShadowT > 0.0) {
      float ringShadowR = length(vRingShadowWorldPos + ringShadowRd * ringShadowT - uPlanetWorld);
      // 内外缘各留约 4% 半影过渡：硬阈值会让环影暗带出现一条生硬的分界线
      float ringShadowMargin = (uOuter - uInner) * 0.04;
      float ringShadowBand =
        smoothstep(uInner - ringShadowMargin, uInner + ringShadowMargin, ringShadowR) *
        (1.0 - smoothstep(uOuter - ringShadowMargin, uOuter + ringShadowMargin, ringShadowR));
      reflectedLight.directDiffuse *= mix(1.0, uStrength, ringShadowBand);
    }
  }
}`
      );
  };
  return uniforms;
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
 * 太阳赤纬（度）：太阳直射点纬度
 * δ = asin( sin(ε)·sin(λ) )，λ 为太阳视黄经，ε 为黄赤交角（含章动交角主项）
 * 与 calculateTrueSubsolarLongitude 配合，即可给出太阳直射点的完整经纬度
 * @param {Date} utcDate - UTC日期对象
 * @returns {number} 太阳赤纬（度），北纬为正
 */
function calculateSolarDeclination(utcDate) {
  const T = centuriesSinceJ2000(julianDateTT(utcDate));
  const lambda = degreesToRadians(solarApparentLongitude(T)); // 太阳视黄经
  const omega = degreesToRadians(125.04 - 1934.136 * T); // 月球升交点平黄经
  // 黄赤交角（IAU 1980 多项式 + 章动交角主项），与均时差计算保持一致
  const eps0 = 23.43929111 - 0.01300417 * T - 0.00000016 * T * T;
  const eps = degreesToRadians(eps0 + 0.00256 * Math.cos(omega));
  return radToDeg(Math.asin(Math.sin(eps) * Math.sin(lambda)));
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

  // 4. 真实日下点经度 = 平太阳经度 − 均时差修正
  //    均时差为正（真太阳比平太阳快）时，真太阳已经越过格林尼治中天，
  //    日下点位于本初子午线以西（经度更负），故此处取负号
  let trueSubsolarLon = meanSubsolarLon - EoT_deg;

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
  applyRingShadowToPlanet,
  iauGroupQuaternion,
  iauSpinY,
  calculateEarthRotation,
  calculateEarthAxisAzimuth,

  // 日下点差量校准法导出
  calculateTrueSubsolarLongitude,
  calculateSolarDeclination,
  measureModelSubsolarLongitude,
  performSubsolarCalibration,
};
