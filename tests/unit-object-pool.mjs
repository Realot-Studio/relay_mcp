import assert from "node:assert/strict";

const { World } = await import("../project/runtime/core/World.js");
const { PoolManager } = await import("../project/runtime/pooling/ObjectPool.js");
const { Transform, TRANSFORM } = await import("../project/runtime/components/Transform.js");
const { SpriteRenderer, SPRITE_RENDERER } = await import("../project/runtime/components/SpriteRenderer.js");

const world = new World();
const log = [];
const api = {
  world,
  createEntityContext: (entity) => ({ _entity: entity, name: entity.name }),
  _poolLifecycleFn: (e, n) => log.push(n + ":" + e.id),
  _poolCancelFn: (id) => log.push("cancel:" + id),
};
const pools = new PoolManager(api);

function make() {
  const e = world.createEntity("Bullet", "Projectile");
  e.addComponent(TRANSFORM, new Transform({ x: 0, y: 0 }));
  e.addComponent(SPRITE_RENDERER, new SpriteRenderer({ opacity: 1, flipX: false }));
  return e;
}

const h = pools.create("B", { createFunc: make, defaultCapacity: 3, maxSize: 3 });
assert.equal(h.countInactive, 3);
assert.equal(h.countActive, 0);
assert.equal(world.query(TRANSFORM).length, 0, "prewarmed objects are switched off");

const a = h.get(10, 20);
assert.equal(a._entity.active, true);
assert.equal(a._entity.getComponent(TRANSFORM).x, 10);
assert.equal(h.countActive, 1);
assert.ok(log.includes("onEnable:" + a._entity.id));

// dirty the object, release, and check it comes back clean
a._entity.getComponent(SPRITE_RENDERER).opacity = 0.2;
a._entity.getComponent(SPRITE_RENDERER).flipX = true;
a._entity.tag = "Dead";
assert.equal(pools.release(a), true);
assert.equal(a._entity.active, false);
assert.equal(h.countInactive, 3);
assert.ok(log.includes("onDisable:" + a._entity.id));
assert.ok(log.includes("cancel:" + a._entity.id));
const spr = a._entity.getComponent(SPRITE_RENDERER);
assert.equal(spr.opacity, 1);
assert.equal(spr.flipX, false);
assert.equal(a._entity.tag, "Projectile");

// double release is rejected, foreign release is rejected
assert.equal(pools.release(a), false);
assert.equal(pools.release({ _entity: make() }), false);

// reuse: same entity comes back, no growth
const b = h.get({ x: 5, y: 6, rotation: 1 });
assert.equal(b._entity.id, a._entity.id);
assert.equal(h.countAll, 3);
assert.equal(b._entity.getComponent(TRANSFORM).rotation, 1);

// grows past capacity, and maxSize destroys extras
const held = [b, h.get(0, 0), h.get(0, 0), h.get(0, 0), h.get(0, 0)];
assert.equal(h.countAll, 5);
for (const o of held) pools.release(o);
assert.equal(h.countInactive, 3, "maxSize caps the inactive list");
assert.equal(h.countAll, 3);

// clear() drops inactive objects
h.clear();
assert.equal(h.countAll, 0);

// clearAll() on scene change
pools.clearAll();
assert.equal(pools.find("B"), null);

console.log("object pool: ok");
