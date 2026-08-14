// 纹理优化脚本：将 public/assets 下纹理转为 webp 并压缩，降低分辨率
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.resolve(__dirname, "../public/assets");

// 各纹理目标最大边（px），星空/地球可稍大，其余行星贴图 2048 足够
const MAX_EDGE = {
  "stars.jpg": 2048,
  "earth.jpg": 2048,
  "sun.jpg": 1024,
  "venus.jpg": 1024,
  "mercury.jpg": 1024,
  "mars.jpg": 1024,
  "jupiter.jpg": 1536,
  "saturn.jpg": 1536,
  "uranus.jpg": 1024,
  "neptune.jpg": 1024,
  "moon.jpg": 1024,
  "sun-glow.png": 1024,
  "saturnRing.png": 2048,
  "uranusRing.png": 2048,
  "neptuneRing.png": 2048,
};

// 需要删除的无用文件
const UNUSED = ["earth_normal_map.png", "earth_specular_map.png"];

const JPG_QUALITY = 82;
const PNG_QUALITY = 90;

async function processFile(file) {
  const src = path.join(ASSET_DIR, file);
  if (!fs.existsSync(src)) return;
  const isJpg = file.toLowerCase().endsWith(".jpg");
  const base = path.basename(file, path.extname(file));
  const out = path.join(ASSET_DIR, base + ".webp");
  const maxEdge = MAX_EDGE[file] || 2048;

  const img = sharp(src, { limitInputPixels: false });
  const meta = await img.metadata();
  const resizeOpt = meta.width > maxEdge || meta.height > maxEdge
    ? { width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }
    : undefined;

  if (isJpg) {
    await img.resize(resizeOpt).webp({ quality: JPG_QUALITY }).toFile(out);
  } else {
    await img.resize(resizeOpt).webp({ quality: PNG_QUALITY, lossless: false }).toFile(out);
  }

  const before = fs.statSync(src).size;
  const after = fs.statSync(out).size;
  console.log(
    `${file.padEnd(22)} ${(before / 1024).toFixed(0)}KB -> ${path.basename(out).padEnd(20)} ${(after / 1024).toFixed(0)}KB  (${((1 - after / before) * 100).toFixed(0)}% smaller)`
  );
}

async function main() {
  const files = Object.keys(MAX_EDGE);
  for (const f of files) await processFile(f);

  // 删除原文件与无用文件
  for (const f of files) {
    const p = path.join(ASSET_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  for (const f of UNUSED) {
    const p = path.join(ASSET_DIR, f);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`removed unused: ${f}`);
    }
  }
  console.log("\nDone. All textures converted to WebP.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
