import { createPsdBitmap, type PsdBitmap } from "../codec/document";

/** Area averaging in premultiplied alpha avoids halos and preserves thin details. */
export function halvePsdBitmap(source: PsdBitmap): PsdBitmap {
 const width = Math.max(1, Math.floor(source.width / 2));
 const height = Math.max(1, Math.floor(source.height / 2));
 const out = createPsdBitmap(width, height);
 const sx = source.width / width, sy = source.height / height;
 for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const left = x * sx, right = (x + 1) * sx, top = y * sy, bottom = (y + 1) * sy;
  let alpha = 0, red = 0, green = 0, blue = 0;
  for (let iy = Math.floor(top); iy < Math.ceil(bottom); iy++) {
   const wy = Math.min(bottom, iy + 1) - Math.max(top, iy);
   for (let ix = Math.floor(left); ix < Math.ceil(right); ix++) {
    const weight = wy * (Math.min(right, ix + 1) - Math.max(left, ix));
    const at = (iy * source.width + ix) * 4, a = source.data[at + 3] * weight;
    alpha += a; red += source.data[at] * a; green += source.data[at + 1] * a; blue += source.data[at + 2] * a;
   }
  }
  const at = (y * width + x) * 4;
  if (alpha) { out.data[at] = Math.round(red / alpha); out.data[at+1] = Math.round(green / alpha); out.data[at+2] = Math.round(blue / alpha); }
  out.data[at+3] = Math.round(alpha / (sx * sy));
 }
 return out;
}
/** Keeps only the current composite and its display levels; never changes editing pixels. */
export class PsdDisplayPyramid {
 private source: PsdBitmap | null = null;
 private levels: PsdBitmap[] = [];
 bitmap(source: PsdBitmap, scale: number): PsdBitmap {
  if (source !== this.source) { this.source = source; this.levels = [source]; }
  const targetWidth = Math.max(1, source.width * Math.min(1, Math.max(0.001, scale)));
  const targetHeight = Math.max(1, source.height * Math.min(1, Math.max(0.001, scale)));
  let level = 0;
  while (this.levels[level].width > 1 || this.levels[level].height > 1) {
   const current = this.levels[level];
   if (Math.max(1, Math.floor(current.width / 2)) < targetWidth || Math.max(1, Math.floor(current.height / 2)) < targetHeight) break;
   if (!this.levels[level + 1]) this.levels.push(halvePsdBitmap(current));
   level++;
  }
  return this.levels[level];
 }
}
