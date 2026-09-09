/**
 * 运镜分镜脚本（纯数据，由 CameraDirector 播放）
 *
 * ★ 连续单程旅程：太阳出发 → 依次飞掠八大行星与月球 → 拉出看银河全貌
 *   全程无切换：每段飞行（flyTo）的起点精确等于上一段的终点，相机始终平滑移动。
 *
 * 坐标体系：1 单位 = 1 万公里（与场景一致）
 * 天体半径 R：太阳 69.6 / 水 0.244 / 金 0.6052 / 地 0.6371 / 月 0.1737 /
 *             火 0.339 / 木 6.9911 / 土 5.8232(环 7~13) / 天 2.5362 / 海 2.4622
 * 轨道半长轴：水 5790 / 金 10820 / 地 14960 / 火 22800 / 木 77800 /
 *             土 143300 / 天 287300 / 海 450300（单位同上）
 *
 * 连续性规则：orbit 段的「起始偏移」必须等于上一段的「终点偏移」；
 * 各 orbit 的到达偏移 = (r·cos a1, h1, r·sin a1)，飞行段据此精确衔接。
 *
 * flyTo 模式（行星间飞行）：双动点插值——
 *   from: { target, offset, look } → to: { target, offset, look }，
 *   两颗行星公转时镜头天然跟随，视线从回望上一行星渐转到望向下一行星。
 */
export const SHOTS = [
  // ── 出发：太阳环绕半圈（R=69.6，r 300≈4.3R → 170≈2.4R） ──
  // 末点偏移 = (170·cos30°, 40, 170·sin30°) = (147.2, 40, 85)
  {
    id: "sun_open",
    duration: 8,
    target: "sun",
    orbit: {
      radiusFrom: 300,
      radiusTo: 170,
      angleFrom: -30,
      angleTo: 30,
      height: 40,
    },
    ease: "power1.inOut",
  },

  // ── 飞向水星（0 附近 → 水星轨道 5790） ──
  {
    id: "fly_mercury",
    duration: 6,
    flyTo: {
      from: {
        target: "sun",
        offset: { x: 147.2, y: 40, z: 85 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "mercury",
        offset: { x: 1.03, y: 0.25, z: 0.38 }, // = 1.1R·(cos20°,·,sin20°)
        look: { x: 0, y: 0, z: 0 },
      },
    },
    ease: "power2.inOut",
  },

  // ── 水星环绕（R=0.244，r 1.1≈4.5R → 0.6≈2.5R） ──
  // 末点偏移 = (0.6·cos120°, 0.25, 0.6·sin120°) = (-0.3, 0.25, 0.52)
  {
    id: "mercury_orbit",
    duration: 5,
    target: "mercury",
    orbit: {
      radiusFrom: 1.1,
      radiusTo: 0.6,
      angleFrom: 20,
      angleTo: 120,
      height: 0.25,
    },
    ease: "sine.inOut",
  },

  // ── 飞向金星（5790 → 10820） ──
  {
    id: "fly_venus",
    duration: 6,
    flyTo: {
      from: {
        target: "mercury",
        offset: { x: -0.3, y: 0.25, z: 0.52 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "venus",
        offset: { x: 1.69, y: 0.4, z: -1.41 }, // = 2.2R·(cos-40°,·,sin-40°)
        look: { x: 0, y: 0, z: 0 },
      },
    },
    ease: "power2.inOut",
  },

  // ── 金星环绕（R=0.6052，r 2.2≈3.6R → 1.3≈2.1R） ──
  // 末点偏移 = (1.3·cos60°, 0.4, 1.3·sin60°) = (0.65, 0.4, 1.13)
  {
    id: "venus_orbit",
    duration: 5,
    target: "venus",
    orbit: {
      radiusFrom: 2.2,
      radiusTo: 1.3,
      angleFrom: -40,
      angleTo: 60,
      height: 0.4,
    },
    ease: "sine.inOut",
  },

  // ── 飞向地球（10820 → 14960） ──
  {
    id: "fly_earth",
    duration: 6,
    flyTo: {
      from: {
        target: "venus",
        offset: { x: 0.65, y: 0.4, z: 1.13 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "earth",
        offset: { x: 3.2, y: 0.7, z: 2.2 }, // ≈5R
        look: { x: 0, y: 0, z: 0 },
      },
    },
    ease: "power2.inOut",
  },

  // ── 地球推近（R=0.6371：5R → 2.9R） ──
  // 末点偏移 = (1.6, 0.25, 1.1)
  {
    id: "earth_push",
    duration: 5,
    target: "earth",
    camFrom: { x: 3.2, y: 0.7, z: 2.2 },
    camTo: { x: 1.6, y: 0.25, z: 1.1 },
    lookFrom: { x: 0, y: 0, z: 0 },
    lookTo: { x: 0, y: 0, z: 0 },
    ease: "power2.inOut",
  },

  // ── 地球环绕扫过晨昏线（r 1.95≈3R → 2.6≈4R，起始点与上段末点连续：
  //    1.95·(cos34.5°,·,sin34.5°) ≈ (1.6, ·, 1.1)） ──
  // 末点偏移 = (2.6·cos110°, 0.3, 2.6·sin110°) = (-0.89, 0.3, 2.44)
  {
    id: "earth_sweep",
    duration: 5,
    target: "earth",
    orbit: {
      radiusFrom: 1.95,
      radiusTo: 2.6,
      angleFrom: 34.5,
      angleTo: 110,
      height: 0.3,
    },
    ease: "sine.inOut",
  },

  // ── 飞向月球（地月距 384） ──
  {
    id: "fly_moon",
    duration: 5,
    flyTo: {
      from: {
        target: "earth",
        offset: { x: -0.89, y: 0.3, z: 2.44 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "moon",
        offset: { x: 0.79, y: 0.15, z: 0.14 }, // = 0.8R·(cos10°,·,sin10°)
        look: { x: 0, y: 0, z: 0 },
      },
    },
    ease: "power2.inOut",
  },

  // ── 月球特写（R=0.1737，r 0.8≈4.6R → 0.45≈2.6R） ──
  // 末点偏移 = (0.45·cos100°, 0.15, 0.45·sin100°) = (-0.078, 0.15, 0.443)
  {
    id: "moon_close",
    duration: 4,
    target: "moon",
    orbit: {
      radiusFrom: 0.8,
      radiusTo: 0.45,
      angleFrom: 10,
      angleTo: 100,
      height: 0.15,
    },
    ease: "sine.inOut",
  },

  // ── 地月同框：退至 60 单位，lookAt 渐移向地球（384 外的蓝色弹珠） ──
  // 末点偏移 = (60·cos140°, 10, 60·sin140°) = (-46, 10, 38.6)
  {
    id: "moon_earth",
    duration: 4,
    target: "moon",
    orbit: {
      radiusFrom: 0.45,
      radiusTo: 60,
      angleFrom: 100,
      angleTo: 140,
      height: 10,
      heightTo: 10,
    },
    lookBlend: { to: "earth", mixFrom: 0.2, mixTo: 0.9 },
    ease: "power1.inOut",
  },

  // ── 飞向火星（地球邻域 → 火星轨道 22800） ──
  {
    id: "fly_mars",
    duration: 6,
    flyTo: {
      from: {
        target: "moon",
        offset: { x: -46, y: 10, z: 38.6 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "mars",
        offset: { x: -2.2, y: 1.8, z: 2.2 }, // ≈10.6R
        look: { x: 0, y: 0, z: 0 },
      },
    },
    ease: "power2.inOut",
  },

  // ── 火星掠过（R=0.339：俯冲至 2.5R） ──
  // 末点偏移 = (0.6, 0.2, -0.5)
  {
    id: "mars_dive",
    duration: 5,
    target: "mars",
    camFrom: { x: -2.2, y: 1.8, z: 2.2 },
    camTo: { x: 0.6, y: 0.2, z: -0.5 },
    lookFrom: { x: 0, y: 0, z: 0 },
    lookTo: { x: 0, y: 0.05, z: 0 },
    ease: "power2.in",
  },

  // ── 飞向木星（火星轨道 22800 → 木星轨道 77800，长飞行） ──
  {
    id: "fly_jupiter",
    duration: 8,
    flyTo: {
      from: {
        target: "mars",
        offset: { x: 0.6, y: 0.2, z: -0.5 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "jupiter",
        offset: { x: 16, y: 6, z: -27.7 }, // = 32R·(cos-60°,·,sin-60°)
        look: { x: 0, y: 0, z: 0 },
      },
    },
    ease: "power2.inOut",
  },

  // ── 木星环绕压场（R=6.9911，r 32≈4.6R → 18≈2.6R，FOV 收缩） ──
  // 末点偏移 = (18·cos20°, 6, 18·sin20°) = (16.9, 6, 6.16)
  {
    id: "jupiter_orbit",
    duration: 7,
    target: "jupiter",
    orbit: {
      radiusFrom: 32,
      radiusTo: 18,
      angleFrom: -60,
      angleTo: 20,
      height: 6,
      fovFrom: 50,
      fovTo: 40,
    },
    ease: "power2.inOut",
  },

  // ── 飞向土星（77800 → 143300） ──
  {
    id: "fly_saturn",
    duration: 8,
    flyTo: {
      from: {
        target: "jupiter",
        offset: { x: 16.9, y: 6, z: 6.16 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "saturn",
        offset: { x: -14, y: 1.5, z: 4 }, // 环缝穿越路径起点
        look: { x: 0, y: 0, z: 0 },
      },
    },
    ease: "power2.inOut",
  },

  // ── 土星环缝穿越（R=5.8232，环带 7~13）：贴环面飞入、贴近行星、扬起穿出 ──
  // 末点偏移 = (12, 1.2, 5)
  {
    id: "saturn_ring_dive",
    duration: 8,
    target: "saturn",
    curve: {
      points: [
        { x: -14, y: 1.5, z: 4 },
        { x: -8, y: 0.4, z: 2 },
        { x: -2, y: 0.25, z: 0.6 },
        { x: 5, y: 0.3, z: 2 },
        { x: 12, y: 1.2, z: 5 },
      ],
    },
    ease: "sine.inOut",
  },

  // ── 飞向天王星（143300 → 287300） ──
  {
    id: "fly_uranus",
    duration: 8,
    flyTo: {
      from: {
        target: "saturn",
        offset: { x: 12, y: 1.2, z: 5 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "uranus",
        offset: { x: -5.5, y: 7, z: 3 }, // ≈4.3R
        look: { x: 0, y: 0, z: 0 },
      },
    },
    ease: "power2.inOut",
  },

  // ── 天王星侧向摇镜（R=2.5362：体现 98° 轴倾角，相机大幅下摇） ──
  // 末点偏移 = (5.5, -3.5, 3)
  {
    id: "uranus_tilt",
    duration: 5,
    target: "uranus",
    camFrom: { x: -5.5, y: 7, z: 3 },
    camTo: { x: 5.5, y: -3.5, z: 3 },
    lookFrom: { x: 0, y: 0, z: 0 },
    lookTo: { x: 0, y: 0, z: 0 },
    ease: "sine.inOut",
  },

  // ── 飞向海王星（287300 → 450300） ──
  {
    id: "fly_neptune",
    duration: 7,
    flyTo: {
      from: {
        target: "uranus",
        offset: { x: 5.5, y: -3.5, z: 3 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "neptune",
        offset: { x: 16, y: 3.5, z: 12 }, // ≈6.5R
        look: { x: 0, y: 0, z: 0 },
      },
    },
    ease: "power2.inOut",
  },

  // ── 海王星推近（R=2.4622：8R → 1.6R） ──
  // 末点偏移 = (4, 0.8, 3)
  {
    id: "neptune_approach",
    duration: 5,
    target: "neptune",
    camFrom: { x: 16, y: 3.5, z: 12 },
    camTo: { x: 4, y: 0.8, z: 3 },
    lookFrom: { x: 0, y: 0, z: 0 },
    lookTo: { x: 0, y: 0.15, z: 0 },
    ease: "power2.out",
  },

  // ── 回程拉出：从海王星一路飞回太阳邻域（450300 → 4.5e4） ──
  {
    id: "pull_back_sun",
    duration: 6,
    flyTo: {
      from: {
        target: "neptune",
        offset: { x: 4, y: 0.8, z: 3 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "sun",
        offset: { x: 2.4e4, y: 1.6e4, z: 3.4e4 },
        look: { x: 0, y: 0, z: 0 },
      },
    },
    ease: "power2.in",
  },

  // ── 银河拉出 I：太阳邻域 → 行星轨道全景（4.5e4 → 2e6） ──
  {
    id: "pull_galaxy_1",
    duration: 5,
    flyTo: {
      from: {
        target: "sun",
        offset: { x: 2.4e4, y: 1.6e4, z: 3.4e4 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "sun",
        offset: { x: 1.1e6, y: 7.5e5, z: 1.55e6 },
        look: { x: 0, y: 0, z: 0 },
      },
    },
    ease: "sine.inOut",
  },

  // ── 银河拉出 II：行星轨道全景 → 银河系全貌（2e6 → 1.2e14，跨 8 个数量级） ──
  // 终点距原点 ≈1.1e14，90° 视场恰好容纳银河照片全盘（1.23e14）
  {
    id: "pull_galaxy_2",
    duration: 9,
    flyTo: {
      from: {
        target: "sun",
        offset: { x: 1.1e6, y: 7.5e5, z: 1.55e6 },
        look: { x: 0, y: 0, z: 0 },
      },
      to: {
        target: "sun",
        offset: { x: 5.5e13, y: 4.0e13, z: 7.3e13 },
        look: { x: 0, y: 0, z: 0 },
      },
      fovFrom: 60,
      fovTo: 55,
    },
    ease: "power3.inOut",
  },

  // ── 尾声：银河全貌缓慢漂移收尾 ──
  {
    id: "galaxy_admire",
    duration: 8,
    target: "sun",
    orbit: {
      radiusFrom: 1.1e14,
      radiusTo: 1.05e14,
      angleFrom: 0,
      angleTo: 12,
      height: 4.0e13,
    },
    ease: "sine.inOut",
  },
];
