/**
 * runtime/pooling/ObjectPool.js
 *
 * Unity-style object pooling (UnityEngine.Pool.ObjectPool<T>) for entities.
 *
 * Why: spawn()/destroy() in a hot loop (bullets, hit effects, coins) builds a
 * brand-new entity, sprite and physics body every time and throws them all
 * away again, which causes hitches and garbage-collection spikes. A pool
 * builds a fixed set once, then just switches them off (release) and back on
 * (get) — the same idea as Unity's GameObject.SetActive(false) pooling.
 *
 * HOW A "SWITCHED OFF" OBJECT BEHAVES (this is the engine's own behaviour for
 * `entity.active = false`, nothing pool-specific):
 *   - world.query() skips it, so RenderSystem removes its sprite and
 *     PhysicsWorld removes its Rapier body — no drawing, no collisions.
 *   - ScriptSystem skips its onUpdate/onFixedUpdate.
 *   - Switching it back on rebuilds the sprite/body from the components'
 *     stored data, at the Transform position.
 *
 * Script lifecycle added for pooled objects (Unity names):
 *   onEnable()  — every time get() switches the object on (before onStart on
 *                 its very first use, like Unity's OnEnable)
 *   onDisable() — every time release() switches it off
 *
 * RUNTIME-ONLY FILE.
 */

import { serializeEntity, instantiateEntity } from "../scene/SceneSerializer.js";
import { getAllPrefabs } from "../prefabs/PrefabRegistry.js";
import { TRANSFORM } from "../components/Transform.js";
import { RIGIDBODY_2D } from "../components/Rigidbody2D.js";
import { SCRIPT } from "../components/Script.js";

const DEFAULT_CAPACITY = 10;
const DEFAULT_MAX_SIZE = 10000; // same default as Unity's ObjectPool

function warn(msg) {
  if (typeof console !== "undefined") console.warn("[pool] " + msg);
}

/** Zero everything a rigidbody carries between uses, so a recycled bullet doesn't keep its old speed. */
function resetRigidbody(entity) {
  const rb = entity.getComponent(RIGIDBODY_2D);
  if (!rb) return;
  const zero = [
    "velocityX", "velocityY", "angularVelocity",
    "driveVelocityX", "driveVelocityY", "driveAngularVelocity",
    "resolvedVelocityX", "resolvedVelocityY",
    "pendingForceX", "pendingForceY", "pendingImpulseX", "pendingImpulseY",
    "pendingTorque", "pendingAngularImpulse",
  ];
  for (const f of zero) if (typeof rb[f] === "number") rb[f] = 0;
  rb.pendingMoveX = null;
  rb.pendingMoveY = null;
}

/**
 * Puts every component (except Script and Transform position) back to the data
 * it had when the object was first built, so a recycled object doesn't keep
 * its old tint, opacity, flip, animation frame, tag, etc. Components are plain
 * data, so assigning the snapshot's fields back is safe. Script variables live
 * in the script's own closure and can't be reset from here — use onEnable().
 */
function restoreFromSnapshot(entity, snap) {
  if (!snap) return;
  entity.tag = snap.tag;
  for (const [type, data] of Object.entries(snap.components || {})) {
    if (type === SCRIPT) continue;
    const comp = entity.getComponent(type);
    if (!comp) continue;
    const fresh = JSON.parse(JSON.stringify(data));
    if (type === TRANSFORM) { delete fresh.x; delete fresh.y; }
    Object.assign(comp, fresh);
  }
}

class Pool {
  /**
   * @param {PoolManager} manager
   * @param {string} name
   * @param {object} opts see PoolManager.create()
   * @param {{data:object, prefabId:(string|null)}|null} template
   */
  constructor(manager, name, opts, template) {
    this.manager = manager;
    this.name = name;
    this.opts = opts;
    this.template = template;
    /** @type {import('../core/Entity.js').Entity[]} switched-off objects, newest last */
    this.inactive = [];
    /** @type {Set<string>} entity ids currently handed out */
    this.activeIds = new Set();
    /** @type {Set<string>} every entity id this pool owns */
    this.allIds = new Set();
    this.maxSize = Math.max(0, Math.floor(opts.maxSize));
    this.collectionCheck = opts.collectionCheck !== false;
    this.resetComponents = opts.resetComponents !== false;
    /** @type {Map<string, object>} entity id -> component data from when it was built */
    this.snapshots = new Map();
  }

  get world() { return this.manager.world; }

  _build() {
    let entity = null;
    if (typeof this.opts.createFunc === "function") {
      const made = this.opts.createFunc();
      entity = made && made._entity ? made._entity : made;
    } else if (this.template) {
      entity = instantiateEntity(this.world, this.template.data);
      entity.prefabId = this.template.prefabId || null;
      entity.__isClone = true; // so onClone()/onStart() fire like any spawn()
    }
    if (!entity || !entity.id) { warn('"' + this.name + '" could not create an object.'); return null; }
    this.allIds.add(entity.id);
    this.manager.byEntity.set(entity.id, this);
    if (this.resetComponents) this.snapshots.set(entity.id, serializeEntity(entity));
    return entity;
  }

  _forget(entity) {
    this.allIds.delete(entity.id);
    this.activeIds.delete(entity.id);
    this.snapshots.delete(entity.id);
    this.manager.byEntity.delete(entity.id);
  }

  /** Pre-creates `count` switched-off objects (nothing draws or simulates until get()). */
  prewarm(count) {
    const n = Math.max(0, Math.floor(count) || 0);
    for (let i = 0; i < n && this.inactive.length < this.maxSize; i++) {
      const e = this._build();
      if (!e) break;
      e.active = false;
      this.inactive.push(e);
    }
  }

  /**
   * Takes an object out of the pool (creating one only if none is free),
   * places it, switches it on and returns its script context.
   * get(x, y) or get({ x, y, rotation })
   */
  get(a, b) {
    const o = a && typeof a === "object" ? a : { x: a, y: b };
    let entity = null;
    while (this.inactive.length) {
      const e = this.inactive.pop();
      if (this.world.getEntity(e.id) && !this.world.isPendingDestroy(e.id)) { entity = e; break; }
      this._forget(e); // destroyed behind our back (scene change, manual destroy)
    }
    if (!entity) {
      entity = this._build();
      if (!entity) return null;
    }
    const t = entity.getComponent(TRANSFORM);
    if (t) {
      if (typeof o.x === "number") t.x = o.x;
      if (typeof o.y === "number") t.y = o.y;
      if (typeof o.rotation === "number") t.rotation = o.rotation;
    }
    resetRigidbody(entity);
    entity.active = true;
    this.activeIds.add(entity.id);
    this.manager.api._poolLifecycleFn && this.manager.api._poolLifecycleFn(entity, "onEnable");
    const ctx = this.manager.api.createEntityContext(entity);
    if (typeof this.opts.onGet === "function") {
      try { this.opts.onGet.call(ctx, ctx); } catch (err) { console.error("[pool] onGet threw:", err); }
    }
    return ctx;
  }

  /** Puts an object back. Returns true if it was released. */
  release(target) {
    const entity = target && target._entity ? target._entity : target;
    if (!entity || !this.allIds.has(entity.id)) { warn('release(): object does not belong to pool "' + this.name + '".'); return false; }
    if (!this.activeIds.has(entity.id)) {
      if (this.collectionCheck) warn('release(): object is already in pool "' + this.name + '" (released twice?).');
      return false;
    }
    const ctx = this.manager.api.createEntityContext(entity);
    this.manager.api._poolLifecycleFn && this.manager.api._poolLifecycleFn(entity, "onDisable");
    // Unity stops an object's coroutines when it is deactivated; the
    // equivalent here is cancelling its wait()/repeat()/tween() timers.
    this.manager.api._poolCancelFn && this.manager.api._poolCancelFn(entity.id);
    resetRigidbody(entity);
    if (this.resetComponents) restoreFromSnapshot(entity, this.snapshots.get(entity.id));
    this.activeIds.delete(entity.id);
    if (typeof this.opts.onRelease === "function") {
      try { this.opts.onRelease.call(ctx, ctx); } catch (err) { console.error("[pool] onRelease threw:", err); }
    }
    if (this.inactive.length >= this.maxSize) {
      // Pool is full: really destroy it (Unity's actionOnDestroy path).
      if (typeof this.opts.onDestroy === "function") {
        try { this.opts.onDestroy.call(ctx, ctx); } catch (err) { console.error("[pool] onDestroy threw:", err); }
      }
      this._forget(entity);
      this.world.queueDestroy(entity.id);
    } else {
      entity.active = false;
      this.inactive.push(entity);
    }
    return true;
  }

  /** Destroys every switched-off object (Unity's pool.Clear()). Objects still in use are untouched. */
  clear() {
    for (const e of this.inactive) {
      if (typeof this.opts.onDestroy === "function") {
        try { this.opts.onDestroy.call(null, this.manager.api.createEntityContext(e)); } catch (err) { console.error("[pool] onDestroy threw:", err); }
      }
      this._forget(e);
      if (this.world.getEntity(e.id)) this.world.queueDestroy(e.id);
    }
    this.inactive.length = 0;
  }

  /** The object scripts hold: pool.create() returns this. */
  handle() {
    const self = this;
    return {
      get name() { return self.name; },
      get: function (x, y) { return self.get(x, y); },
      release: function (obj) { return self.release(obj); },
      prewarm: function (n) { self.prewarm(n); },
      clear: function () { self.clear(); },
      get countInactive() { return self.inactive.length; },
      get countActive() { return self.activeIds.size; },
      get countAll() { return self.allIds.size; },
    };
  }
}

export class PoolManager {
  /** @param {object} api the ScriptAPI instance (world, createEntityContext, lifecycle hooks) */
  constructor(api) {
    this.api = api;
    /** @type {Map<string, Pool>} */
    this.pools = new Map();
    /** @type {Map<string, Pool>} entity id -> owning pool */
    this.byEntity = new Map();
  }

  get world() { return this.api.world; }

  /** Looks `source` up as: script context, entity, prefab name, then scene entity name. */
  _resolveTemplate(source) {
    if (!source) return null;
    if (typeof source === "object") {
      const entity = source._entity || source;
      if (entity && entity.components) return { data: serializeEntity(entity), prefabId: entity.prefabId || null };
      return null;
    }
    const name = String(source);
    const prefabs = getAllPrefabs();
    let rec = prefabs.find((p) => p.name === name) || prefabs.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (rec) return { data: JSON.parse(JSON.stringify(rec.sceneData)), prefabId: rec.id };
    const entity = this.world.findFirstByName(name);
    if (entity) return { data: serializeEntity(entity), prefabId: entity.prefabId || null };
    return null;
  }

  /**
   * pool.create(name, options) — Unity's `new ObjectPool<T>(...)`.
   * options:
   *   source           prefab name, entity name, or an entity (what to clone) — OR —
   *   createFunc       function returning a new entity (e.g. () => spawn("Bullet"))
   *   defaultCapacity  how many to pre-create right now (default 10)
   *   maxSize          most switched-off objects kept; extras are destroyed (default 10000)
   *   collectionCheck  warn on releasing the same object twice (default true)
   *   resetComponents  on release, restore tint/opacity/flip/animation/tag etc. to how the
   *                    object was first built (default true; Script variables are not touched — use onEnable)
   *   onGet(obj) / onRelease(obj) / onDestroy(obj)   Unity's actionOnGet/Release/Destroy
   * Returns the pool handle (get, release, prewarm, clear, countActive, countInactive, countAll).
   */
  create(name, options) {
    const o = options || {};
    const key = String(name);
    const existing = this.pools.get(key);
    if (existing) return existing.handle(); // creating twice is harmless, like looking it up
    let template = null;
    if (typeof o.createFunc !== "function") {
      template = this._resolveTemplate(o.source !== undefined ? o.source : key);
      if (!template) {
        warn('create("' + key + '"): no prefab or entity named "' + (o.source !== undefined ? o.source : key) + '" to clone.');
        return null;
      }
    }
    const pool = new Pool(
      this,
      key,
      {
        createFunc: o.createFunc,
        onGet: o.onGet,
        onRelease: o.onRelease,
        onDestroy: o.onDestroy,
        collectionCheck: o.collectionCheck,
        resetComponents: o.resetComponents,
        maxSize: typeof o.maxSize === "number" ? o.maxSize : DEFAULT_MAX_SIZE,
      },
      template
    );
    this.pools.set(key, pool);
    pool.prewarm(typeof o.defaultCapacity === "number" ? o.defaultCapacity : DEFAULT_CAPACITY);
    return pool.handle();
  }

  find(name) {
    const p = this.pools.get(String(name));
    return p ? p.handle() : null;
  }

  /** pool.get("Name", x, y) — shorthand; pool must exist (or `name` must be a prefab/entity name, in which case it is created on first use). */
  get(name, a, b) {
    let p = this.pools.get(String(name));
    if (!p) {
      const h = this.create(name, {});
      if (!h) return null;
      p = this.pools.get(String(name));
    }
    return p.get(a, b);
  }

  /** pool.release(obj) — finds the owning pool automatically. */
  release(target) {
    const entity = target && target._entity ? target._entity : target;
    const p = entity && this.byEntity.get(entity.id);
    if (!p) { warn("release(): that object was not created by a pool."); return false; }
    return p.release(entity);
  }

  /** True if this entity belongs to a pool. */
  isPooled(entityId) { return this.byEntity.has(entityId); }

  /** Forget everything — the World was cleared (scene restart / scene.load). */
  clearAll() {
    this.pools.clear();
    this.byEntity.clear();
  }
}
