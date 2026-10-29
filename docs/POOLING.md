# Object pooling

Reuse bullets, hit effects, coins etc. instead of `spawn()` / `destroy()` every time.
A pool builds a fixed set once, then switches objects off (release) and on (get).

## Quick start

Make a prefab called **Bullet** (Sprite + Rigidbody2D + Collider2D + a script).

**Shooter script**
```js
var bullets;

function onStart() {
  bullets = pool.create("Bullets", {
    source: "Bullet",     // prefab name, scene entity name, or an entity
    defaultCapacity: 20,  // built up front, switched off
    maxSize: 100          // extras are really destroyed on release
  });
}

function onUpdate() {
  if (input.keyPressed("Space")) {
    var b = bullets.get(this.x, this.y);     // or bullets.get({ x: 1, y: 2, rotation: 45 })
    b.rigidbody.velocityX = 600;
  }
}
```

**Bullet script**
```js
function onEnable() {          // runs on EVERY get() (onStart only runs once)
  this.hits = 0;               // reset your own variables here
  this.releaseToPool(2);       // auto-return after 2 seconds
}
function onCollisionEnter(other) {
  this.releaseToPool();        // instead of this.destroy()
}
function onDisable() {}        // runs on every release
```

## API

| Call | What it does |
|---|---|
| `pool.create(name, opts)` | Create a pool (twice with the same name returns the existing one). |
| `pool.find(name)` | Look up a pool, or `null`. |
| `pool.get(name, x, y)` | Shorthand; creates the pool on first use if `name` is a prefab/entity name. |
| `pool.release(obj)` | Return an object to whichever pool owns it. |
| `handle.get(x, y)` / `handle.get({x, y, rotation})` | Take an object, place it, switch it on. |
| `handle.release(obj)`, `handle.prewarm(n)`, `handle.clear()` | Return / pre-build / destroy all switched-off objects. |
| `handle.countActive / countInactive / countAll` | Counters. |
| `this.releaseToPool(delay?)`, `this.isPooled` | From inside the pooled object. |

Options: `source`, `createFunc`, `defaultCapacity` (10), `maxSize` (10000),
`collectionCheck` (true), `resetComponents` (true), `onGet`, `onRelease`, `onDestroy`.

## What gets reset on release

- Rigidbody velocities / pending forces
- Every component except Script (tint, opacity, flip, animation state, ...) back to how it was built
- Tag
- Transform x/y are kept; `get()` sets them. Scale/rotation are restored.
- `wait()` / `repeat()` / `tween()` timers owned by the object are cancelled

**Not** reset: script variables (they live in the script) — use `onEnable()`.
Set `resetComponents: false` if you want objects to keep their changes.

## Notes

- Pools are cleared on `scene.restart()` / `scene.load()`; create them again in `onStart`.
- If `source` is a scene entity, the pool clones it as it is at `create()` time; the original stays in the scene.

## Shooting system (aim at the mouse, hold to fire)

**Player script**
```js
var bullets;
var lastShot = 0;
var FIRE_DELAY = 0.15;   // seconds between shots
var SPEED = 700;

function onStart() {
  bullets = pool.create("Bullets", { source: "Bullet", defaultCapacity: 30, maxSize: 60 });
}

function onUpdate() {
  if (mouse.down(0) && time.elapsed - lastShot >= FIRE_DELAY) {
    lastShot = time.elapsed;

    var dx = mouse.x - this.x;
    var dy = mouse.y - this.y;
    var len = Math.hypot(dx, dy) || 1;

    var b = bullets.get(this.x, this.y);
    b.rotation = Math.atan2(dy, dx) * 180 / Math.PI;   // rotation is in degrees
    b.rigidbody.velocityX = dx / len * SPEED;
    b.rigidbody.velocityY = dy / len * SPEED;
  }
}
```

**Bullet script** (prefab "Bullet": Sprite + Rigidbody2D with gravity scale 0 + Collider2D)
```js
function onEnable() {
  this.releaseToPool(1.5);          // despawn if it hits nothing
}

function onCollisionEnter(other) {
  if (other.tag === "Enemy") other.destroy();   // or damage it
  this.releaseToPool();
}
// If the bullet's collider is a Trigger, use onTriggerEnter(other) instead.
```
Give the Bullet its own physics layer that doesn't collide with the Player so bullets don't hit the shooter.
