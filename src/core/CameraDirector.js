import * as THREE from "three";
import gsap from "gsap";

/**
 * 相机运镜播放器（GSAP timeline 驱动）
 *
 * 三种镜头模式（见 shots.js）：
 *   camFrom/lookFrom + camTo/lookTo   直线飞行（坐标为相对 target 的偏移；无 target 时相对原点）
 *   orbit                             球面环绕（radius/angle/height 相对 target 中心，每帧跟随天体运动）
 *   curve                             CatmullRom 曲线穿越（关键帧为相对 target 的偏移）
 *
 * 与渲染循环的约定：
 *   - GSAP onUpdate 直接写 camera.position / camera.fov
 *   - camera.lookAt 在渲染循环里通过 applyLookAt() 调用（避免与 lookAt tween 的时序竞争）
 *   - 播放期间宿主需自行禁用 OrbitControls 与相机跟随逻辑（互斥开关）
 */
export class CameraDirector {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {(name: string, out: THREE.Vector3) => THREE.Vector3} getTargetWorldPos
   *        按名称返回天体世界坐标（写入 out 并返回），每帧动态查询以跟随行星公转
   */
  constructor(camera, getTargetWorldPos) {
    this.camera = camera;
    this.getTargetWorldPos = getTargetWorldPos;
    this.timeline = null;
    this.isPlaying = false;
    this.onComplete = null; // 播放自然结束时的回调（跳过时不触发）

    this._lookAtProxy = new THREE.Vector3();
    this._tmpCenter = new THREE.Vector3();
    this._tmpOther = new THREE.Vector3();
    this._roll = 0; // 当前帧滚转角（rad），飞行段中段最大、首尾归零
  }

  /** 播放分镜脚本（顺序执行全部镜头） */
  play(shots) {
    this.stop();
    this._shots = shots;
    this.isPlaying = true;

    this.timeline = gsap.timeline({
      onComplete: () => {
        this.isPlaying = false;
        if (this.onComplete) this.onComplete();
      },
    });

    shots.forEach((shot) => {
      const dur = shot.duration;
      const ease = shot.ease ?? "power2.inOut";
      const hasTarget = !!shot.target;

      // ── 模式 1：直线飞行（camFrom/lookFrom → camTo/lookTo，相对偏移） ──
      if (shot.camFrom) {
        const cam = { x: shot.camFrom.x, y: shot.camFrom.y, z: shot.camFrom.z };
        const look = {
          x: shot.lookFrom?.x ?? 0,
          y: shot.lookFrom?.y ?? 0,
          z: shot.lookFrom?.z ?? 0,
        };

        tl_to(this.timeline, cam, shot.camTo, dur, ease, () => {
          const c = this._resolveCenter(shot.target);
          this.camera.position.set(c.x + cam.x, c.y + cam.y, c.z + cam.z);
        });

        tl_to(
          this.timeline,
          look,
          shot.lookTo ?? { x: 0, y: 0, z: 0 },
          dur,
          ease,
          () => {
            const c = this._resolveCenter(shot.target);
            this._lookAtProxy.set(c.x + look.x, c.y + look.y, c.z + look.z);
          },
          "<"
        );

        if (shot.fovTo !== undefined) {
          const fov = { value: shot.fovFrom ?? this.camera.fov };
          tl_to(
            this.timeline,
            fov,
            { value: shot.fovTo },
            dur,
            ease,
            () => {
              this.camera.fov = fov.value;
              this.camera.updateProjectionMatrix();
            },
            "<"
          );
        }
      }

      // ── 模式 2：球面环绕（跟随天体中心，每帧查询世界坐标） ──
      if (shot.orbit) {
        const o = shot.orbit;
        const st = { r: o.radiusFrom, a: o.angleFrom, h: o.height ?? 0 };
        // lookBlend：lookAt 从镜头主体向另一天体插值（地月同框等构图）
        const blend = shot.lookBlend
          ? {
              other: shot.lookBlend.to,
              mixTo: shot.lookBlend.mixTo ?? 1,
              v: shot.lookBlend.mixFrom ?? 0,
            }
          : null;
        if (blend) {
          tl_to(this.timeline, blend, { v: blend.mixTo }, dur, ease, null, ">");
        }
        if (o.fovTo !== undefined) {
          const fov = { value: o.fovFrom ?? this.camera.fov };
          tl_to(
            this.timeline,
            fov,
            { value: o.fovTo },
            dur,
            ease,
            () => {
              this.camera.fov = fov.value;
              this.camera.updateProjectionMatrix();
            },
            "<"
          );
        }
        tl_to(
          this.timeline,
          st,
          {
            r: o.radiusTo ?? o.radiusFrom,
            a: o.angleTo ?? o.angleFrom,
            h: o.heightTo ?? st.h,
          },
          dur,
          ease,
          () => {
            const center = this._resolveCenter(shot.target);
            // faceSun：角度以「天体背离太阳的方向」为 0° 基准（太阳位于原点）
            const base = o.faceSun
              ? Math.atan2(center.z, center.x)
              : 0;
            const rad = base + THREE.MathUtils.degToRad(st.a);
            this.camera.position.set(
              center.x + st.r * Math.cos(rad),
              center.y + st.h,
              center.z + st.r * Math.sin(rad)
            );
            if (blend) {
              const other = this.getTargetWorldPos(blend.other, this._tmpOther);
              this._lookAtProxy.copy(center).lerp(other, blend.v);
            } else {
              this._lookAtProxy.copy(center);
            }
          }
        );
      }

      // ── 模式 4：行星间连续飞行（双动点插值 + 弧线侧摆 + 滚转） ──
      // 从「上一行星 + 起始偏移」平滑飞向「下一行星 + 到达偏移」，
      // 两颗行星公转时镜头天然跟随；视线从回望上一行星渐转到望向下一行星。
      // sway：垂直于航线的侧摆弧线（默认自动 = 航线长度 × 4%），
      // roll：航程中段的滚转倾斜角（默认 8°）——二者共同制造飞掠运动感
      if (shot.flyTo) {
        const f = shot.flyTo.from;
        const tt = shot.flyTo.to;
        const swayCfg = shot.flyTo.sway;
        const rollDeg = shot.flyTo.roll ?? 8;
        // k 的三轴由 GSAP 施加同一 ease，作为双锚点插值系数；r 驱动滚转包络
        const k = { x: 0, y: 0, z: 0, r: 0 };
        tl_to(this.timeline, k, { x: 1, y: 1, z: 1, r: 1 }, dur, ease, () => {
          const a = this._resolveCenter(f.target);
          const b = this._resolveCenter(tt.target);
          // 锚点（随行星公转实时变化）
          const ax = a.x + f.offset.x;
          const ay = a.y + f.offset.y;
          const az = a.z + f.offset.z;
          const bx = b.x + tt.offset.x;
          const by = b.y + tt.offset.y;
          const bz = b.z + tt.offset.z;
          const mixv = (va, vb) => va + (vb - va) * k.x;

          // 弧线侧摆：水平面内垂直于航线的正弦弧（起点/终点为 0，中段最大）
          const abx = bx - ax;
          const abz = bz - az;
          const len = Math.hypot(abx, abz) || 1;
          const swayAmt =
            (typeof swayCfg === "number"
              ? swayCfg
              : Math.hypot(abx, by - ay, abz) * 0.04) *
            Math.sin(Math.PI * k.x);
          const sx = -abz / len;
          const sz = abx / len;

          this.camera.position.set(
            mixv(ax, bx) + sx * swayAmt,
            mixv(ay, by),
            mixv(az, bz) + sz * swayAmt
          );

          const la = f.look ?? { x: 0, y: 0, z: 0 };
          const lb = tt.look ?? { x: 0, y: 0, z: 0 };
          this._lookAtProxy.set(
            mixv(a.x + la.x, b.x + lb.x) + sx * swayAmt * 0.3,
            mixv(a.y + la.y, b.y + lb.y),
            mixv(a.z + la.z, b.z + lb.z) + sz * swayAmt * 0.3
          );

          // 滚转包络（applyLookAt 中作用于视线轴）
          this._roll = rollDeg * (Math.PI / 180) * Math.sin(Math.PI * k.x);
        });
        if (shot.flyTo.fovTo !== undefined) {
          const fov = {
            value: shot.flyTo.fovFrom ?? this.camera.fov,
          };
          tl_to(
            this.timeline,
            fov,
            { value: shot.flyTo.fovTo },
            dur,
            ease,
            () => {
              this.camera.fov = fov.value;
              this.camera.updateProjectionMatrix();
            },
            "<"
          );
        }
      }

      // ── 模式 3：CatmullRom 曲线穿越（关键帧为相对 target 的偏移） ──
      if (shot.curve) {
        const localPts = shot.curve.points.map(
          (p) => new THREE.Vector3(p.x, p.y, p.z)
        );
        const curve = new THREE.CatmullRomCurve3(localPts, false, "catmullrom", 0.5);
        const st = { t: 0 };
        tl_to(this.timeline, st, { t: 1 }, dur, ease, () => {
          const center = this._resolveCenter(shot.target);
          curve.getPoint(st.t, this.camera.position);
          this.camera.position.add(center);
          this._lookAtProxy.copy(center);
        });
      }
    });

    return this;
  }

  /** 解析镜头参照中心：无 target 时为原点，否则实时查询天体世界坐标 */
  _resolveCenter(targetName) {
    if (!targetName) return this._tmpCenter.set(0, 0, 0);
    return this.getTargetWorldPos(targetName, this._tmpCenter);
  }

  /** 渲染循环内每帧调用：运镜期间接管视线（含飞行段的滚转倾斜） */
  applyLookAt() {
    if (this.isPlaying) {
      this.camera.lookAt(this._lookAtProxy);
      if (this._roll) {
        this.camera.rotateZ(this._roll);
      }
    }
  }

  /** 跳转到指定镜头（供「跳过」或章节选择使用） */
  seekTo(shotId) {
    if (!this._shots || !this.timeline) return;
    const idx = this._shots.findIndex((s) => s.id === shotId);
    if (idx >= 0) {
      const t = this._shots
        .slice(0, idx)
        .reduce((acc, s) => acc + s.duration, 0);
      this.timeline.seek(t);
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

/** 便捷封装：向 timeline 追加一个「数值代理 → 目标值」tween */
function tl_to(tl, proxy, toVars, duration, ease, onUpdate, position = ">") {
  tl.to(
    proxy,
    {
      ...toVars,
      duration,
      ease,
      onUpdate,
    },
    position
  );
}
