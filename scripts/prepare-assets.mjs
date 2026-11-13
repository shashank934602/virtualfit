#!/usr/bin/env node
/**
 * Turns the images you generate in Google Flow into site-ready assets.
 *
 *   assets-src/<category>/product-<n>.(png|jpg|jpeg|webp)   n = 1..5
 *   assets-src/<category>/fit-<n>.(png|jpg|jpeg|webp)       optional try-on photo
 *
 * For each image it:
 *   1. removes the flat background (green screen works best; white also works)
 *   2. trims to the subject
 *   3. products → square 900×900 webp; fits → 786×2040 webp framed like the Tops model
 *   4. measures the garment's brightness (used by the colour picker)
 * and writes public/vf/<category>/… plus app/vf-assets.json, which the site reads.
 *
 * Run:  npm run assets
 */
import { readdir, mkdir, writeFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "assets-src");
const OUT = path.join(ROOT, "public", "vf");
const MANIFEST = path.join(ROOT, "app", "vf-assets.json");
const CATEGORIES = ["bottoms", "outerwear", "shoes", "accessories"];
const EXT = /\.(png|jpe?g|webp)$/i;

const FIT_W = 786; // 524 × 1.5  (same aspect as the Tops model crop)
const FIT_H = 2040; // 1360 × 1.5
const FIT_TOP = 0.025; // head-top margin, matches the Tops model

/* ── background removal ── */
async function cutout(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (x, y) => (y * w + x) * 4;

  // Already transparent? Keep it.
  const cornerAlpha = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)].map((i) => data[i + 3]);
  if (cornerAlpha.every((a) => a < 250)) return { data, w, h };

  // Background colour = median of the border pixels.
  const border = [];
  for (let x = 0; x < w; x += 2) border.push(px(x, 0), px(x, h - 1));
  for (let y = 0; y < h; y += 2) border.push(px(0, y), px(w - 1, y));
  const med = (c) => border.map((i) => data[i + c]).sort((a, b) => a - b)[border.length >> 1];
  const bg = [med(0), med(1), med(2)];
  const green = bg[1] > bg[0] + 40 && bg[1] > bg[2] + 40;

  if (green) {
    // Chroma key: transparency from "greenness" (g − max(r, b)), then un-mix
    // the green out of edge pixels so hair and fingertips keep their colour.
    const bgG = (bg[1] - Math.max(bg[0], bg[2])) * 0.85;
    for (let i = 0; i < data.length; i += 4) {
      const gr = data[i + 1] - Math.max(data[i], data[i + 2]);
      const a = Math.max(0, Math.min(1, 1 - gr / bgG));
      if (a < 0.04) {
        data[i + 3] = 0;
        continue;
      }
      if (a < 1) for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, (data[i + c] - (1 - a) * bg[c]) / a));
      if (data[i + 1] > Math.max(data[i], data[i + 2])) data[i + 1] = Math.max(data[i], data[i + 2]); // despill
      data[i + 3] = Math.round(a * data[i + 3]);
    }
    return { data, w, h };
  }

  // Other flat backgrounds (e.g. white): key by colour distance.
  const dist = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
  const T0 = 18; // fully background below this distance
  const T1 = 46; // fully subject above this distance

  // Flood-fill from the border through background-like pixels, so colours
  // inside the subject that happen to match the background are kept.
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const k = y * w + x;
    if (seen[k] || dist(k * 4) >= T1) return;
    seen[k] = 1;
    stack.push(k);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const k = stack.pop();
    const x = k % w, y = (k / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }

  for (let k = 0; k < w * h; k++) {
    const i = k * 4;
    if (seen[k]) {
      const a = Math.max(0, Math.min(1, (dist(i) - T0) / (T1 - T0)));
      data[i + 3] = Math.round(a * data[i + 3]);
    }
  }
  return { data, w, h };
}

function bbox({ data, w, h }) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error("no subject found after removing the background");
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Median brightness of bright, neutral (recolourable) pixels — same test as the site's mask. */
function garmentBrightness({ data, w, h }) {
  const L = [];
  for (let k = 0; k < w * h; k += 3) {
    const i = k * 4;
    if (data[i + 3] < 230) continue;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    if (-11 * r + 3 * g + 12 * b - 1.4 < 0.9) continue;
    L.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  if (L.length < 500) return null;
  L.sort((a, b) => a - b);
  return +L[L.length >> 1].toFixed(3);
}

const raw = (img) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } });

async function product(file, out) {
  const img = await cutout(file);
  const box = bbox(img);
  const side = Math.round(Math.max(box.width, box.height) * 1.08);
  const trimmed = await raw(img).extract(box).png().toBuffer();
  await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: trimmed, left: (side - box.width) >> 1, top: (side - box.height) >> 1 }])
    .resize(900, 900)
    .webp({ quality: 88, alphaQuality: 95 })
    .toFile(out);
  return garmentBrightness(img);
}

async function fit(file, out) {
  const img = await cutout(file);
  const box = bbox(img);
  // Scale so the figure spans from FIT_TOP to the bottom edge (cropped at mid-thigh).
  const scale = (FIT_H * (1 - FIT_TOP)) / box.height;
  const sw = Math.round(img.w * scale), sh = Math.round(img.h * scale);
  const scaled = await raw(img).resize(sw, sh).png().toBuffer();
  const cx = (box.left + box.width / 2) * scale;
  const left = Math.round(FIT_W / 2 - cx);
  const top = Math.round(FIT_H * FIT_TOP - box.top * scale);
  // Composite onto the canvas, cropping anything outside it.
  const sx = Math.max(0, -left), sy = Math.max(0, -top);
  const cw = Math.min(sw - sx, FIT_W - Math.max(0, left)), ch = Math.min(sh - sy, FIT_H - Math.max(0, top));
  const piece = await sharp(scaled).extract({ left: sx, top: sy, width: cw, height: ch }).png().toBuffer();
  await sharp({ create: { width: FIT_W, height: FIT_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }])
    .webp({ quality: 86, alphaQuality: 95 })
    .toFile(out);
}

/* ── main ── */
const manifest = {};
let done = 0;
for (const cat of CATEGORIES) {
  const dir = path.join(SRC, cat);
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => EXT.test(f));
  } catch {
    continue;
  }
  if (!files.length) continue;
  await mkdir(path.join(OUT, cat), { recursive: true });
  for (let n = 1; n <= 5; n++) {
    const entry = {};
    for (const kind of ["product", "fit"]) {
      const src = files.find((f) => f.replace(EXT, "").toLowerCase() === `${kind}-${n}`);
      if (!src) continue;
      const name = `${kind}-${n}.webp`;
      const dest = path.join(OUT, cat, name);
      try {
        if (kind === "product") {
          const lm = await product(path.join(dir, src), dest);
          if (lm) entry.lm = lm;
        } else {
          await fit(path.join(dir, src), dest);
        }
        const v = Math.round((await stat(dest)).mtimeMs).toString(36);
        entry[kind] = `/vf/${cat}/${name}?v=${v}`;
        done++;
        console.log(`✓ ${cat}/${src} → public/vf/${cat}/${name}`);
      } catch (e) {
        console.error(`✗ ${cat}/${src}: ${e.message}`);
      }
    }
    if (Object.keys(entry).length) (manifest[cat] ??= {})[String(n)] = entry;
  }
}
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

/* ── people: assets-src/models/<id>/reference.* and <category>/fit-N.* ── */
const MODELS_SRC = path.join(SRC, "models");
const MODELS_OUT = path.join(OUT, "models");
const MODELS_MANIFEST = path.join(ROOT, "app", "vf-models.json");
const ALL_CATS = ["tops", ...CATEGORIES];
const models = {};
const versioned = async (file, publicPath) => `${publicPath}?v=${Math.round((await stat(file)).mtimeMs).toString(36)}`;

/** Square face crop from a processed fit/base image (head sits at the top, centred). */
async function avatarFrom(fitFile, dest) {
  const side = Math.round(FIT_W * 0.6);
  await sharp(fitFile)
    .extract({ left: Math.round((FIT_W - side) / 2), top: Math.round(FIT_H * 0.004), width: side, height: side })
    .flatten({ background: "#ecebe8" })
    .resize(192, 192)
    .webp({ quality: 88 })
    .toFile(dest);
}

let ids = [];
try {
  ids = (await readdir(MODELS_SRC, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
} catch {
  /* no models folder yet */
}
if (!ids.includes("leo")) ids.push("leo"); // Leo's avatar comes from assets-src/model-reference.png

for (const id of ids) {
  const dir = path.join(MODELS_SRC, id);
  const out = path.join(MODELS_OUT, id);
  const entry = {};
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => EXT.test(f));
  } catch {
    /* empty */
  }
  const ref = files.find((f) => f.replace(EXT, "").toLowerCase() === "reference");
  const refPath = ref ? path.join(dir, ref) : id === "leo" ? path.join(SRC, "model-reference.png") : null;
  try {
    if (refPath) {
      await mkdir(out, { recursive: true });
      const base = path.join(out, "base.webp");
      await fit(refPath, base);
      if (id !== "leo") entry.base = await versioned(base, `/vf/models/${id}/base.webp`);
      const av = path.join(out, "avatar.webp");
      await avatarFrom(base, av);
      entry.avatar = await versioned(av, `/vf/models/${id}/avatar.webp`);
      if (id === "leo") await rm(base); // Leo's outfits come from the Tops sprite
      done++;
      console.log(`✓ models/${id}/${ref ?? "../model-reference.png"} → avatar${id === "leo" ? "" : " + base"}`);
    }
  } catch (e) {
    console.error(`✗ models/${id} reference: ${e.message}`);
  }
  for (const cat of ALL_CATS) {
    let catFiles = [];
    try {
      catFiles = (await readdir(path.join(dir, cat))).filter((f) => EXT.test(f));
    } catch {
      continue;
    }
    for (let n = 1; n <= 5; n++) {
      const src = catFiles.find((f) => f.replace(EXT, "").toLowerCase() === `fit-${n}`);
      if (!src) continue;
      try {
        await mkdir(path.join(out, cat), { recursive: true });
        const dest = path.join(out, cat, `fit-${n}.webp`);
        await fit(path.join(dir, cat, src), dest);
        ((entry.fits ??= {})[cat] ??= {})[String(n)] = await versioned(dest, `/vf/models/${id}/${cat}/fit-${n}.webp`);
        done++;
        console.log(`✓ models/${id}/${cat}/${src}`);
      } catch (e) {
        console.error(`✗ models/${id}/${cat}/${src}: ${e.message}`);
      }
    }
  }
  if (Object.keys(entry).length) models[id] = entry;
}
await writeFile(MODELS_MANIFEST, JSON.stringify(models, null, 2) + "\n");

console.log(done ? `\n${done} image(s) ready. Wrote app/vf-assets.json and app/vf-models.json` : "\nNo images found in assets-src/. See assets-src/README.md.");
