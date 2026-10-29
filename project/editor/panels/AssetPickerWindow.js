/**
 * editor/panels/AssetPickerWindow.js
 *
 * One shared "pick an image already in the project" window with three
 * tabs that match the Project panel's folders: Sprites, Animation Clips
 * (uploaded animation frames) and Tiles. It is opened from:
 *   - the Animation editor ("Project" button next to the import buttons)
 *     to add frames to the open clip         -> purpose "anim-frame"
 *   - a slot in the Tileset editor to put an existing image in that
 *     slot                                   -> purpose "tile-slot"
 *   - the Tileset editor's "Use Existing Image" button to cut one
 *     existing image into the 16 tile slots  -> purpose "tile-split"
 *
 * Picking never copies or alters the source asset; frames and slots just
 * reference it by key, the same way imported ones do. What each pick
 * does lives in EditorEvents.js ("asset-picker-choose").
 *
 * EDITOR-ONLY FILE.
 */

import { editorState } from "../state/EditorState.js";
import { getAssetsForPicker } from "../../runtime/assets/AssetRegistry.js";

const TABS = [
  { id: "sprites", folder: "sprites", label: "Sprites" },
  { id: "animation", folder: "animation", label: "Animation Clips" },
  { id: "tiles", folder: "tiles", label: "Tiles" },
];

const TITLES = {
  "anim-frame": "Add frames from project assets",
  "tile-slot": "Choose an image for this tile",
  "tile-split": "Choose an image to split into the 16 tiles (4×4)",
};

const HINTS = {
  "anim-frame": "Click images to add them to the clip as frames, in the order you click.",
  "tile-slot": "The image is used as-is for this one slot.",
  "tile-split": "The image is cut into a 4×4 grid and fills all 16 slots. The pieces are saved in the Tiles folder.",
};

export function getAssetPickerTabs() {
  return TABS.map((tab) => ({ ...tab, count: getAssetsForPicker(tab.folder).length }));
}

/** The tab to open first for a purpose: where the user most likely keeps what they want, falling back to any non-empty tab. */
export function preferredPickerTab(purpose) {
  const tabs = getAssetPickerTabs();
  const first = purpose === "anim-frame" ? "animation" : "sprites";
  const order = [first, "sprites", "animation", "tiles"];
  for (const id of order) {
    const tab = tabs.find((t) => t.id === id);
    if (tab && tab.count > 0) return id;
  }
  return first;
}

export function renderAssetPickerWindow() {
  const picker = editorState.assetPicker;
  if (!picker || !picker.open) return "";

  const tabs = getAssetPickerTabs();
  const active = tabs.find((t) => t.id === picker.tab) || tabs[0];
  const assets = getAssetsForPicker(active.folder);

  const tabsHtml = tabs
    .map(
      (t) =>
        '<button type="button" data-action="asset-picker-tab" data-tab="' + t.id + '" style="' + tabStyle(t.id === active.id) + '">' +
        esc(t.label) + ' <span style="opacity:.6;">' + t.count + "</span></button>"
    )
    .join("");

  let body;
  if (!assets.length) {
    body = '<div style="padding:28px 16px;color:#5a6480;font-size:12px;text-align:center;">Nothing in ' + esc(active.label) +
      " yet. Import images into this folder from the Project panel, or use another tab.</div>";
  } else {
    const groups = new Map();
    for (const a of assets) {
      const g = a.group || "";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(a);
    }
    body = Array.from(groups.entries())
      .map(([group, items]) =>
        (group
          ? '<div style="width:100%;font-size:10px;color:#8a93a0;padding:2px 2px 4px;border-bottom:1px solid #2e3a50;">' + esc(group) + " · " + items.length + "</div>"
          : "") +
        items.map(cell).join("")
      )
      .join("");
  }

  const footer =
    picker.purpose === "anim-frame"
      ? '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid #2e3a50;font-size:11px;color:#8a93a0;">' +
        "<span>" + (picker.added ? esc(String(picker.added)) + " frame(s) added" + (picker.note ? " — " + esc(picker.note) : "") : "Nothing added yet") + "</span>" +
        '<button type="button" data-action="close-asset-picker" style="background:#245b45;border:1px solid #3d8a67;color:#d7ffe9;border-radius:4px;padding:5px 14px;font-size:11px;cursor:pointer;">Done</button></div>'
      : "";

  return (
    '<div data-action="close-asset-picker" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1100;"></div>' +
    '<div class="asset-picker-window" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e2330;border:1px solid #3a4560;border-radius:8px;width:520px;max-width:94vw;max-height:76vh;display:flex;flex-direction:column;z-index:1101;box-shadow:0 8px 32px rgba(0,0,0,.6);overflow:hidden;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #2e3a50;flex-shrink:0;">' +
    '<span style="font-size:13px;font-weight:600;color:#c8d0de;">' + esc(TITLES[picker.purpose] || "Choose an image") + "</span>" +
    '<button type="button" data-action="close-asset-picker" style="background:none;border:none;color:#8a93a0;cursor:pointer;font-size:16px;line-height:1;padding:2px 6px;">✕</button></div>' +
    '<div style="padding:6px 16px 0;font-size:10.5px;color:#6b7488;">' + esc(HINTS[picker.purpose] || "") + "</div>" +
    '<div style="display:flex;gap:4px;padding:8px 16px 0;flex-shrink:0;">' + tabsHtml + "</div>" +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;padding:10px 16px;overflow-y:auto;flex:1;align-content:flex-start;">' + body + "</div>" +
    footer +
    "</div>"
  );
}

function tabStyle(active) {
  return (
    "font-family:inherit;font-size:11px;cursor:pointer;border-radius:4px 4px 0 0;padding:5px 10px;" +
    (active ? "background:#2b3550;color:#e2e8f2;border:1px solid #3a4560;border-bottom-color:#2b3550;" : "background:transparent;color:#8a93a0;border:1px solid transparent;")
  );
}

function cell(a) {
  return (
    '<button type="button" data-action="asset-picker-choose" data-sprite-key="' + esc(a.key) + '" title="' + esc(a.name) +
    '" style="display:flex;flex-direction:column;align-items:center;gap:4px;width:72px;cursor:pointer;background:none;border:none;border-radius:4px;padding:4px;font-family:inherit;">' +
    '<div style="width:60px;height:60px;background:#12151d;border:1px solid #2e3a50;border-radius:3px;display:flex;align-items:center;justify-content:center;overflow:hidden;">' +
    '<img src="' + a.dataUrl + '" alt="" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;" draggable="false" /></div>' +
    '<span style="font-size:10px;color:#c8d0de;text-align:center;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(a.name) + "</span></button>"
  );
}

function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
