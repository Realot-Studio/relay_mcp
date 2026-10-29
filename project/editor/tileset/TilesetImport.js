/**
 * editor/tileset/TilesetImport.js
 *
 * Turns raw user input (one sprite-sheet-style image, or up to 16
 * standalone images) into spriteKeys ready to drop into a Tileset
 * component's slots (see runtime/components/Tileset.js) — the
 * authoring-time half of the autotile feature. The painting-time half
 * (deciding which slot to use as you draw) lives entirely in
 * runtime/systems/AutoTileRules.js + TilemapSystem.js and never touches
 * this file.
 *
 * EDITOR-ONLY FILE: does DOM/Image/Canvas slicing that has no business
 * inside /runtime, mirroring editor/animation/AnimationImport.js's
 * split for the exact same reason (see that file's header comment).
 * runtime/components/Tileset.js and runtime/systems/TilemapSystem.js
 * never call into this file — they just consume the spriteKeys it
 * produces via registerTexture().
 */

import { registerTexture } from "../../runtime/assets/AssetManager.js";
import { getSpriteAsset } from "../../runtime/assets/AssetRegistry.js";
import { TILE_ROLE_ORDER } from "../../runtime/components/Tileset.js";

let _nextTileKeyId = 1;

/** Next unused "tile_N" key (skips keys already taken, e.g. restored from a saved project). */
function _newTileKey() {
  let key;
  do { key = "tile_" + _nextTileKeyId++; } while (getSpriteAsset(key));
  return key;
}

/**
 * Slices ONE image into a 4x4 grid (equal-sized cells, no gutter
 * detection needed since tileset source images are expected to be a
 * clean 4x4 sheet) and returns one spriteKey per TILE_ROLE_ORDER slot,
 * in the same row-major order as the editor's 4x4 authoring grid.
 * @param {File} file
 * @returns {Promise<Record<string,{spriteKey:string,dataUrl:string}>>} role -> {spriteKey, dataUrl}
 */
export async function sliceTilesetImageIntoRoles(file) {
  return _sliceLoadedImage(await _readImageFile(file));
}

/**
 * Same as sliceTilesetImageIntoRoles(), but starts from an image that is
 * already in the project (a sprite, animation frame or tile asset, given
 * as its dataUrl) instead of a file the user picks.
 * @param {string} dataUrl
 * @returns {Promise<Record<string,{spriteKey:string,dataUrl:string,width:number,height:number}>>}
 */
export async function sliceTilesetDataUrlIntoRoles(dataUrl) {
  return _sliceLoadedImage(await _readImageDataUrl(dataUrl));
}

function _sliceLoadedImage({ img, width, height }) {
  const cellW = width / 4;
  const cellH = height / 4;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0);

  const result = {};
  for (let i = 0; i < TILE_ROLE_ORDER.length; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const role = TILE_ROLE_ORDER[i];

    const cellCanvas = document.createElement("canvas");
    cellCanvas.width = Math.max(1, Math.round(cellW));
    cellCanvas.height = Math.max(1, Math.round(cellH));
    cellCanvas
      .getContext("2d")
      .drawImage(canvas, col * cellW, row * cellH, cellW, cellH, 0, 0, cellCanvas.width, cellCanvas.height);

    const dataUrl = cellCanvas.toDataURL("image/png");
    const key = _newTileKey();
    const texture = new PIXI.Texture(PIXI.BaseTexture.from(cellCanvas));
    registerTexture(key, texture);
    result[role] = { spriteKey: key, dataUrl, width: cellCanvas.width, height: cellCanvas.height };
  }
  return result;
}

/**
 * Loads ONE standalone image as a single role's texture — used when
 * the user drags/drops (or file-picks) an individual image straight
 * into one of the 16 slots rather than importing a whole 4x4 sheet.
 * @param {File} file
 * @returns {Promise<{spriteKey:string, dataUrl:string}>}
 */
export async function loadSingleTileImage(file) {
  const { img, dataUrl } = await _readImageFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d").drawImage(img, 0, 0);
  const key = _newTileKey();
  const texture = new PIXI.Texture(PIXI.BaseTexture.from(canvas));
  registerTexture(key, texture);
  return { spriteKey: key, dataUrl, width: canvas.width, height: canvas.height };
}

function _readImageDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Failed to decode the selected image."));
    img.onload = () => resolve({ img, dataUrl, width: img.naturalWidth, height: img.naturalHeight });
    img.src = dataUrl;
  });
}

function _readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image: " + file.name));
      img.onload = () => resolve({ img, dataUrl, width: img.naturalWidth, height: img.naturalHeight });
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
