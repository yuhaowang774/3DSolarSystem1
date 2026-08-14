# 3D Solar System · 星穹漫游

基于 **Vue 3 + Vite + Three.js** 构建的 3D 交互式太阳系模拟与天文科普平台，采用 **SpaceX 任务控制台**视觉风格，部署于 **Cloudflare Pages**。

> 精确天文计算 · 实时时间同步 · 时间穿越 · 天体科普 · 日下点校准法

---

## ✨ 功能特性

- **精确天文计算**：基于 J2000.0 历元轨道六要素与开普勒方程求解，实时计算八大行星与月球的真实轨道位置。
- **日下点差量校准法**（核心创新）：独创地球日照同步算法，使模型地球的昼夜分界线与现实 UTC 时间完全对应。
- **时间控制系统**：支持实时同步、时间倒流/静止/前进（57 档位，秒级 → 年级）、播放/暂停。
- **天体信息面板**：点击任意天体查看物理参数、轨道数据、神话背景、探测历史等科普信息。
- **搜索导航**：中英文检索天体，平滑飞行聚焦。
- **标签遮挡检测**：射线检测实现标签被天体遮挡时自动淡出。
- **视距剔除**：按相机距离自动隐藏远处天体，保证流畅渲染。
- **响应式交互**：鼠标 + 触屏双模式，适配移动端。

## 🛰️ 技术栈

| 技术 | 版本 | 用途 |
| --- | --- | --- |
| Vue | ^3.5 | 组件化 UI 层 |
| Vite | ^6.0 | 构建工具 / 开发服务器 |
| Three.js | ^0.170 | 3D 渲染引擎 |
| CSS2DRenderer | 原生 | 天体标签（HTML 叠加层） |
| Cloudflare Pages | — | 静态站点托管 / CDN |
| Wrangler | ^3.99 | Cloudflare CLI 部署 |

## 📁 目录结构

```
3DSolarSystem1/
├── index.html                  # Vite 入口
├── vite.config.js              # Vite 配置
├── wrangler.toml               # Cloudflare Pages 配置
├── public/
│   └── assets/                 # 纹理资源（行星、光环、星空），构建时原样拷贝
└── src/
    ├── main.js                 # Vue 应用入口
    ├── App.vue                 # 根组件（组合各 UI 层 + 3D 场景）
    ├── core/
    │   └── SolarSystem.js       # Three.js 场景核心（天体/轨道/标签/动画循环）
    ├── components/
    │   ├── SolarScene.vue        # 挂载 SolarSystem 类的画布容器
    │   ├── TopBar.vue            # 顶部品牌栏 + UTC 任务时钟
    │   ├── SearchBar.vue         # 天体搜索导航
    │   ├── TimeController.vue    # 时间控制滑块
    │   ├── InfoPanel.vue         # 天体科普信息面板
    │   └── LoadingOverlay.vue    # SpaceX 风格加载遮罩
    ├── composables/
    │   └── useTimeController.js  # 时间控制逻辑（状态 + 时间步长计算）
    ├── store/
    │   └── useStore.js          # 响应式共享状态（Vue ↔ Three.js 通信桥梁）
    ├── styles/
    │   └── global.css           # SpaceX 风格设计系统（CSS 变量 / 字体 / 通用排版）
    └── js/
        ├── utils.js             # 天文计算与天体创建工具（保留自原项目）
        └── dats.js              # 天体数据配置（保留自原项目）
```

## 🚀 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器（热更新，默认 http://localhost:5173）
npm run dev

# 生产构建（输出到 dist/）
npm run build

# 本地预览构建产物
npm run preview
```

## ☁️ 部署到 Cloudflare Pages

### 方式一：Git 集成（推荐，自动 CI/CD）

1. 将代码推送到 GitHub 仓库（本项目远程：`https://github.com/yuhaowang774/3DSolarSystem1`）。
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
3. 选择仓库，构建设置如下：
   - **Framework preset**：`Vite`
   - **Build command**：`npm run build`
   - **Build output directory**：`dist`
4. 点击 **Save and Deploy**。之后每次 `git push` 自动重新部署。

### 方式二：Wrangler CLI 直接部署

```bash
npm install -g wrangler
wrangler login          # 浏览器授权
npm run build           # 生成 dist/
npm run deploy          # = build + wrangler pages deploy dist
```

> 本项目 `wrangler.toml` 已配置 `pages_build_output_dir = "dist"`。

## 🎮 操作指南

| 操作 | 鼠标 | 触屏 |
| --- | --- | --- |
| 旋转视角 | 左键拖动 | 单指拖动 |
| 缩放 | 滚轮 | 双指捏合 |
| 平移 | 中键拖动 | 双指拖动 |
| 聚焦天体 | 点击天体标签 | 点击天体标签 |
| 查看信息 | 点击标签展开信息面板 | 同左 |

底部中央为时间控制器，可展开完整面板，通过滑块或按钮调节时间流速与方向。

## 🔭 核心算法

### 日下点差量校准法

位于 `src/js/utils.js`。通过比较地球模型的当前日下点经度与真实日下点经度，计算校准旋转角度，使 3D 模型的昼夜状态与现实地球完全同步。详见 [日下点校准法使用说明.md](./日下点校准法使用说明.md)。

### 轨道位置计算

基于 J2000.0 历元的轨道六要素（半长轴、偏心率、倾角、平黄经、近日点黄经、升交点黄经），解开普勒方程求偏近点角，再转换到天球赤道坐标系，并支持每世纪长期变化率。

## 📄 许可证

本项目用于教育与科普目的。

## 🙏 致谢

参考 [3D-Solar-System-Model](https://github.com/LinkZY3471/3D-Solar-System-Model) 的部分实现进行改写。
