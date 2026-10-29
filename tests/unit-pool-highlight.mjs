import assert from "node:assert/strict";
globalThis.document = {
  getElementById: () => ({}),
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
  documentElement: { appendChild() {} },
  createTextNode: () => ({}),
};
const { applyRealotDecorations } = await import("../project/editor/scripting/ScriptHighlighting.js");

const code = `var bullets;
var other = { maxSize: 5, source: "x" };
function onStart() {
  bullets = pool.create("Bullets", {
    source: "Bullet",
    defaultCapacity: 20, // maxSize here is a comment
    onGet(obj) { var o = { maxSize: 1 }; },
    maxSize: 100
  });
  var b = bullets.get(this.x, this.y);
  bullets.release(b);
  pool.get("Bullet", 1, 2);
}`;

const lineStarts = [0]; for (let i = 0; i < code.length; i++) if (code[i] === "\n") lineStarts.push(i + 1);
const model = {
  getValue: () => code,
  isDisposed: () => false,
  getPositionAt: (i) => { let l = 0; while (l + 1 < lineStarts.length && lineStarts[l + 1] <= i) l++; return { lineNumber: l + 1, column: i - lineStarts[l] + 1 }; },
};
let decos = [];
const editor = { getModel: () => model, deltaDecorations: (_old, d) => { decos = d; return []; } };
const monaco = { Range: class { constructor(a, b, c, d) { Object.assign(this, { a, b, c, d }); } } };

applyRealotDecorations(monaco, editor, model, "t");
const words = decos
  .filter((d) => d.options.inlineClassName === "realot-token-member")
  .map((d) => { const s = lineStarts[d.range.a - 1] + d.range.b - 1; const e = lineStarts[d.range.c - 1] + d.range.d - 1; return d.range.a + ":" + code.slice(s, e); });

for (const w of ["4:create", "5:source", "6:defaultCapacity", "7:onGet", "8:maxSize", "10:get", "11:release", "12:get"]) assert.ok(words.includes(w), "expected highlight " + w + " in " + JSON.stringify(words));
for (const w of ["2:maxSize", "2:source", "7:maxSize"]) assert.ok(!words.includes(w), "must NOT highlight " + w);
assert.ok(!words.some((w) => w.startsWith("6:maxSize")), "comment text not highlighted");
console.log("pool highlight: ok");
