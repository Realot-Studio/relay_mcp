/**
 * editor/export/AtlasPacker.js
 *
 * Packs many small animation-frame images into a few big "atlas" sheets at
 * export time (what Unity's Sprite Atlas / sprite packer does at build time).
 *
 * Why: hundreds of separate frame files mean hundreds of requests, hundreds
 * of decodes and hundreds of GPU textures, and every frame change swaps GPU
 * textures. One atlas = one download, one decode and one GPU texture per
 * sheet; a frame change is just a different rectangle of the same texture.
 *
 * EDITOR-ONLY (runs inside the browser at export time; needs canvas).
 */

const MAX_ATLAS = 2048; // safe on every phone GPU
const PADDING = 2; // transparent gap + edge extrusion so frames never bleed into each other

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = dataUrl;
  });
}

/**
 * Pure layout step (no DOM) so it can be unit-tested: shelf-packs rects in
 * the given order into sheets no larger than maxSize.
 * @param {Array<{key:string,w:number,h:number}>} items
 * @param {number} maxSize
 * @param {number} pad
 * @returns {{sheets:Array<{w:number,h:number,placements:Array<{key:string,x:number,y:number,w:number,h:number}>}>, rejected:string[]}}
 */
export function layoutShelves(items, maxSize = MAX_ATLAS, pad = PADDING) {
  const sheets = [];
  const rejected = [];
  let cur = null;
  const newSheet = () => ({ shelfY: 0, shelfH: 0, cursorX: 0, usedW: 0, placements: [] });
  for (const it of items) {
    const cw = it.w + pad * 2;
    const ch = it.h + pad * 2;
    if (cw > maxSize || ch > maxSize) { rejected.push(it.key); continue; }
    if (!cur) cur = newSheet();
    // new shelf if it doesn't fit on the current one horizontally
    if (cur.cursorX + cw > maxSize) {
      cur.shelfY += cur.shelfH;
      cur.shelfH = 0;
      cur.cursorX = 0;
    }
    // new sheet if it doesn't fit vertically
    if (cur.shelfY + ch > maxSize) {
      sheets.push(cur);
      cur = newSheet();
    }
    cur.placements.push({ key: it.key, x: cur.cursorX + pad, y: cur.shelfY + pad, w: it.w, h: it.h });
    cur.cursorX += cw;
    cur.usedW = Math.max(cur.usedW, cur.cursorX);
    cur.shelfH = Math.max(cur.shelfH, ch);
  }
  if (cur && cur.placements.length) sheets.push(cur);
  return {
    sheets: sheets.map((s) => ({
      w: Math.min(maxSize, nextPow2(Math.max(1, s.usedW))),
      h: Math.min(maxSize, nextPow2(Math.max(1, s.shelfY + s.shelfH))),
      placements: s.placements,
    })),
    rejected,
  };
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

/**
 * @param {Array<{key:string,dataUrl:string}>} records frames in playback order (frames of one clip adjacent)
 * @param {{quality?:number, onProgress?:(msg:string)=>void}} [opts]
 * @returns {Promise<{atlases:Array<{file:string,bytes:Uint8Array,w:number,h:number}>, frames:Array<{key:string,atlas:string,x:number,y:number,w:number,h:number}>, leftover:string[]}>}
 */
export async function packAtlases(records, opts) {
  const o = opts || {};
  const quality = o.quality || 0.82;
  const images = [];
  const leftover = [];
  for (const rec of records) {
    try {
      const img = await loadImage(rec.dataUrl);
      images.push({ key: rec.key, img, w: img.naturalWidth, h: img.naturalHeight });
    } catch (_) {
      leftover.push(rec.key); // ships as a normal single file instead
    }
  }
  const byKey = new Map(images.map((i) => [i.key, i]));
  const { sheets, rejected } = layoutShelves(images.map((i) => ({ key: i.key, w: i.w, h: i.h })));
  leftover.push(...rejected);

  const atlases = [];
  const frames = [];
  for (let si = 0; si < sheets.length; si++) {
    const sheet = sheets[si];
    const canvas = document.createElement("canvas");
    canvas.width = sheet.w;
    canvas.height = sheet.h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    for (const p of sheet.placements) {
      const img = byKey.get(p.key).img;
      ctx.drawImage(img, p.x, p.y);
      // extrude the outer pixel ring into the padding so linear filtering
      // / sub-pixel scaling can never pull in a neighbour frame's colour
      const e = PADDING;
      ctx.drawImage(img, 0, 0, 1, p.h, p.x - e, p.y, e, p.h);
      ctx.drawImage(img, p.w - 1, 0, 1, p.h, p.x + p.w, p.y, e, p.h);
      ctx.drawImage(img, 0, 0, p.w, 1, p.x, p.y - e, p.w, e);
      ctx.drawImage(img, 0, p.h - 1, p.w, 1, p.x, p.y + p.h, p.w, e);
    }
    let blob = await canvasToBlob(canvas, "image/webp", quality);
    if (!blob || blob.size === 0) blob = await canvasToBlob(canvas, "image/png");
    const ext = blob.type === "image/webp" ? "webp" : "png";
    const file = "assets/atlases/atlas_" + si + "." + ext;
    atlases.push({ file, bytes: new Uint8Array(await blob.arrayBuffer()), w: sheet.w, h: sheet.h });
    for (const p of sheet.placements) frames.push({ key: p.key, atlas: file, x: p.x, y: p.y, w: p.w, h: p.h });
    if (o.onProgress) o.onProgress("Packing animation atlases… (" + (si + 1) + "/" + sheets.length + ")");
    canvas.width = canvas.height = 1; // release the big backing store
  }
  return { atlases, frames, leftover };
}
