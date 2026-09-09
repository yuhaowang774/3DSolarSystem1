import * as THREE from "three";
import gsap from "gsap";

/**
 * 相机运镜播放器
 *
 * playTour：一镜到底模式（供 shots.js 的 TOUR 数据驱动）
 *   全程构建为一条 CatmullRom 样条（centripetal），由「全局连续速度剖面」驱动：
 *   环绕圈以轨道速度慢速绕行，星际转移以钟形速度剖面飞行（时间均匀采样），
 *   段间速度互相衔接，中途速度永不为零——像驾驶飞船一样连续飞行，无剪切拼接。
 *
 * 与渲染循环的约定：
 *   - GSAP onUpdate 写 camera.position / _lookAtProxy / _roll
 *   - camera.lookAt 在渲染循环里通过 applyLookAt() 调用（含压坡度滚转）
 *   - 播放期间宿主需自行禁用 OrbitControls 与相机跟随逻辑（互斥开关）
 */

// 每个整圈的采样点数（含首尾，首尾同方位角 → 闭合圆）
const LAP_PTS = 18;
// 每段星际转移的时间采样档数（每档耗时 = flyTime/N，速度取档中点剖面值）
const FLY_PTS = 20;
// 转移段中段的侧摆幅度（占航线长度比例），制造绕飞弧线
const FLY_SWAY = 0.03;
// 压坡度上限与增益（转弯越急压得越多；若侧倾方向与转弯相反，翻转 GAIN 符号）
const MAX_ROLL = (10 * Math.PI) / 180;
const ROLL_GAIN = 0.45;
// 惯性滤波（临界阻尼指数趋近）：位置/视线目标每帧由弹簧层跟随，
// 加速度天然连续、转弯自动圆滑切入切出。K 越小跟随越"重"（惯性越大）
const PATH_SMOOTH_K = 3.2;
const LOOK_SMOOTH_K = 5;
// 自适应刚度的角速度增益与下限（见 _applyTourProgress 惯性层注释）
const PATH_OMEGA_GAIN = 1.5;

// 惯性层复用的临时向量（模块级，避免每帧分配）
const _dirTmp = new THREE.Vector3();

export class CameraDirector {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {(name: string, out: THREE.Vector3) => THREE.Vector3} getTargetWorldPos
   *        按名称返回天体世界坐标（写入 out 并返回）
   */
  constructor(camera, getTargetWorldPos) {
    this.camera = camera;
    this.getTargetWorldPos = getTargetWorldPos;
    this.timeline = null;
    this.isPlaying = false;
    this.onComplete = null; // 播放自然结束时的回调（跳过时不触发）

    this._lookAtProxy = new THREE.Vector3();
    this._tmpCenter = new THREE.Vector3();
    this._roll = 0; // 当前帧滚转角（rad）

    // 惯性弹簧层：剖面给出目标位姿，相机以指数趋近跟随（有重量感的运动）
    this._targetPos = new THREE.Vector3();
    this._targetLook = new THREE.Vector3();
    this._smoothPos = new THREE.Vector3();
    this._smoothLook = new THREE.Vector3();
    this._physInit = false; // 首帧/跳转后直接吸附目标，不做追赶飞行
    this._lastPhysTick = 0;

    // playTour 构建产物
    this._curve = null;
    this._tauSpline = null; // 全局时间 → 路径进度的 C¹ 单调样条
    this._lookRanges = null; // 视线分段表
    this._rollSpline = null; // 路径进度 → 滚转的 C¹ 样条
    this._marks = null; // { 天体名: 秒 } 供 seekTo 跳转
    this._totalTau = 0;
  }

  /** 播放一镜到底旅程（数据结构见 shots.js 的 TOUR） */
  playTour(tour) {
    this.stop();
    this.isPlaying = true;

    const built = buildTour(tour, this.getTargetWorldPos);
    this._curve = built.curve;
    this._tauSpline = built.tauSpline;
    this._lookRanges = built.lookRanges;
    this._rollSpline = built.rollSpline;
    this._marks = built.marks;
    this._totalTau = built.totalTau;
    this._roll = 0;
    this._physInit = false; // 新旅程从目标位姿直接开始
    this._prevDir = null; // 惯性层的上一帧目标方向（角速度估计用）

    const proxy = { tau: 0 };
    this.timeline = gsap.timeline({
      onComplete: () => {
        this.isPlaying = false;
        if (this.onComplete) this.onComplete();
      },
    });
    // 线性时钟：速度节奏已完全编码在 tau 样条的时间映射里
    this.timeline.to(proxy, {
      tau: this._totalTau,
      duration: this._totalTau,
      ease: "none",
      onUpdate: () => this._applyTourProgress(proxy.tau),
    });

    return this;
  }

  /** 时钟 τ → 路径进度 u → 目标位姿 → 惯性弹簧跟随 → 相机位姿 */
  _applyTourProgress(tau) {
    const u = evalSeries(this._tauSpline, tau);
    this._curve.getPointAt(u, this._targetPos);
    sampleLookAt(this._lookRanges, u, this.getTargetWorldPos, this._tmpCenter);
    this._targetLook.copy(this._tmpCenter);

    // 惯性层：帧率无关的指数趋近（临界阻尼），位置与视线都带重量感。
    // 刚度随目标方向角速度 ω 自适应：环绕/急弯时 ω 大 → 弹簧变硬精确跟踪，
    // 避免一阶滞后把跟随轨迹向行星内侧压缩（高速小半径出弧时会擦掠星面）；
    // 直线巡航时 ω≈0 → 保持松弛惯性
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - (this._lastPhysTick || now)) / 1000));
    this._lastPhysTick = now;
    if (!this._physInit) {
      this._smoothPos.copy(this._targetPos);
      this._smoothLook.copy(this._targetLook);
      this._physInit = true;
    }
    _dirTmp.copy(this._targetPos).sub(this._smoothPos);
    const dl = _dirTmp.length();
    if (dl > 1e-9) _dirTmp.multiplyScalar(1 / dl);
    let omega = 0;
    if (this._prevDir) {
      const dot = THREE.MathUtils.clamp(_dirTmp.dot(this._prevDir), -1, 1);
      omega = Math.acos(dot) / dt;
      this._prevDir.copy(_dirTmp);
    } else {
      this._prevDir = _dirTmp.clone();
    }
    const kEff = Math.max(PATH_SMOOTH_K, omega * PATH_OMEGA_GAIN);
    this._smoothPos.lerp(this._targetPos, 1 - Math.exp(-kEff * dt));
    this._smoothLook.lerp(this._targetLook, 1 - Math.exp(-LOOK_SMOOTH_K * dt));

    this.camera.position.copy(this._smoothPos);
    this._lookAtProxy.copy(this._smoothLook);
    this._roll = evalSeries(this._rollSpline, u);
  }

  /** 跳转到指定天体的环绕圈（供章节跳转使用；τ 与播放时钟同单位） */
  seekTo(bodyName) {
    if (!this.timeline || !this._marks) return;
    const tau = this._marks[bodyName];
    if (tau !== undefined) {
      this.timeline.seek(tau);
      this._physInit = false; // 跳转后直接吸附新目标，不做跨越大半个太阳系的追赶飞行
    }
  }

  /** 渲染循环内每帧调用：运镜期间接管视线（含转弯压坡度） */
  applyLookAt() {
    if (this.isPlaying) {
      this.camera.lookAt(this._lookAtProxy);
      if (this._roll) {
        this.camera.rotateZ(this._roll);
      }
    }
  }

  /** 停止播放并销毁 timeline */
  stop() {
    if (this.timeline) {
      this.timeline.kill();
      this.timeline = null;
    }
    this.isPlaying = false;
  }
}

/* ════════════════════════════ 旅程构建 ════════════════════════════ */

/**
 * 把 TOUR 数据构建为一条样条路径 + 连续速度剖面。
 * 行星在几分钟尺度内位移可忽略，天体中心在构建时一次性采样；
 * 视线目标（sampleLookAt）仍每帧实时查询，保证构图始终对准真实天体。
 */
function buildTour(tour, getPos) {
  const centers = new Map();
  const getCenter = (name) => {
    if (!centers.has(name)) centers.set(name, getPos(name, new THREE.Vector3()));
    return centers.get(name);
  };

  const pts = []; // 控制点序列
  const segs = []; // { type, startIdx, endIdx, ... }

  // ── 预计算各站环绕弧的出入方位角：运动路线符合直觉且永远向前 ──
  // 入圈点朝向来时方向（上一站 / 开场默认机位），出圈切向对准下一站方向；
  // 顺/逆时针两条弧里选较短的一条（90°~300° 钳制）——从哪边来就贴哪边掠过，
  // 绝不出现「看起来要从左侧绕却绕去了右侧」的直觉冲突
  const centers0 = tour.laps.map((L) => getCenter(L.target).clone());
  const TWO_PI = Math.PI * 2;
  const arcs = tour.laps.map((L, k) => {
    const c = centers0[k];
    let dirX, dirZ;
    if (k < tour.laps.length - 1) {
      dirX = centers0[k + 1].x - c.x;
      dirZ = centers0[k + 1].z - c.z;
    } else {
      dirX = tour.overview.offset.x; // 末站朝总揽位方向出圈
      dirZ = tour.overview.offset.z;
    }
    const dl = Math.hypot(dirX, dirZ) || 1;
    dirX /= dl;
    dirZ /= dl;
    const thetaExitCw = Math.atan2(dirX, -dirZ); // 顺时针出圈切向对准前进方向
    const thetaExitCcw = Math.atan2(-dirX, dirZ); // 逆时针出圈切向对准前进方向
    // 入圈点：行星朝向来时方向的一面
    let fromX, fromZ;
    if (k > 0) {
      fromX = centers0[k - 1].x - c.x;
      fromZ = centers0[k - 1].z - c.z;
    } else {
      fromX = 1; fromZ = 1; // 开场面向默认机位方向（右上俯瞰位）
    }
    const thetaEnter = Math.atan2(fromZ, fromX);
    // 两个候选弧：取较短者（CW 弧度值为负，CCW 为正）
    let sweepCw = thetaExitCw - thetaEnter;
    while (sweepCw > 0) sweepCw -= TWO_PI;
    while (sweepCw <= -TWO_PI) sweepCw += TWO_PI;
    let sweepCcw = thetaExitCcw - thetaEnter;
    while (sweepCcw < 0) sweepCcw += TWO_PI;
    while (sweepCcw >= TWO_PI) sweepCcw -= TWO_PI;
    const useCw = -sweepCw <= sweepCcw;
    let sweepRad = useCw ? sweepCw : sweepCcw;
    // 弧度钳制：太直没有飞掠感，太长又倒回后方
    const minAbs = THREE.MathUtils.degToRad(90);
    const maxAbs = THREE.MathUtils.degToRad(300);
    if (Math.abs(sweepRad) < minAbs) sweepRad = minAbs * Math.sign(sweepRad || 1);
    if (Math.abs(sweepRad) > maxAbs) sweepRad = maxAbs * Math.sign(sweepRad);
    return {
      entryDeg: THREE.MathUtils.radToDeg(thetaEnter),
      sweepDeg: THREE.MathUtils.radToDeg(sweepRad),
    };
  });

  // ── 逐站生成：飞掠弧 + 转移 ──
  tour.laps.forEach((L, k) => {
    const c = getCenter(L.target);
    const isFirst = pts.length === 0;
    const lapStartIdx = isFirst ? 0 : pts.length - 1; // 弧首点已由上一段转移推入

    // 飞掠弧：entryDeg → entryDeg+sweep，半径/高度线性螺旋
    for (let i = isFirst ? 0 : 1; i <= LAP_PTS; i++) {
      const f = i / LAP_PTS;
      pts.push(circlePoint(c, arcs[k].entryDeg + arcs[k].sweepDeg * f, THREE.MathUtils.lerp(L.rIn, L.rOut, f), THREE.MathUtils.lerp(L.hIn, L.hOut, f)));
    }
    const lapEndIdx = pts.length - 1;
    // 弧折线长度 → 轨道速度（转移段出入速度衔接用）
    let lapLen = 0;
    for (let i = lapStartIdx + 1; i <= lapEndIdx; i++) lapLen += pts[i].distanceTo(pts[i - 1]);
    const vLap = lapLen / L.lapTime;
    segs.push({ type: "lap", startIdx: lapStartIdx, endIdx: lapEndIdx, target: L.target, lapTime: L.lapTime, vLap });

    // 转移到下一站：时间均匀采样的钟形剖面，端点速度衔接两侧轨道速度
    if (k < tour.laps.length - 1) {
      const N = tour.laps[k + 1];
      const nc = getCenter(N.target);
      const from = pts[pts.length - 1];
      const to = circlePoint(nc, arcs[k + 1].entryDeg, N.rIn, N.hIn);
      // 出入圈速度 = 3 倍轨道速度，与圈端部形状对称衔接：
      // 速度谷底位于圈中央而非交界点，交界处速度单调穿过，无停靠感
      const dep = 3 * vLap;
      const arr = 3 * ((2 * Math.PI * ((N.rIn + N.rOut) / 2)) / N.lapTime);
      const speeds = [];
      appendTransfer(pts, from, to, from.distanceTo(to) * FLY_SWAY, dep, arr, N.flyTime, speeds);
      segs.push({ type: "transfer", startIdx: lapEndIdx, endIdx: pts.length - 1, from: L.target, to: N.target, flyTime: N.flyTime, speeds });
    }
  });

  // ── 终章两级拉出：海王星 → 太阳系总揽位 → 银河系全貌 → 银河尺度漂移收尾 ──
  const OV = tour.overview;
  const GAL = tour.galaxy;
  {
    const c = getCenter(OV.target); // 太阳（银盘中心锚点）
    const lastLap = segs[segs.length - 1];

    // 第一级：海王星 → 太阳系总揽位（八大轨道尽收眼底）
    const from = pts[pts.length - 1];
    const sysTo = c.clone().add(new THREE.Vector3(OV.offset.x, OV.offset.y, OV.offset.z));
    const sysLen = from.distanceTo(sysTo);
    // 衔接速度 = 本级巡航峰的 ~15%：进总揽位前有明显减速收势（抵达感），
    // 又不至于低速徘徊形成停顿；第二级拉出以此为起点同速续推
    const sysV0 = (0.3 * sysLen) / OV.flyTime;
    const dep1 = 2.5 * lastLap.vLap;
    const speeds1 = [];
    appendTransfer(pts, from, sysTo, from.distanceTo(sysTo) * FLY_SWAY * 0.6, dep1, sysV0, OV.flyTime, speeds1);
    const sysEndIdx = pts.length - 1;
    segs.push({ type: "transfer", startIdx: lastLap.endIdx, endIdx: sysEndIdx, from: lastLap.target, to: OV.target, flyTime: OV.flyTime, speeds: speeds1 });

    // 第二级：太阳系总揽位 → 银河系全貌（跨 8 个数量级的持续加速拉出）
    const gTo = c.clone().add(new THREE.Vector3(GAL.offset.x, GAL.offset.y, GAL.offset.z));
    const gOff = gTo.clone().sub(c);
    const gR0 = Math.hypot(gOff.x, gOff.z);
    const gV0 = (1.8 * (gR0 * THREE.MathUtils.degToRad(GAL.arcDeg || 10))) / GAL.settleTime;
    const speeds2 = [];
    appendTransfer(pts, sysTo, gTo, sysTo.distanceTo(gTo) * FLY_SWAY * 0.3, sysV0, gV0, GAL.flyTime, speeds2);
    segs.push({ type: "transfer", startIdx: sysEndIdx, endIdx: pts.length - 1, from: OV.target, to: GAL.target, flyTime: GAL.flyTime, speeds: speeds2 });

    // 银河尺度漂移收尾：绕总揽位缓慢扫过 arcDeg，速度按 (1-f)^1.5 衰减到静止
    const a0 = Math.atan2(gOff.z, gOff.x);
    const settleStartIdx = pts.length - 1;
    for (let i = 1; i <= 3; i++) {
      const f = i / 3;
      const a = a0 + THREE.MathUtils.degToRad(GAL.arcDeg || 10) * f;
      const r = gR0 * (1 - 0.05 * f);
      const y = gOff.y * (1 + 0.05 * f);
      pts.push(new THREE.Vector3(c.x + r * Math.cos(a), c.y + y, c.z + r * Math.sin(a)));
    }
    segs.push({ type: "settle", startIdx: settleStartIdx, endIdx: pts.length - 1, target: GAL.target, settleTime: GAL.settleTime, v0: gV0 });
  }

  // ── 样条与弧长表 ──
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  curve.arcLengthDivisions = 4000;
  const M = pts.length;
  const lengths = curve.getLengths();
  const totalLen = lengths[lengths.length - 1];
  // 控制点 i 的弧长进度 u（归一化到 0~1；CatmullRom 参数 t=i/(M-1) 恰好落在控制点上）
  const us = [];
  for (let i = 0; i < M; i++) us.push(arcAt(lengths, i / (M - 1)) / totalLen);

  // 视线分段表（u 区间）
  const lookRanges = segs.map((s) => ({
    type: s.type,
    u0: us[s.startIdx],
    u1: us[s.endIdx],
    target: s.target,
    from: s.from,
    to: s.to,
  }));

  // ── 速度剖面 → 时间表 ──
  // 转移段用构建时预计算的速度（时间均匀采样，天然无停顿）；
  // 圈/收尾段用形状函数 + 中点采样，随后逐段时间归一化锁定段耗时
  const intervalSpeed = new Array(M - 1);
  segs.forEach((s) => {
    const count = s.endIdx - s.startIdx;
    if (s.type === "transfer") {
      for (let i = 0; i < count; i++) intervalSpeed[s.startIdx + i] = s.speeds[i];
    } else {
      for (let i = s.startIdx; i < s.endIdx; i++) {
        const f = (i - s.startIdx + 0.5) / count;
        intervalSpeed[i] = segmentSpeed(s, f);
      }
    }
  });
  // ── 逐段时间归一化：段耗时无条件锁定为设定时长 ──
  // （速度剖面只决定时间在段内的分布；形状带来的积分偏差统一在此校正）
  segs.forEach((s) => {
    const duration = s.type === "lap" ? s.lapTime : s.type === "settle" ? s.settleTime : s.flyTime;
    let sumDt = 0;
    for (let i = s.startIdx; i < s.endIdx; i++) {
      sumDt += ((us[i + 1] - us[i]) * totalLen) / intervalSpeed[i];
    }
    const k = sumDt / duration; // k>0：速度乘 k 后 ΣΔt = duration
    for (let i = s.startIdx; i < s.endIdx; i++) intervalSpeed[i] *= k;
  });
  // 全局开场柔化：头两个区间再乘渐入系数，避免起步瞬间速度突跳
  intervalSpeed[0] *= 0.35;
  intervalSpeed[1] *= 0.7;

  const tauTable = [{ t: 0, u: 0 }];
  let tau = 0;
  for (let i = 0; i < M - 1; i++) {
    tau += ((us[i + 1] - us[i]) * totalLen) / intervalSpeed[i];
    tauTable.push({ t: tau, u: us[i + 1] });
  }
  const totalTau = tau;

  // 章节跳转标记：各站环绕圈入口的时钟值
  const marks = {};
  segs.forEach((s) => {
    if (s.type === "lap") marks[s.target] = tauTable[s.startIdx].t;
  });

  // ── 压坡度表：按相邻段方向夹角计算滚转，再做窗口平滑 ──
  const rolls = new Array(M).fill(0);
  for (let i = 1; i < M - 1; i++) {
    const ax = pts[i].x - pts[i - 1].x, az = pts[i].z - pts[i - 1].z;
    const bx = pts[i + 1].x - pts[i].x, bz = pts[i + 1].z - pts[i].z;
    const al = Math.hypot(ax, az) || 1, bl = Math.hypot(bx, bz) || 1;
    const turn = Math.atan2((az / al) * (bx / bl) - (ax / al) * (bz / bl), (ax / al) * (bx / al) + (az / al) * (bz / al));
    rolls[i] = THREE.MathUtils.clamp(turn * ROLL_GAIN, -MAX_ROLL, MAX_ROLL);
  }
  // ±2 点滑动平均：消除采样离散带来的滚转抖动
  const rollSmooth = rolls.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = i - 2; j <= i + 2; j++) {
      if (j >= 0 && j < M) { sum += rolls[j]; n++; }
    }
    return sum / n;
  });
  // ── C¹ 样条化：把分段线性表升级为三次 Hermite 样条 ──
  // τ→u 与滚转都用单调样条（Fritsch–Carlson 限幅）：速度与倾斜角只会
  // 平滑单调过渡，杜绝分段线性台阶与过冲回摆（入轨/出轨的「突然朝下」）
  const tauSpline = buildSeries(
    tauTable.map((e) => e.t),
    tauTable.map((e) => e.u),
    true
  );
  const rollSpline = buildSeries(
    us,
    rollSmooth.map((r, i) => r * THREE.MathUtils.smoothstep(us[i], 0, 0.02) * (1 - THREE.MathUtils.smoothstep(us[i], 0.98, 1))),
    true
  );

  return { curve, tauSpline, lookRanges, rollSpline, totalTau, marks };
}

/** 圈内/收尾段速度函数（单位/秒）：f 为段内进度 0→1；转移段剖面已在构建时预计算 */
function segmentSpeed(seg, f) {
  if (seg.type === "settle") {
    // 收尾漂移：按 (1-f)^1.5 减速，末速保留 2% 让镜头缓缓滑停在总揽位
    return Math.max(1e-6, seg.v0 * Math.pow(1 - f, 1.5) + seg.v0 * 0.02);
  }
  // 轨道速度：圈端部 3 倍（衔接转移段出入速度，速度单调穿过交界），
  // 渐降到中段 1 倍——正对行星的慢速凝视弧，再渐升离场
  return seg.vLap * (1 + 2 * Math.pow(Math.cos(Math.PI * f), 2));
}

/** 圆圈上的点：方位角 deg（度），半径 r，高度偏移 h（相对天体中心） */
function circlePoint(center, deg, r, h) {
  const a = THREE.MathUtils.degToRad(deg);
  return new THREE.Vector3(center.x + r * Math.cos(a), center.y + h, center.z + r * Math.sin(a));
}

/**
 * 追加一段星际转移的控制点（不含起点；终点精确落在 to 上，中点带垂直侧摆）。
 *
 * ★ 时间均匀采样：速度剖面 bell(τ) 定义在时间轴上（τ 为段内时间分数），
 *   每档耗时 = T/N，走过的距离 = bell×(T/N) 累计反推。
 *   因此每个时间片耗时精确相等——低速的出入轨段距离自动收窄，
 *   高速巡航段距离自动拉宽，任何速度下都不可能产生「停顿」。
 *
 * 剖面为非对称钟形：起点衔接离场轨道速度 dep、终点衔接到达轨道速度 arr，
 * 中段一次主燃烧；峰值近居中（τ^0.85）让起步平缓、减速段略长，出入轨都不突兀。
 */
function appendTransfer(pts, from, to, swayAmt, dep, arr, T, speeds) {
  const dir = to.clone().sub(from);
  const len = dir.length() || 1;
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x); // 水平面内垂直于航线
  const B = Math.max(0, (2 * (len - arr * T * 0.5)) / T);
  const bell = (tau) =>
    arr + (dep - arr) * (1 - tau) + B * Math.pow(Math.sin(Math.PI * Math.pow(tau, 0.85)), 2);
  const dt = T / FLY_PTS;
  // 先按未缩放剖面累计总距离，求统一缩放使总距离恰为 len（侧摆弧长差由段归一化吸收）
  let sum = 0;
  for (let i = 0; i < FLY_PTS; i++) sum += bell((i + 0.5) / FLY_PTS) * dt;
  const scale = len / sum;
  let cum = 0;
  for (let i = 0; i < FLY_PTS; i++) {
    const v = bell((i + 0.5) / FLY_PTS) * scale;
    speeds.push(v);
    cum += v * dt;
    const f = Math.min(cum / len, 1);
    const p = from.clone().lerp(to, f);
    if (i < FLY_PTS - 1) {
      p.addScaledVector(side, swayAmt * Math.sin(Math.PI * f));
    }
    pts.push(p);
  }
}

/** 均匀 t 采样弧长表上的插值：t∈[0,1] → 弧长 */
function arcAt(lengths, t) {
  const x = THREE.MathUtils.clamp(t, 0, 1) * (lengths.length - 1);
  const i = Math.floor(x);
  if (i >= lengths.length - 1) return lengths[lengths.length - 1];
  return THREE.MathUtils.lerp(lengths[i], lengths[i + 1], x - i);
}

/** 构建一维三次 Hermite 样条；monotone=true 时用 Fritsch–Carlson 限幅保证单调不超调 */
function buildSeries(xs, ys, monotone) {
  const n = xs.length;
  const m = new Array(n);
  const slopes = [];
  for (let i = 0; i < n - 1; i++) slopes.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1e-12));
  if (n === 2 || slopes.length === 1) {
    m[0] = m[n - 1] = slopes[0];
  } else {
    m[0] = slopes[0];
    m[n - 1] = slopes[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = (slopes[i - 1] + slopes[i]) / 2;
    if (monotone) {
      for (let i = 0; i < n - 1; i++) {
        if (slopes[i] === 0) { m[i] = 0; m[i + 1] = 0; }
      }
      for (let i = 0; i < n - 1; i++) {
        if (slopes[i] === 0) continue;
        const a = m[i] / slopes[i];
        const b = m[i + 1] / slopes[i];
        const s2 = a * a + b * b;
        if (s2 > 9) {
          const t2 = 3 / Math.sqrt(s2);
          m[i] = t2 * a * slopes[i];
          m[i + 1] = t2 * b * slopes[i];
        }
      }
      if (m[0] * slopes[0] <= 0) m[0] = 0;
      else if (Math.abs(m[0]) > 3 * Math.abs(slopes[0])) m[0] = 3 * slopes[0];
      if (m[n - 1] * slopes[n - 2] <= 0) m[n - 1] = 0;
      else if (Math.abs(m[n - 1]) > 3 * Math.abs(slopes[n - 2])) m[n - 1] = 3 * slopes[n - 2];
    }
  }
  return { xs, ys, m, n };
}

/** 样条求值：二分定位区间 + 三次 Hermite 插值（C¹ 连续） */
function evalSeries(sp, x) {
  const { xs, ys, m, n } = sp;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const h = xs[hi] - xs[lo] || 1e-12;
  const t = (x - xs[lo]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * ys[lo] + h10 * h * m[lo] + h01 * ys[hi] + h11 * h * m[hi];
}

/** 路径进度 u 处的视线目标：圈内锁定天体中心；转移段从离场天体平滑转向目标天体 */
function sampleLookAt(ranges, u, getPos, out) {
  for (const r of ranges) {
    if (u >= r.u0 && u <= r.u1) {
      if (r.type === "lap" || r.type === "settle") {
        return getPos(r.target, out);
      }
      // 转移段：视线在离场/目的地天体间以 smoothstep 缓慢交棒，
      // 两端零速率切入切出，避免离站/入站瞬间视线角速度突变
      const f = (u - r.u0) / (r.u1 - r.u0 || 1);
      const f2 = f * f * (3 - 2 * f);
      const a = getPos(r.from, out);
      const b = getPos(r.to, new THREE.Vector3());
      return out.copy(a).lerp(b, f2);
    }
  }
  return getPos(ranges[ranges.length - 1].target, out);
}
