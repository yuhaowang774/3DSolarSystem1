/**
 * 运镜分镜数据（一镜到底 · 飞船视角 · 永远向前）
 *
 * ★ 旅程结构：环绕太阳飞掠 → 依次以向前的飞掠弧线掠过八大行星与月球
 *   （入圈点朝向来时方向，出圈切向对准下一站方向，顺/逆时针取较短弧，
 *   镜头永远朝前推进、路线符合直觉，绝不倒飞或绕向反侧）→
 *   拉出总揽太阳系 → 继续拉出跨 8 个数量级直至银河系全貌 → 缓缓漂移收尾。
 *   全程一条样条路径 + 连续速度剖面 + 惯性跟随，无任何剪切拼接。
 *
 * 坐标体系：1 单位 = 1 万公里（与场景一致）
 * 天体半径 R：太阳 69.6 / 水 0.244 / 金 0.6052 / 地 0.6371 / 月 0.1737 /
 *             火 0.339 / 木 6.9911 / 土 5.8232(环 7~13) / 天 2.5362 / 海 2.4622
 *
 * 字段说明：
 *   rIn/rOut  环绕弧入口/出口半径（相对天体中心）
 *   hIn/hOut  环绕弧入口/出口高度偏移（相对天体中心 y）
 *   lapTime   该段环绕弧耗时（秒）
 *   flyTime   从上一站飞抵本站的转移耗时（秒）
 *   overview  终章第一段拉出：太阳系总揽位（相对太阳偏移）与耗时
 *   galaxy    终章第二段拉出：银河系全貌位（相对太阳偏移）与耗时
 */
export const TOUR = {
  laps: [
    { target: "sun", rIn: 300, rOut: 190, hIn: 40, hOut: 30, lapTime: 8 },
    { target: "mercury", rIn: 1.05, rOut: 0.62, hIn: 0.22, hOut: 0.06, lapTime: 6, flyTime: 12 },
    { target: "venus", rIn: 2.1, rOut: 1.35, hIn: 0.5, hOut: 0.1, lapTime: 6, flyTime: 12 },
    { target: "earth", rIn: 3.1, rOut: 1.9, hIn: 0.6, hOut: 0.1, lapTime: 7, flyTime: 12 },
    { target: "moon", rIn: 0.75, rOut: 0.42, hIn: 0.14, hOut: 0.04, lapTime: 5, flyTime: 10 },
    { target: "mars", rIn: 1.35, rOut: 0.85, hIn: 0.45, hOut: 0.08, lapTime: 6, flyTime: 12 },
    { target: "jupiter", rIn: 28, rOut: 17, hIn: 7, hOut: 1.2, lapTime: 8, flyTime: 13 },
    { target: "saturn", rIn: 24, rOut: 15, hIn: 3.5, hOut: 0.5, lapTime: 8, flyTime: 13 },
    { target: "uranus", rIn: 10.5, rOut: 6, hIn: 1.2, hOut: -0.6, lapTime: 6, flyTime: 13 },
    { target: "neptune", rIn: 9.5, rOut: 5, hIn: 2.5, hOut: 0.3, lapTime: 6, flyTime: 12 },
  ],
  // 太阳系总揽位：|offset|≈2.6e6 时海王星轨道角半径≈10°，八大轨道尽收眼底
  overview: { target: "sun", offset: { x: 1.5e6, y: 1.0e6, z: 2.1e6 }, flyTime: 20 },
  // 银河系全貌位：|offset|≈1e14，90° 视场恰好容纳银河照片全盘（1.23e14）
  galaxy: { target: "sun", offset: { x: 5.5e13, y: 4.0e13, z: 7.3e13 }, flyTime: 16, settleTime: 10, arcDeg: 18 },
};
