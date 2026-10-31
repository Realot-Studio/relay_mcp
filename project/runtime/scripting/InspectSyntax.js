/**
 * runtime/scripting/InspectSyntax.js
 *
 * Realot scripts can expose variables in the Inspector, like Godot's
 * `@export var`. Put `inspect` in front of a top-level declaration:
 *
 *   inspect let speed = 5;                  // number
 *   inspect let name = "Hero";              // string
 *   inspect let godMode = false;            // boolean
 *   inspect let tint = "#ff8800";           // color picker
 *   inspect let spawnPoint = { x: 0, y: 0 };// Vector2
 *   inspect let drops = [1, 2, 3];          // array (numbers or strings)
 *   inspect({ min: 0, max: 100, label: "Health" }) let hp = 100;
 *   inspect({ options: ["Idle", "Patrol", "Chase"] }) let mode = "Idle";
 *
 * Call form: `inspect(options)` / `inspect()` placed right before the
 * `let` / `var` / `const` works too. Options (all optional):
 *   label, tooltip, min, max, step, slider (bool), options ([...] → dropdown),
 *   type ("number" | "int" | "string" | "text" | "boolean" | "color" |
 *         "vector2" | "enum" | "array") — only needed to override detection.
 *
 * `inspect` is NOT valid JavaScript, so (exactly like the `as` cast hint in
 * CastSyntax.js) both the compiler and the editor's live syntax check run the
 * source through this file first:
 *   - stripInspectSyntax()  blanks `inspect` / `inspect(...)` (same length,
 *     same line count) so what is left is plain JS.
 *   - applyInspectValues()  does that AND swaps each declaration's initializer
 *     for the value the user typed in the Inspector (Script.inspectValues).
 *
 * Only TOP-LEVEL declarations count (not inside functions/blocks), and string/
 * comment/regex text is never touched (uses CastSyntax's lexer).
 *
 * ENGINE FILE — used by both runtime and editor.
 */

import { scanCodeSpans } from "./CastSyntax.js";

export const INSPECT_KEYWORD = "inspect";
export const INSPECT_OPTION_KEYS = [
  "label", "tooltip", "min", "max", "step", "slider", "options", "type",
];

const HEX_COLOR_RX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function _isIdentPart(ch) {
  return !!ch && /[A-Za-z0-9_$]/.test(ch);
}
function _isWs(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

// ─── Literal parsing (no eval — Inspector values must be plain data) ────────

function _parseLiteral(text) {
  const s = String(text);
  let p = 0;
  const fail = () => { throw new Error("not a literal"); };

  function skip() {
    for (;;) {
      while (p < s.length && _isWs(s[p])) p++;
      if (s[p] === "/" && s[p + 1] === "/") { while (p < s.length && s[p] !== "\n") p++; continue; }
      if (s[p] === "/" && s[p + 1] === "*") {
        const e = s.indexOf("*/", p + 2);
        if (e < 0) fail();
        p = e + 2;
        continue;
      }
      break;
    }
  }

  function str() {
    const q = s[p++];
    let out = "";
    while (p < s.length && s[p] !== q) {
      if (s[p] === "\\") {
        p++;
        const c = s[p++];
        if (c === "n") out += "\n";
        else if (c === "t") out += "\t";
        else if (c === "r") out += "\r";
        else if (c === "b") out += "\b";
        else if (c === "f") out += "\f";
        else if (c === "v") out += "\v";
        else if (c === "0") out += "\0";
        else if (c === "x") { out += String.fromCharCode(parseInt(s.slice(p, p + 2), 16)); p += 2; }
        else if (c === "u") {
          if (s[p] === "{") {
            const e = s.indexOf("}", p);
            if (e < 0) fail();
            out += String.fromCodePoint(parseInt(s.slice(p + 1, e), 16));
            p = e + 1;
          } else { out += String.fromCharCode(parseInt(s.slice(p, p + 4), 16)); p += 4; }
        } else if (c === "\n") { /* line continuation */ }
        else out += c;
      } else {
        if (q === "`" && s[p] === "$" && s[p + 1] === "{") fail(); // interpolation is code, not data
        out += s[p++];
      }
    }
    if (s[p] !== q) fail();
    p++;
    return out;
  }

  function value() {
    skip();
    const c = s[p];
    if (c === '"' || c === "'" || c === "`") return str();
    if (c === "[") {
      p++;
      const arr = [];
      for (;;) {
        skip();
        if (s[p] === "]") { p++; return arr; }
        arr.push(value());
        skip();
        if (s[p] === ",") { p++; continue; }
        if (s[p] === "]") { p++; return arr; }
        fail();
      }
    }
    if (c === "{") {
      p++;
      const obj = {};
      for (;;) {
        skip();
        if (s[p] === "}") { p++; return obj; }
        let key;
        if (s[p] === '"' || s[p] === "'") key = str();
        else {
          const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(s.slice(p));
          if (!m) fail();
          key = m[0];
          p += key.length;
        }
        skip();
        if (s[p] !== ":") fail();
        p++;
        obj[key] = value();
        skip();
        if (s[p] === ",") { p++; continue; }
        if (s[p] === "}") { p++; return obj; }
        fail();
      }
    }
    const num = /^[+-]?(?:0[xX][\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(s.slice(p));
    if (num) {
      p += num[0].length;
      const v = Number(num[0].replace(/^\+/, ""));
      if (!Number.isFinite(v)) fail();
      return v;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(s.slice(p));
    if (word) {
      p += word[0].length;
      if (word[0] === "true") return true;
      if (word[0] === "false") return false;
      if (word[0] === "null") return null;
      if (word[0] === "undefined") return undefined;
    }
    return fail();
  }

  const v = value();
  skip();
  if (p < s.length) fail();
  return v;
}

function _tryParse(text) {
  try { return { ok: true, value: _parseLiteral(text) }; } catch (_) { return { ok: false }; }
}

// ─── Declaration scanner ────────────────────────────────────────────────────

const _scanCache = { source: null, result: null };

/**
 * Finds every `inspect [ (opts) ] let|var|const name [= init]` at the top
 * level. Returns raw positional data; see describeDecl() for the public shape.
 */
function _scan(source) {
  if (typeof source !== "string" || source.indexOf(INSPECT_KEYWORD) < 0) return [];
  if (_scanCache.source === source) return _scanCache.result;

  const n = source.length;
  const mask = new Uint8Array(n);
  for (const [a, b] of scanCodeSpans(source)) for (let i = a; i < b && i < n; i++) mask[i] = 1;

  function skipTrivia(j) {
    for (;;) {
      while (j < n && _isWs(source[j])) j++;
      if (source[j] === "/" && source[j + 1] === "/") { while (j < n && source[j] !== "\n") j++; continue; }
      if (source[j] === "/" && source[j + 1] === "*") {
        const e = source.indexOf("*/", j + 2);
        if (e < 0) return n;
        j = e + 2;
        continue;
      }
      return j;
    }
  }

  const found = [];
  let depth = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const ch = source[i];
    if (ch === "{" || ch === "(" || ch === "[") { depth++; continue; }
    if (ch === "}" || ch === ")" || ch === "]") { depth = Math.max(0, depth - 1); continue; }
    if (ch !== "i") continue;
    if (!source.startsWith(INSPECT_KEYWORD, i)) continue;
    if (_isIdentPart(source[i - 1]) || source[i - 1] === ".") continue;
    if (_isIdentPart(source[i + INSPECT_KEYWORD.length])) continue;

    const keywordStart = i;
    let keywordEnd = i + INSPECT_KEYWORD.length;
    let j = skipTrivia(keywordEnd);
    let optsText = "";
    let optsStart = -1;
    let optsEnd = -1;
    if (source[j] === "(") {
      let k = j + 1;
      let d = 1;
      while (k < n) {
        if (mask[k]) {
          const c = source[k];
          if (c === "(" || c === "[" || c === "{") d++;
          else if (c === ")" || c === "]" || c === "}") { d--; if (d === 0) break; }
        }
        k++;
      }
      if (d !== 0) continue; // unterminated — leave for the real syntax check
      optsStart = j + 1;
      optsEnd = k;
      optsText = source.slice(j + 1, k);
      keywordEnd = k + 1;
      j = keywordEnd;
    }
    j = skipTrivia(j);
    if (source[j] === ";") j = skipTrivia(j + 1);

    const kw = /^(let|var|const)(?![\w$])/.exec(source.slice(j, j + 6));
    if (!kw) continue;
    const kind = kw[1];
    j = skipTrivia(j + kind.length);
    const nm = /^[A-Za-z_$][\w$]*/.exec(source.slice(j, j + 128));
    if (!nm) continue;
    const name = nm[0];
    const nameStart = j;
    const nameEnd = j + name.length;
    j = skipTrivia(nameEnd);

    let hasInit = false;
    let initStart = nameEnd;
    let initEnd = nameEnd;
    if (source[j] === "=" && source[j + 1] !== "=" && source[j + 1] !== ">") {
      hasInit = true;
      j = skipTrivia(j + 1);
      initStart = j;
      let k = j;
      let d = 0;
      let lastSig = j;
      while (k < n) {
        const c = source[k];
        if (c === '"' || c === "'" || c === "`") {
          const q = c;
          k++;
          while (k < n && source[k] !== q) { if (source[k] === "\\") k++; k++; }
          k = Math.min(n, k + 1);
          lastSig = k;
          continue;
        }
        if (c === "/" && source[k + 1] === "/") { while (k < n && source[k] !== "\n") k++; continue; }
        if (c === "/" && source[k + 1] === "*") {
          const e = source.indexOf("*/", k + 2);
          k = e < 0 ? n : e + 2;
          continue;
        }
        if (c === "(" || c === "[" || c === "{") d++;
        else if (c === ")" || c === "]" || c === "}") { if (d === 0) break; d--; }
        else if (d === 0 && (c === ";" || c === "," || c === "\n")) break;
        if (!_isWs(c)) lastSig = k + 1;
        k++;
      }
      initEnd = Math.max(initStart, lastSig);
    }

    found.push({
      // Declared inside a function/block: not exposed, but the keyword is
      // still blanked so the script compiles (see stripInspectSyntax()).
      nested: depth !== 0,
      kind, name, hasInit,
      keywordStart, keywordEnd,
      nameStart, nameEnd,
      initStart, initEnd,
      initText: hasInit ? source.slice(initStart, initEnd) : "",
      optsText, optsStart, optsEnd,
    });
    i = Math.max(i, initEnd - 1, nameEnd - 1);
  }

  _scanCache.source = source;
  _scanCache.result = found;
  return found;
}

// ─── Type detection ─────────────────────────────────────────────────────────

const TYPE_ALIASES = {
  number: "number", float: "number", int: "int", integer: "int",
  string: "string", text: "text", multiline: "text",
  boolean: "boolean", bool: "boolean",
  color: "color", colour: "color",
  vector2: "vector2", vec2: "vector2",
  enum: "enum", array: "array", list: "array",
};

function _isVec2(v) {
  return !!v && typeof v === "object" && !Array.isArray(v) &&
    Number.isFinite(v.x) && Number.isFinite(v.y) && Object.keys(v).length === 2;
}

function _typeDefault(type, opts) {
  switch (type) {
    case "number": case "int": return Number.isFinite(opts.min) ? opts.min : 0;
    case "string": case "text": return "";
    case "boolean": return false;
    case "color": return "#ffffff";
    case "vector2": return { x: 0, y: 0 };
    case "enum": return Array.isArray(opts.options) && opts.options.length ? opts.options[0] : "";
    case "array": return [];
    default: return undefined;
  }
}

function _arrayKind(arr) {
  if (arr.every((v) => typeof v === "number" && Number.isFinite(v))) return "number";
  if (arr.every((v) => typeof v === "string")) return "string";
  return null;
}

function _describe(raw) {
  const parsedOpts = raw.optsText.trim() ? _tryParse(raw.optsText) : { ok: true, value: {} };
  const o = parsedOpts.ok && parsedOpts.value && typeof parsedOpts.value === "object" && !Array.isArray(parsedOpts.value)
    ? parsedOpts.value : {};
  const opts = {
    label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : null,
    tooltip: typeof o.tooltip === "string" ? o.tooltip : "",
    min: Number.isFinite(o.min) ? o.min : null,
    max: Number.isFinite(o.max) ? o.max : null,
    step: Number.isFinite(o.step) && o.step > 0 ? o.step : null,
    slider: o.slider === true,
    options: Array.isArray(o.options)
      ? o.options.filter((v) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v)))
      : null,
    type: typeof o.type === "string" ? (TYPE_ALIASES[o.type.toLowerCase()] || null) : null,
  };

  const lit = raw.hasInit ? _tryParse(raw.initText) : { ok: true, value: undefined };
  let type = opts.type;
  let defaultValue = lit.ok ? lit.value : undefined;
  let supported = true;
  let arrayOf = null;

  if (!type) {
    if (opts.options && opts.options.length && (typeof defaultValue === "string" || typeof defaultValue === "number" || defaultValue === undefined)) type = "enum";
    else if (typeof defaultValue === "number") type = "number";
    else if (typeof defaultValue === "boolean") type = "boolean";
    else if (typeof defaultValue === "string") type = HEX_COLOR_RX.test(defaultValue) ? "color" : "string";
    else if (_isVec2(defaultValue)) type = "vector2";
    else if (Array.isArray(defaultValue) && _arrayKind(defaultValue)) type = "array";
    else if (Array.isArray(defaultValue) && defaultValue.length === 0) type = "array";
    else supported = false;
  }
  if (supported && !lit.ok) supported = false;
  if (supported && defaultValue === undefined) defaultValue = _typeDefault(type, opts);
  if (supported && type === "array") {
    arrayOf = _arrayKind(defaultValue) || "number";
  }
  if (supported && (type === "enum") && (!opts.options || !opts.options.length)) supported = false;

  let step = opts.step;
  if (step == null && (type === "number" || type === "int")) {
    step = type === "int" || Number.isInteger(defaultValue) ? 1 : 0.1;
  }

  return {
    name: raw.name,
    kind: raw.kind,
    type: supported ? type : null,
    supported,
    arrayOf,
    label: opts.label || _prettify(raw.name),
    tooltip: opts.tooltip,
    min: opts.min, max: opts.max, step,
    slider: opts.slider && opts.min != null && opts.max != null,
    options: type === "enum" ? opts.options : null,
    defaultValue,
    // Source positions — used by the highlighter and the compiler.
    keywordStart: raw.keywordStart, keywordEnd: raw.keywordEnd,
    nameStart: raw.nameStart, nameEnd: raw.nameEnd,
    initStart: raw.initStart, initEnd: raw.initEnd, hasInit: raw.hasInit,
    optsStart: raw.optsStart, optsEnd: raw.optsEnd,
  };
}

function _prettify(name) {
  const spaced = String(name)
    .replace(/^[_$]+/, "")
    .replace(/[_$]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : String(name);
}

/** Public: every inspect variable in `source` (supported or not), in order. */
export function parseInspectVars(source) {
  return _scan(source).filter((r) => !r.nested).map(_describe);
}

/** Only the ones the Inspector can show. Duplicate names: first wins. */
export function getInspectableVars(source) {
  const seen = new Set();
  const out = [];
  for (const d of parseInspectVars(source)) {
    if (!d.supported || seen.has(d.name)) continue;
    seen.add(d.name);
    out.push(d);
  }
  return out;
}

// ─── Value validation ───────────────────────────────────────────────────────

/**
 * Validates/normalizes a raw value (from the Inspector or saved data) for a
 * descriptor. Returns { ok: true, value } or { ok: false }.
 */
export function coerceInspectValue(desc, raw) {
  if (!desc || !desc.supported) return { ok: false };
  switch (desc.type) {
    case "number":
    case "int": {
      if (raw === "" || raw == null || typeof raw === "boolean") return { ok: false };
      let v = Number(raw);
      if (!Number.isFinite(v)) return { ok: false };
      if (desc.type === "int") v = Math.round(v);
      if (desc.min != null) v = Math.max(desc.min, v);
      if (desc.max != null) v = Math.min(desc.max, v);
      return { ok: true, value: v };
    }
    case "string":
    case "text":
      return typeof raw === "string" ? { ok: true, value: raw } : { ok: false };
    case "boolean":
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true") return { ok: true, value: true };
      if (raw === "false") return { ok: true, value: false };
      return { ok: false };
    case "color":
      return typeof raw === "string" && HEX_COLOR_RX.test(raw) ? { ok: true, value: raw.toLowerCase() } : { ok: false };
    case "vector2": {
      if (!raw || typeof raw !== "object") return { ok: false };
      const x = Number(raw.x);
      const y = Number(raw.y);
      return Number.isFinite(x) && Number.isFinite(y) ? { ok: true, value: { x, y } } : { ok: false };
    }
    case "enum": {
      const hit = desc.options.find((o) => o === raw || String(o) === String(raw));
      return hit !== undefined ? { ok: true, value: hit } : { ok: false };
    }
    case "array": {
      if (!Array.isArray(raw)) return { ok: false };
      if (desc.arrayOf === "string") return raw.every((v) => typeof v === "string") ? { ok: true, value: raw.slice() } : { ok: false };
      const nums = raw.map(Number);
      return nums.every(Number.isFinite) && raw.every((v) => typeof v !== "boolean" && v !== "" && v != null)
        ? { ok: true, value: nums } : { ok: false };
    }
    default:
      return { ok: false };
  }
}

// ─── Source transforms ──────────────────────────────────────────────────────

function _blank(text) {
  return text.replace(/[^\n]/g, " ");
}

/**
 * Blanks `inspect` / `inspect(...)` (same length, same line count). What is
 * left is ordinary JavaScript. Safe to call on any source.
 */
export function stripInspectSyntax(source) {
  if (typeof source !== "string" || source.indexOf(INSPECT_KEYWORD) < 0) return source;
  const decls = _scan(source);
  if (!decls.length) return source;
  let out = source;
  for (let d = decls.length - 1; d >= 0; d--) {
    const { keywordStart, keywordEnd } = decls[d];
    out = out.slice(0, keywordStart) + _blank(out.slice(keywordStart, keywordEnd)) + out.slice(keywordEnd);
  }
  return out;
}

/**
 * Compiler entry point: strips the syntax AND replaces each declaration's
 * initializer with the Inspector value in `values` (name → value) when that
 * value is valid for the variable's detected type. Invalid / missing values
 * fall back to the script's own default.
 */
export function applyInspectValues(source, values) {
  if (typeof source !== "string" || source.indexOf(INSPECT_KEYWORD) < 0) return source;
  const raws = _scan(source);
  if (!raws.length) return source;
  const descs = raws.map((r) => (r.nested ? { supported: false } : _describe(r)));
  let out = source;
  for (let d = raws.length - 1; d >= 0; d--) {
    const raw = raws[d];
    const desc = descs[d];
    // Replace the initializer first (it is after the keyword), then blank the keyword.
    if (values && desc.supported && Object.prototype.hasOwnProperty.call(values, desc.name)) {
      const res = coerceInspectValue(desc, values[desc.name]);
      if (res.ok) {
        const original = out.slice(raw.initStart, raw.initEnd);
        const newlines = (original.match(/\n/g) || []).length;
        const json = JSON.stringify(res.value);
        if (raw.hasInit) {
          out = out.slice(0, raw.initStart) + json + "\n".repeat(newlines) + out.slice(raw.initEnd);
        } else {
          // `inspect({type:"number"}) let x;` — add the initializer.
          out = out.slice(0, raw.nameEnd) + " = " + json + out.slice(raw.nameEnd);
        }
      }
    }
    out = out.slice(0, raw.keywordStart) + _blank(out.slice(raw.keywordStart, raw.keywordEnd)) + out.slice(raw.keywordEnd);
  }
  return out;
}
