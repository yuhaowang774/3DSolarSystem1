<script setup>
import { computed, ref, watch } from "vue";
import { state, commands } from "../store/useStore.js";
import { planetData, cnNames } from "../js/dats.js";
import {
  dayLength,
  noonSolarAltitude,
  polarLatitude,
  formatLatLon,
  GEO_SAMPLE_POINTS,
} from "../js/geo.js";

const tab = ref("physical");
const TABS = [
  { id: "physical", label: "物理" },
  { id: "orbital", label: "轨道" },
  { id: "rotation", label: "自转" },
  { id: "moons", label: "卫星" },
  { id: "discovery", label: "发现" },
  { id: "mythology", label: "神话" },
  { id: "exploration", label: "探测" },
];
// 地球专属：地理教学页（直射点 / 昼夜长短 / 正午太阳高度）
const GEO_TAB = { id: "geo", label: "地理" };

const planet = computed(() => {
  const n = state.selectedBody;
  return n && planetData[n] ? planetData[n] : null;
});

// 中文名优先，缺失时回退到数据中的英文标识
const cnName = computed(() => (state.selectedBody ? cnNames[state.selectedBody] || "" : ""));
const isEarth = computed(() => state.selectedBody === "earth");

const tabs = computed(() => (isEarth.value ? [...TABS, GEO_TAB] : TABS));

// ---------- 地理教学读数（地球）----------
const geo = computed(() => state.geoInfo);
const subsolarText = computed(() =>
  geo.value ? formatLatLon(geo.value.subsolarLat, geo.value.subsolarLon) : "--"
);
const declText = computed(() =>
  geo.value
    ? `${geo.value.declination >= 0 ? "北纬" : "南纬"} ${Math.abs(geo.value.declination).toFixed(2)}°`
    : "--"
);
const geoRows = computed(() => {
  const g = geo.value;
  if (!g) return [];
  return GEO_SAMPLE_POINTS.map((p) => ({
    cn: p.cn,
    lat: p.lat,
    day: dayLength(p.lat, g.declination),
    noon: noonSolarAltitude(p.lat, g.declination),
  }));
});
const polarText = computed(() => {
  const g = geo.value;
  if (!g) return "--";
  const decl = g.declination;
  if (Math.abs(decl) < 0.3) {
    return "太阳直射赤道：全球昼夜等长（各 12 小时），南北极圈内均无极昼极夜。";
  }
  const { polarDay, polarNight } = polarLatitude(decl);
  return `太阳直射 ${Math.abs(decl).toFixed(2)}°${decl > 0 ? "N" : "S"}：纬度 ${Math.abs(polarDay).toFixed(2)}°${polarDay > 0 ? "N" : "S"} 以${polarDay > 0 ? "北" : "南"}出现极昼，纬度 ${Math.abs(polarNight).toFixed(2)}°${polarNight > 0 ? "N" : "S"} 以${polarNight > 0 ? "北" : "南"}出现极夜。`;
});

// ---------- 月相（地理教学）：要素由场景按日-地-月几何 2Hz 计算 ----------
const moonPhase = computed(() => state.moonPhase);
// SVG 相位图标参数：照明比 k 决定晨昏线椭圆的水平半径，盈亏决定亮面朝向
const moonPhaseIcon = computed(() => {
  const p = moonPhase.value;
  if (!p) return null;
  const k = p.illumPct / 100;
  return { k, waxing: p.waxing, rx: +(10 * Math.abs(1 - 2 * k)).toFixed(2) };
});

const colorHex = computed(() => {
  const c = planet.value?.color;
  return c ? "#" + c.toString(16).padStart(6, "0") : "#fff";
});

const rotation = computed(() => {
  const d = planet.value?.day;
  if (d == null) return "未知";
  return d > 0 ? `${d.toFixed(2)} 小时` : `${Math.abs(d).toFixed(2)} 小时（逆向）`;
});

const semiMajor = computed(() => (planet.value?.a ? `${planet.value.a[0].toFixed(4)} AU` : "未知"));
const eccentricity = computed(() => (planet.value?.e ? planet.value.e[0].toFixed(4) : "未知"));
const inclination = computed(() => (planet.value?.I ? `${planet.value.I[0].toFixed(2)}°` : "未知"));
const orbitalPeriod = computed(() => {
  if (!planet.value?.a) return "未知";
  const a = planet.value.a[0];
  return `${Math.sqrt(a * a * a).toFixed(2)} 年`;
});

// 切换天体时重置标签页
watch(
  () => state.selectedBody,
  () => (tab.value = "physical")
);

function close() {
  // 仅收起面板：保留 selectedBody，右上角按钮再次打开时接着展示同一颗星球
  state.infoPanelOpen = false;
  commands.closePanel?.();
}
</script>

<template>
  <Transition name="panel">
    <aside v-if="state.infoPanelOpen && planet" class="info-panel">
    <button class="close" @click="close" aria-label="close">×</button>

    <div class="head">
      <span class="dot" :style="{ background: colorHex }"></span>
      <h2>{{ cnName || planet.name.toUpperCase() }}</h2>
      <span class="sub">{{ (planet.radius || 0) + " ×10⁴ KM" }}</span>
    </div>

    <p v-if="planet.description" class="desc">{{ planet.description }}</p>

    <div class="tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="tab"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <div class="tab-body">
      <!-- 物理 -->
      <div v-show="tab === 'physical'" class="grid">
        <div class="cell"><span>质量</span><b>{{ planet.mass ?? "未知" }}</b></div>
        <div class="cell"><span>密度</span><b>{{ planet.density ? planet.density.toFixed(2) + " g/cm³" : "未知" }}</b></div>
        <div class="cell"><span>重力</span><b>{{ planet.gravity ? planet.gravity.toFixed(2) + " m/s²" : "未知" }}</b></div>
        <div class="cell"><span>逃逸速度</span><b>{{ planet.escapeVelocity ? planet.escapeVelocity.toFixed(1) + " km/s" : "未知" }}</b></div>
        <div class="cell"><span>表面温度</span><b>{{ planet.temperature != null ? planet.temperature + "°C" : "未知" }}</b></div>
        <div class="cell"><span>反照率</span><b>{{ planet.albedo != null ? planet.albedo.toFixed(2) : "未知" }}</b></div>
      </div>
      <div v-if="tab === 'physical' && planet.atmosphere" class="block">
        <h4>大气成分</h4><p>{{ planet.atmosphere }}</p>
      </div>
      <div v-if="tab === 'physical' && planet.notableFeatures" class="block">
        <h4>显著特征</h4><p>{{ planet.notableFeatures }}</p>
      </div>

      <!-- 月球专属：当前月相（照明由场景真实光照产生） -->
      <div v-if="tab === 'physical' && planet.name === 'moon' && moonPhaseIcon" class="block">
        <h4>当前月相</h4>
        <div class="phase-row">
          <svg class="phase-icon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="#23262e" stroke="rgba(240,240,250,0.35)" stroke-width="0.5" />
            <path v-if="moonPhaseIcon.waxing" d="M12,2 A10,10 0 0 1 12,22 Z" fill="#e8e4d8" />
            <path v-else d="M12,2 A10,10 0 0 0 12,22 Z" fill="#e8e4d8" />
            <ellipse cx="12" cy="12" :rx="moonPhaseIcon.rx" ry="10" :fill="moonPhaseIcon.k > 0.5 ? '#e8e4d8' : '#23262e'" />
          </svg>
          <div class="phase-facts">
            <div class="phase-name">{{ moonPhase.name }}<span class="phase-sub">{{ moonPhase.waxing ? "盈 · 亮面朝西" : "亏 · 亮面朝东" }}</span></div>
            <div class="phase-line">照明比 {{ moonPhase.illumPct }}%</div>
            <div class="phase-line">月龄 {{ moonPhase.ageDays }} 天（朔望月 29.53 天）</div>
          </div>
        </div>
        <p>
          场景中月球的昼夜分界由真实太阳光照产生：面向太阳的一半被照亮，从地球方向看到的明暗比例即当前月相
          （潮汐锁定使正面恒朝地球）。拖动底部时间控制器快进，可直接观察盈亏变化。
        </p>
      </div>

      <!-- 轨道 -->
      <div v-if="tab === 'orbital'">
        <div v-if="planet.a" class="grid">
          <div class="cell"><span>半长轴</span><b>{{ semiMajor }}</b></div>
          <div class="cell"><span>偏心率</span><b>{{ eccentricity }}</b></div>
          <div class="cell"><span>轨道倾角</span><b>{{ inclination }}</b></div>
          <div class="cell"><span>公转周期</span><b>{{ orbitalPeriod }}</b></div>
          <div class="cell"><span>平近点角</span><b>{{ planet.meanAnomaly != null ? planet.meanAnomaly + "°" : "未知" }}</b></div>
          <div class="cell"><span>朔望周期</span><b>{{ planet.synodicPeriod != null ? planet.synodicPeriod.toFixed(2) + " 天" : "未知" }}</b></div>
        </div>
        <div v-if="planet.a" class="block">
          <h4>关于轨道形状</h4>
          <p>轨道线为按真实轨道要素绘制的开普勒椭圆：太阳位于焦点而非几何中心，椭圆中心相对太阳的偏移量为「半长轴 × 偏心率」，与 NASA JPL 数据一致，行星始终精确运行在轨道线上。</p>
        </div>
        <div v-else class="notice">中心天体 · 无轨道参数</div>
      </div>

      <!-- 自转 -->
      <div v-if="tab === 'rotation'" class="grid">
        <div class="cell"><span>自转周期</span><b>{{ rotation }}</b></div>
        <div class="cell"><span>轴倾角</span><b>{{ planet.inc != null ? planet.inc + "°" : "未知" }}</b></div>
        <div class="cell"><span>自转方向</span><b>{{ planet.dir === 0 ? "顺行" : "逆行" }}</b></div>
      </div>
      <div v-if="tab === 'rotation' && isEarth" class="block">
        <h4>日下点校准</h4>
        <p>
          已启用「日下点差量校准法」，模型昼夜分界线与 UTC 时间同步。
          <template v-if="state.debugInfo">
            启动时刻真实日下点经度 <b>{{ state.debugInfo.trueSubsolarLon.toFixed(2) }}°</b>，
            模型原始经度 <b>{{ state.debugInfo.modelSubsolarLon.toFixed(2) }}°</b>，
            校准旋转 <b>{{ state.debugInfo.calibrationAngleDeg.toFixed(2) }}°</b>。
          </template>
        </p>
      </div>

      <!-- 卫星 -->
      <div v-if="tab === 'moons'">
        <div v-if="planet.centralPlanet" class="block"><p><b>所属行星：</b>{{ planet.centralPlanet }}</p></div>
        <div v-if="planet.moons" class="block"><h4>卫星系统</h4><p>{{ planet.moons }}</p></div>
        <div v-if="planet.ringName" class="grid">
          <div class="cell"><span>光环</span><b>{{ planet.ringName }}</b></div>
          <div class="cell"><span>内半径</span><b>{{ planet.innerRing ? planet.innerRing + " × R" : "未知" }}</b></div>
          <div class="cell"><span>外半径</span><b>{{ planet.outerRing ? planet.outerRing + " × R" : "未知" }}</b></div>
        </div>
        <div v-if="!planet.moons && !planet.ringName && !planet.centralPlanet" class="notice">无卫星系统</div>
      </div>

      <!-- 发现 -->
      <div v-if="tab === 'discovery'">
        <div v-if="planet.discoveryInfo" class="block"><h4>发现概况</h4><p>{{ planet.discoveryInfo }}</p></div>
        <div v-if="planet.discoveryHistory" class="block"><h4>发现历史</h4><p>{{ planet.discoveryHistory }}</p></div>
      </div>

      <!-- 神话 -->
      <div v-if="tab === 'mythology'" class="block">
        <h4>神话背景</h4>
        <p>{{ planet.mythBackground || "暂无神话背景资料" }}</p>
      </div>

      <!-- 探测 -->
      <div v-if="tab === 'exploration'">
        <div v-if="planet.explorationHistory" class="block"><h4>探测历史</h4><p>{{ planet.explorationHistory }}</p></div>
        <div v-if="planet.lunarExploration" class="block"><h4>月球探索</h4><p>{{ planet.lunarExploration }}</p></div>
        <div v-if="planet.earthInteraction" class="block"><h4>与地球相互作用</h4><p>{{ planet.earthInteraction }}</p></div>
        <div v-if="planet.futureColonization" class="block"><h4>未来殖民</h4><p>{{ planet.futureColonization }}</p></div>
        <div v-if="planet.uniqueTilt" class="block"><h4>独特倾斜</h4><p>{{ planet.uniqueTilt }}</p></div>
        <div v-if="planet.ringSystem" class="block"><h4>光环系统</h4><p>{{ planet.ringSystem }}</p></div>
        <div v-if="planet.lifeForms" class="block"><h4>生命形式</h4><p>{{ planet.lifeForms }}</p></div>
        <div v-if="planet.moonsSystem" class="block"><h4>卫星系统</h4><p>{{ planet.moonsSystem }}</p></div>
        <div v-if="planet.extremeWeather" class="block"><h4>极端天气</h4><p>{{ planet.extremeWeather }}</p></div>
      </div>

      <!-- 地理（仅地球）：太阳直射点 / 昼夜长短 / 正午太阳高度 -->
      <div v-if="tab === 'geo'">
        <div class="grid">
          <div class="cell"><span>太阳直射点</span><b>{{ subsolarText }}</b></div>
          <div class="cell"><span>太阳赤纬</span><b>{{ declText }}</b></div>
          <div class="cell"><span>世界时 UTC</span><b>{{ geo?.utc || "--" }}</b></div>
          <div class="cell"><span>北京时间（地方时）</span><b>{{ geo?.beijingTime || "--" }}</b></div>
        </div>

        <div class="block">
          <h4>昼夜长短与正午太阳高度</h4>
          <div class="geo-table">
            <div class="geo-row geo-head">
              <span>地点</span><span>昼长</span><span>正午太阳高度</span>
            </div>
            <div v-for="row in geoRows" :key="row.cn" class="geo-row">
              <span>{{ row.cn }} · {{ row.lat.toFixed(1) }}°N</span>
              <span>{{ row.day.toFixed(1) }} h</span>
              <span>{{ row.noon.toFixed(1) }}°</span>
            </div>
          </div>
          <p class="geo-note">
            昼长由 cos H₀ = −tan φ · tan δ 计算，正午太阳高度 H = 90° − |φ − δ|
            （φ 为当地纬度、δ 为太阳赤纬）。拖动底部时间控制器改变模拟时间，
            即可观察一年中昼夜长短与正午太阳高度的变化规律。
          </p>
        </div>

        <div class="block">
          <h4>极昼与极夜</h4>
          <p>{{ polarText }}</p>
        </div>

        <!-- 月相教学：与场景中月球明暗、上方标签实时一致 -->
        <div class="block">
          <h4>月相</h4>
          <div v-if="moonPhaseIcon" class="phase-row">
            <svg class="phase-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="#23262e" stroke="rgba(240,240,250,0.35)" stroke-width="0.5" />
              <path v-if="moonPhaseIcon.waxing" d="M12,2 A10,10 0 0 1 12,22 Z" fill="#e8e4d8" />
              <path v-else d="M12,2 A10,10 0 0 0 12,22 Z" fill="#e8e4d8" />
              <ellipse cx="12" cy="12" :rx="moonPhaseIcon.rx" ry="10" :fill="moonPhaseIcon.k > 0.5 ? '#e8e4d8' : '#23262e'" />
            </svg>
            <div class="phase-facts">
              <div class="phase-name">{{ moonPhase.name }}<span class="phase-sub">{{ moonPhase.waxing ? "盈 · 亮面朝西" : "亏 · 亮面朝东" }}</span></div>
              <div class="phase-line">照明比 {{ moonPhase.illumPct }}%</div>
              <div class="phase-line">月龄 {{ moonPhase.ageDays }} 天 · 距角 {{ moonPhase.elongDeg }}°</div>
            </div>
          </div>
          <p class="geo-note">
            月相成因：月球不发光，靠反射太阳光被照亮。随月球绕地球公转，日、地、月三者的相对位置不断变化，
            地球上看到的明暗部分呈周期性盈亏，一个循环为朔望月（约 29.53 天）。上图与场景中月球贴近日照分界一致；
            拖动底部时间控制器快进约 30 天，可观察完整的月相循环。
          </p>
        </div>

        <div class="block">
          <h4>图层提示</h4>
          <p>
            经纬网、地轴、晨昏线、太阳直射点与主要城市均为独立图层，
            可在右侧 LAYERS 面板中开关；贴近地球视角时自动显示。
          </p>
        </div>
      </div>
    </div>
    </aside>
  </Transition>
</template>

<style scoped>
/* 浮动面板：贴在顶栏按钮下方（与 LAYERS / LENS 停靠栏同列），高度随内容自适应 */
.info-panel {
  position: fixed;
  /* 左侧停靠：与搜索栏同一列（搜索栏 70px + 输入框高 ≈ 45px），下移避开 */
  top: 124px;
  left: 32px;
  z-index: 30;
  width: min(390px, calc(100vw - 36px));
  max-height: calc(100vh - 150px);
  background: rgba(0, 0, 0, 0.82);
  border: 1px solid var(--line);
  backdrop-filter: blur(10px);
  padding: 18px 22px 22px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* 面板展开/收起：右侧滑入滑出 + 淡入淡出（Vue Transition 驱动，进出场对称） */
.panel-enter-active,
.panel-leave-active {
  transition: transform 0.45s cubic-bezier(0.19, 1, 0.22, 1),
    opacity 0.45s cubic-bezier(0.19, 1, 0.22, 1);
}
.panel-enter-from,
.panel-leave-to {
  /* 左侧停靠：从左侧滑入滑出（与右移的原右侧布局方向相反） */
  transform: translateX(-60px);
  opacity: 0;
}
.panel-enter-to,
.panel-leave-from {
  transform: translateX(0);
  opacity: 1;
}
.close {
  position: absolute;
  top: 20px;
  right: 24px;
  background: transparent;
  border: none;
  color: var(--ink);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  transition: opacity 0.2s ease;
}
.close:hover { opacity: 0.6; }
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 16px;
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
}
.head h2 {
  font-family: "Archivo", sans-serif;
  font-weight: 700;
  font-size: 22px;
  letter-spacing: 3px;
  color: var(--ink);
  margin: 0;
}
.head .sub {
  margin-left: auto;
  font-family: "Archivo", sans-serif;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--muted);
}
.desc {
  margin: 18px 0 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink-soft);
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 20px 0 18px;
  border-bottom: 1px solid var(--line);
}
.tab {
  background: transparent;
  border: none;
  color: var(--muted);
  font-family: "Archivo", sans-serif;
  font-size: 11px;
  letter-spacing: 1px;
  padding: 9px 11px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.25s ease;
}
.tab:hover { color: var(--ink-soft); }
.tab.active {
  color: var(--ink);
  border-bottom-color: var(--ink);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
}
.cell {
  background: #000;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.cell span {
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--muted);
}
.cell b {
  font-family: "Archivo", sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: var(--ink);
}
.block {
  margin-top: 18px;
}
.block h4 {
  font-family: "Archivo", sans-serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--ink);
  margin: 0 0 8px;
}
.block p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-soft);
}
.notice {
  margin-top: 12px;
  font-size: 13px;
  color: var(--muted);
  letter-spacing: 1px;
}
/* ---------- 月相（地理教学）：图标 + 要素读数 ---------- */
.phase-row {
  display: flex;
  gap: 14px;
  align-items: center;
  margin: 4px 0 2px;
}
.phase-icon {
  width: 46px;
  height: 46px;
  flex: none;
}
.phase-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--ink);
}
.phase-sub {
  margin-left: 8px;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 1px;
  color: var(--muted);
}
.phase-line {
  font-size: 12px;
  color: var(--ink-soft);
  margin-top: 2px;
}
/* ---------- 地理教学表格（地球「地理」页） ---------- */
.geo-table {
  border: 1px solid var(--line);
}
.geo-row {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 1fr;
  gap: 8px;
  padding: 9px 12px;
  font-size: 12px;
  color: var(--ink-soft);
  border-top: 1px solid var(--line);
  font-variant-numeric: tabular-nums;
}
.geo-row:first-child {
  border-top: none;
}
.geo-head {
  background: rgba(240, 240, 250, 0.04);
  font-family: "Archivo", sans-serif;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--muted);
}
.geo-note {
  margin-top: 10px !important;
  font-size: 12px !important;
  line-height: 1.75;
  color: var(--muted) !important;
}
@media (max-width: 768px) {
  .info-panel {
    top: 62px;
    right: 12px;
    width: calc(100vw - 24px);
    max-height: calc(100vh - 84px);
    padding: 16px 16px 20px;
  }
  .head h2 { font-size: 18px; letter-spacing: 2px; }
}
</style>
