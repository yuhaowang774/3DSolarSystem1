import * as THREE from "three";

/**
 * 地理教学通用工具与数据
 *
 * 坐标约定（与 three.js SphereGeometry 的 UV / 等距圆柱投影贴图一致，
 * 也与 utils.js 中 calculateLongitudeFromSunDirection 的经度定义一致）：
 *   本初子午线（0°经线）→ 地球网格本地 +X
 *   东经 90°            → 地球网格本地 −Z
 *   北极                → 地球网格本地 +Y
 * 即 local = (r·cosLat·cosLon, r·sinLat, −r·cosLat·sinLon)
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// 场景尺度：1 场景单位 = 10^4 km（与 dats.js 中 radius 的单位一致）
export const KM_PER_UNIT = 1e4;
export const KM_TO_UNIT = 1e-4;

/**
 * 地理坐标 → 地球网格本地坐标
 * @param {number} lat - 纬度（度，北正）
 * @param {number} lon - 经度（度，东正）
 * @param {number} radius - 球半径（场景单位）
 * @param {THREE.Vector3} [target] - 复用的目标向量
 * @returns {THREE.Vector3}
 */
export function latLonToLocal(lat, lon, radius, target = new THREE.Vector3()) {
  const latR = lat * RAD;
  const lonR = lon * RAD;
  const cosLat = Math.cos(latR);
  return target.set(
    radius * cosLat * Math.cos(lonR),
    radius * Math.sin(latR),
    -radius * cosLat * Math.sin(lonR)
  );
}

/**
 * 地球网格本地坐标 → 地理坐标
 * @param {THREE.Vector3} v - 本地坐标
 * @returns {{lat:number, lon:number}} 纬度/经度（度）
 */
export function localToLatLon(v) {
  const r = v.length() || 1;
  const lat = Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1)) * DEG;
  const lon = Math.atan2(-v.z, v.x) * DEG;
  return { lat, lon };
}

/**
 * 经纬度格式化：39.9°N 116.4°E
 * @param {number} lat - 纬度（度）
 * @param {number} lon - 经度（度）
 * @param {number} [digits=1] - 小数位
 * @returns {string}
 */
export function formatLatLon(lat, lon, digits = 1) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(digits)}°${ns} ${Math.abs(lon).toFixed(digits)}°${ew}`;
}

/**
 * 昼长（小时）
 * cos(H₀) = −tan(lat)·tan(δ)，昼长 = 2H₀ / 15°
 * @param {number} lat - 纬度（度）
 * @param {number} decl - 太阳赤纬（度）
 * @returns {number} 昼长（小时），0 表示极夜、24 表示极昼
 */
export function dayLength(lat, decl) {
  const t = -Math.tan(lat * RAD) * Math.tan(decl * RAD);
  if (t <= -1) return 24; // 极昼
  if (t >= 1) return 0; // 极夜
  return (2 * Math.acos(t) * DEG) / 15;
}

/**
 * 正午太阳高度角（度）：H = 90° − |纬度 − 赤纬|
 * @param {number} lat - 纬度（度）
 * @param {number} decl - 太阳赤纬（度）
 * @returns {number} 正午太阳高度角（度，负数取 0）
 */
export function noonSolarAltitude(lat, decl) {
  const h = 90 - Math.abs(lat - decl);
  return h > 0 ? h : 0;
}

/**
 * 极昼/极夜范围：纬度绝对值 ≥ 90° − |赤纬|
 * @param {number} decl - 太阳赤纬（度）
 * @returns {{polarDay:number, polarNight:number}} 出现极昼 / 极夜的最低纬度
 */
export function polarLatitude(decl) {
  const boundary = 90 - Math.abs(decl);
  return decl >= 0
    ? { polarDay: boundary, polarNight: -boundary }
    : { polarDay: -boundary, polarNight: boundary };
}

/**
 * 地方时（小时，0-24）：经度每 15° 相差 1 小时
 * @param {Date} utcDate - UTC 时间
 * @param {number} lon - 经度（度）
 * @returns {number} 地方平太阳时（小时）
 */
export function localMeanTime(utcDate, lon) {
  const utcHours =
    utcDate.getUTCHours() +
    utcDate.getUTCMinutes() / 60 +
    utcDate.getUTCSeconds() / 3600;
  let t = utcHours + lon / 15;
  t = ((t % 24) + 24) % 24;
  return t;
}

/** 地方时格式化为 HH:MM */
export function formatHours(hours) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 经纬网采样精度 */
export const GRATICULE_LAT_STEP = 15;
export const GRATICULE_LON_STEP = 15;

/** 特殊纬线（教学重点：赤道 / 南北回归线 / 南北极圈） */
export const KEY_CIRCLES = [
  { lat: 66.5636, label: "北极圈", color: "#7fd1ff" },
  { lat: 23.4393, label: "北回归线", color: "#ffd166" },
  { lat: 0, label: "赤道", color: "#ffffff" },
  { lat: -23.4393, label: "南回归线", color: "#ffd166" },
  { lat: -66.5636, label: "南极圈", color: "#7fd1ff" },
];

/** 主要城市（地理教学标记，中文名 + 经纬度） */
export const GEO_CITIES = [
  { cn: "北京", lat: 39.9, lon: 116.41 },
  { cn: "上海", lat: 31.23, lon: 121.47 },
  { cn: "广州", lat: 23.13, lon: 113.26 },
  { cn: "乌鲁木齐", lat: 43.83, lon: 87.62 },
  { cn: "拉萨", lat: 29.65, lon: 91.14 },
  { cn: "哈尔滨", lat: 45.8, lon: 126.53 },
  { cn: "香港", lat: 22.32, lon: 114.17 },
  { cn: "台北", lat: 25.03, lon: 121.57 },
  { cn: "东京", lat: 35.68, lon: 139.69 },
  { cn: "新加坡", lat: 1.35, lon: 103.82 },
  { cn: "悉尼", lat: -33.87, lon: 151.21 },
  { cn: "伦敦", lat: 51.51, lon: -0.13 },
  { cn: "莫斯科", lat: 55.76, lon: 37.62 },
  { cn: "开罗", lat: 30.04, lon: 31.24 },
  { cn: "纽约", lat: 40.71, lon: -74.01 },
  { cn: "圣保罗", lat: -23.55, lon: -46.63 },
];

/** 昼长/正午太阳高度角教学采样点（含极圈，便于展示极昼极夜） */
export const GEO_SAMPLE_POINTS = [
  { cn: "漠河", lat: 52.97 },
  { cn: "北京", lat: 39.9 },
  { cn: "上海", lat: 31.23 },
  { cn: "广州", lat: 23.13 },
  { cn: "北极圈", lat: 66.56 },
];

/**
 * 月相要素：由「地心 → 太阳」与「地心 → 月球」两个方向向量计算。
 * 距角（日月方向夹角）决定照明比与月相名称，叉积的极轴分量判定盈亏；
 * 照明比 k = (1 - cos 距角) / 2（新月 0 → 上弦 0.5 → 满月 1），
 * 月龄按距角占朔望月周期（29.5306 天）的比例折算。
 * @param {THREE.Vector3} sunDir - 地心指向太阳的单位向量
 * @param {THREE.Vector3} moonDir - 地心指向月球的单位向量
 * @returns {{elongDeg:number, waxing:boolean, name:string, illumPct:number, ageDays:number}}
 */
export function moonPhaseFromDirections(sunDir, moonDir) {
  const cosE = Math.max(-1, Math.min(1, sunDir.dot(moonDir)));
  const elong = Math.acos(cosE) * DEG; // 距角绝对值 0-180°
  // 盈亏判定：sunDir × moonDir 的黄极（+Y）分量为正 → 月球在太阳以东（盈）
  const waxing = sunDir.z * moonDir.x - sunDir.x * moonDir.z > 0;
  const e = waxing ? elong : 360 - elong; // 0-360° 距角
  const name =
    e < 22.5 ? "新月" :
    e < 67.5 ? "娥眉月" :
    e < 112.5 ? "上弦月" :
    e < 157.5 ? "盈凸月" :
    e < 202.5 ? "满月" :
    e < 247.5 ? "亏凸月" :
    e < 292.5 ? "下弦月" :
    e < 337.5 ? "残月" : "新月";
  return {
    elongDeg: +e.toFixed(1),
    waxing,
    name,
    illumPct: Math.round(((1 - cosE) / 2) * 100),
    ageDays: +((e / 360) * 29.5306).toFixed(1),
  };
}
