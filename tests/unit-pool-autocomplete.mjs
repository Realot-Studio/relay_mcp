import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// ScriptIntelliSense.js pulls in editor/browser modules, so load just the scanner out of the source.
const src = await readFile(new URL("../project/editor/scripting/ScriptIntelliSense.js", import.meta.url), "utf8");
const start = src.indexOf("export function _scanPoolCreateOpts");
const end = src.indexOf("/** Variables assigned from pool.create");
assert.ok(start > 0 && end > start, "scanner not found");
const scan = new Function(src.slice(start, end).replace("export function", "function") + "\nreturn _scanPoolCreateOpts;")();
const optsSrc = src.slice(src.indexOf("const POOL_CREATE_OPTS_API"), src.indexOf("// Members of the handle"));
const labels = [...optsSrc.matchAll(/label: "(\w+)"/g)].map((m) => m[1]);
assert.deepEqual(labels, ["source", "createFunc", "defaultCapacity", "maxSize", "collectionCheck", "resetComponents", "onGet", "onRelease", "onDestroy"]);

// inside the literal
assert.deepEqual([...scan('var p = pool.create("B", { ')], []);
assert.deepEqual([...scan('pool.create("B", { source: "Bullet", ')], ["source"]);
assert.deepEqual([...scan('pool.create("B", {\n  source: "Bullet",\n  maxSize: 5,\n  ')].sort(), ["maxSize", "source"]);
// commas inside strings / nested calls don't count as entries
assert.deepEqual([...scan('pool.create("B", { source: "a, b: c", ')], ["source"]);
// after a finished method entry
assert.deepEqual([...scan('pool.create("B", { onGet(obj) { obj.x = 1; }, ')], ["onGet"]);
// NOT offered: inside a nested function body, nested call, before the literal, or after it closed
assert.equal(scan('pool.create("B", { onGet(obj) { '), null);
assert.equal(scan('pool.create("B", { createFunc: () => spawn("Bullet", '), null);
assert.equal(scan('pool.create("B", '), null);
assert.equal(scan('pool.create("B", { source: "x" }); var a = {'), null);
assert.equal(scan('var a = { '), null);
console.log("pool autocomplete: ok");
