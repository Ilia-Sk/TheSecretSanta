/*
 * Real-time pile of 3D gifts with lightweight rigid-body physics:
 * gravity, corner contacts with restitution + friction (so boxes tumble and land flat),
 * gift-to-gift collisions, grab-and-throw with the pointer, click to drop more gifts.
 * Reuses the gift meshes and shaders from giftRenderer.ts — no dependencies.
 */
import { buildGiftGeometry, compile, webglIsSoftware, MESH_FS, MESH_VS, QUAD_FS, QUAD_VS, rand, type Geo, type Program } from './giftRenderer';
import { bufferDpr, createGLContext, isSoftwareRenderer, nativeDpr, QualityGovernor, releaseGLContext } from './quality';

/** Resolution (× native) when WebGL runs without a GPU: no supersampling, slightly under native. */
const SOFTWARE_SCALE = 0.7;

const DPR_MIN = 1;
const PIXEL_BUDGET = 900_000;
const DPR_MAX = 2;
import { chain, lookAt, perspective, scaling, translation, upper3, type Mat4, type Vec3 } from './math';

type Palette = { paper: Vec3; dots: Vec3; ribbon: Vec3 };

const palettes: Palette[] = [
  { paper: [0.27, 0.008, 0.018], dots: [1.0, 0.74, 0.38], ribbon: [1.0, 0.72, 0.36] },
  { paper: [0.012, 0.12, 0.062], dots: [1.0, 0.76, 0.4], ribbon: [1.0, 0.72, 0.36] },
  { paper: [0.035, 0.037, 0.045], dots: [0.8, 0.82, 0.86], ribbon: [1.0, 0.72, 0.36] },
  { paper: [0.78, 0.72, 0.6], dots: [0.55, 0.05, 0.06], ribbon: [0.5, 0.02, 0.04] },
  { paper: [0.02, 0.05, 0.16], dots: [0.85, 0.87, 0.92], ribbon: [0.9, 0.9, 0.95] },
  { paper: [0.85, 0.42, 0.06], dots: [1.0, 0.95, 0.8], ribbon: [0.27, 0.008, 0.018] }
];

// Gift half-extents (body + closed lid, bow excluded) in model units, centre offset.
const HX = 1.07;
const HY = 0.94;
const HZ = 1.07;
const CENTER_Y = 0.94;
const GRAVITY = -22;
const FLOOR = 0;

type Body = {
  p: Vec3;
  v: Vec3;
  q: [number, number, number, number];
  w: Vec3;
  s: number;
  palette: Palette;
  sleeping: number;
  /** Where the body was when it last moved noticeably (rest detection). */
  anchor: Vec3;
  born: number;
};

type GpuMesh = { pos: WebGLBuffer; nor: WebGLBuffer; idx: WebGLBuffer; count: number };

/* ------------------------------------------------------------ small math */

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

function quatRotate(q: Body['q'], v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const u: Vec3 = [x, y, z];
  const t = mul(cross(u, v), 2);
  return add(add(v, mul(t, w)), cross(u, t));
}

function quatToMat(q: Body['q']): Mat4 {
  const [x, y, z, w] = q;
  const m = new Float32Array(16);
  m[0] = 1 - 2 * (y * y + z * z);
  m[1] = 2 * (x * y + z * w);
  m[2] = 2 * (x * z - y * w);
  m[4] = 2 * (x * y - z * w);
  m[5] = 1 - 2 * (x * x + z * z);
  m[6] = 2 * (y * z + x * w);
  m[8] = 2 * (x * z + y * w);
  m[9] = 2 * (y * z - x * w);
  m[10] = 1 - 2 * (x * x + y * y);
  m[15] = 1;
  return m;
}

function randomQuat(seed: number): Body['q'] {
  const u1 = rand(seed), u2 = rand(seed + 1), u3 = rand(seed + 2);
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(2 * Math.PI * u2), a * Math.cos(2 * Math.PI * u2), b * Math.sin(2 * Math.PI * u3), b * Math.cos(2 * Math.PI * u3)];
}

function invert(m: Mat4): Mat4 {
  const inv = new Float32Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  det = det || 1;
  for (let i = 0; i < 16; i++) inv[i] /= det;
  return inv;
}

function transformPoint(m: Mat4, x: number, y: number, z: number): Vec3 {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
  ];
}

/* --------------------------------------------------------------- renderer */

export type GiftPileOptions = {
  maxGifts?: number;
  interactive?: boolean;
  onContextLost?: () => void;
  /** Width of the floor area in world units (pile spreads within it). */
  width?: number;
  /** Full-quality shading and MSAA even on a software renderer (used to bake the still image). */
  forceFull?: boolean;
};

const PHYSICS_STEP = 1 / 120;
const MAX_STEPS = 12;
/** Seconds a gift must stay still before it sleeps (skips physics until disturbed). */
const SLEEP_AFTER = 0.5;

export class GiftPileRenderer {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private mesh: Program;
  private quad: Program;
  private meshes: Record<'body' | 'bodyRibbon' | 'lid' | 'lidGold', GpuMesh>;
  private quadBuf: WebGLBuffer;
  private bodies: Body[] = [];
  private queue: Array<{ at: number; x: number; s: number }> = [];
  private time = 0;
  private seed = 1;
  private frame = 0;
  private last = 0;
  private running = false;
  private cleanup: Array<() => void> = [];
  private maxGifts: number;
  private halfWidth: number;
  private halfDepth = 2.6;
  private viewProj: Mat4 = new Float32Array(16);
  private eye: Vec3 = [0, 7, 15];
  private grab: { body: Body; target: Vec3; height: number; moved: boolean } | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private onContextLost?: () => void;
  private disposed = false;
  private accumulator = 0;
  private drawOrder: Body[] = [];
  private quality = new QualityGovernor(0.5, () => this.resize(), () => this.onStruggle?.());
  /** Set by the component: called when the GPU cannot keep the scene smooth. */
  onStruggle?: () => void;
  private programsReady = false;
  private software = false;
  private broken = false;

  constructor(canvas: HTMLCanvasElement, options: GiftPileOptions = {}) {
    this.canvas = canvas;
    this.maxGifts = options.maxGifts ?? 24;
    this.halfWidth = (options.width ?? 14) / 2;
    this.onContextLost = options.onContextLost;
    const gl = createGLContext(canvas, options.forceFull || !webglIsSoftware());
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.software = options.forceFull ? false : isSoftwareRenderer(gl);
    // Without a GPU every gift is shaded on the CPU: keep the pile smaller.
    if (this.software) this.maxGifts = Math.min(this.maxGifts, 12);
    this.mesh = compile(gl, MESH_VS, MESH_FS);
    this.quad = compile(gl, QUAD_VS, QUAD_FS);
    const geo = buildGiftGeometry(0.5, 'pile');
    this.meshes = {
      body: this.upload(geo.body),
      bodyRibbon: this.upload(geo.bodyRibbon),
      lid: this.upload(geo.lid),
      lidGold: this.upload(geo.lidGold)
    };
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    if (options.interactive ?? true) this.bindPointer();
    const onLost = (event: Event) => {
      event.preventDefault();
      if (!this.disposed) console.warn('3D pile: браузер сбросил WebGL-контекст (сбой или перегрузка видеокарты).');
      this.stop();
      this.onContextLost?.();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    this.cleanup.push(() => canvas.removeEventListener('webglcontextlost', onLost));
    this.resize();
  }

  /* ------------------------------------------------------------ public */

  /** Queue `count` gifts to rain down, staggered over `spread` seconds. */
  drop(count: number, spread = 1.4) {
    count = Math.min(count, this.maxGifts);
    for (let i = 0; i < count; i++) {
      const r = rand(this.seed++ * 7.13);
      this.queue.push({
        at: this.time + (i / Math.max(1, count)) * spread + rand(this.seed++) * 0.15,
        x: (r - 0.5) * this.halfWidth * 1.5,
        s: 0.45 + rand(this.seed++ * 3.1) * 0.4
      });
    }
  }

  /** Instantly build a settled pile (used for reduced motion). */
  settle(count: number) {
    this.bodies = [];
    this.queue = [];
    this.drop(count, 0.6);
    for (let i = 0; i < 60 * 6; i++) this.step(1 / 60);
    this.renderWhenReady();
  }

  clear() {
    this.bodies = [];
    this.queue = [];
    this.grab = null;
    this.pointerDown = null;
  }

  get element() {
    return this.canvas;
  }

  isLost() {
    return this.disposed || this.broken || this.gl.isContextLost();
  }

  setContextLostHandler(handler: (() => void) | undefined) {
    this.onContextLost = handler;
  }

  /** Reconfigure a pooled renderer for a new mount. */
  configure(width: number, maxGifts: number) {
    this.halfWidth = width / 2;
    this.maxGifts = this.software ? Math.min(maxGifts, 12) : maxGifts;
    this.clear();
  }

  resize() {
    // Layout size, not getBoundingClientRect: CSS transforms (page transitions,
    // parallax scale) must not reallocate the drawing buffer every frame.
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    const dpr = this.software
      ? nativeDpr() * SOFTWARE_SCALE * this.quality.scale
      : bufferDpr(cssW, cssH, DPR_MIN, DPR_MAX, PIXEL_BUDGET, this.quality.scale);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    const changed = this.canvas.width !== w || this.canvas.height !== h;
    if (changed) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const aspect = w / h;
    // Fit the floor width into view regardless of aspect ratio.
    const fov = (32 * Math.PI) / 180;
    const needed = (this.halfWidth + 1.5) / Math.tan(fov / 2) / Math.max(aspect, 0.5);
    const distance = Math.max(8.5, needed * 0.95);
    // keep the floor near the bottom edge whatever the canvas proportions are
    const targetY = distance * Math.tan(fov / 2) * 0.58;
    this.eye = [0, targetY + distance * 0.32, distance];
    const proj = perspective(fov, aspect, 0.1, 100);
    const view = lookAt(this.eye, [0, targetY, 0], [0, 1, 0]);
    this.viewProj = chain(proj, view);
    if (changed && !this.running) this.renderWhenReady();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.quality.frame(now - this.last);
      const elapsed = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (!this.ready()) {
        this.frame = requestAnimationFrame(loop);
        return;
      }
      // Fixed-timestep physics: the simulation advances by real elapsed time no
      // matter the frame rate, so a late frame never turns the fall into slow motion.
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= PHYSICS_STEP && steps < MAX_STEPS) {
        this.step(PHYSICS_STEP);
        this.accumulator -= PHYSICS_STEP;
        steps++;
      }
      if (steps === MAX_STEPS) this.accumulator = 0;
      this.render(elapsed);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /** Free the drawing buffer while the pile is off screen (resize() restores it). */
  releaseBuffer() {
    this.stop();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }

  /** Bake helper: settle `count` gifts and draw them once the shaders are ready. */
  async renderSettled(count: number) {
    await new Promise<void>((resolve, reject) => {
      const poll = () => {
        if (this.ready()) resolve();
        else if (this.broken || this.isLost()) reject(new Error('WebGL pile renderer unavailable'));
        else window.setTimeout(poll, 30);
      };
      poll();
    });
    this.settle(count);
    this.render(0);
  }

  dispose() {
    this.stop();
    if (this.disposed) return;
    this.disposed = true;
    this.cleanup.forEach((fn) => fn());
    const gl = this.gl;
    if (gl.isContextLost()) return;
    Object.values(this.meshes).forEach((m) => {
      gl.deleteBuffer(m.pos);
      gl.deleteBuffer(m.nor);
      gl.deleteBuffer(m.idx);
    });
    gl.deleteBuffer(this.quadBuf);
    gl.deleteProgram(this.mesh.program);
    gl.deleteProgram(this.quad.program);
    releaseGLContext(gl);
  }

  /* ----------------------------------------------------------- physics */

  private spawn(x: number, s: number) {
    if (this.bodies.length >= this.maxGifts) this.bodies.shift();
    const seed = this.seed++;
    this.bodies.push({
      p: [x, 9 + rand(seed) * 4, (rand(seed + 9) - 0.5) * this.halfDepth],
      v: [(rand(seed + 3) - 0.5) * 3, -2, (rand(seed + 4) - 0.5) * 1.5],
      q: randomQuat(seed * 1.7),
      w: [(rand(seed + 5) - 0.5) * 6, (rand(seed + 6) - 0.5) * 4, (rand(seed + 7) - 0.5) * 6],
      s,
      palette: palettes[Math.floor(rand(seed + 11) * palettes.length) % palettes.length],
      sleeping: 0,
      anchor: [x, 99, 0],
      born: this.time
    });
  }

  private step(dt: number) {
    this.time += dt;
    while (this.queue.length && this.queue[0].at <= this.time) {
      const next = this.queue.shift()!;
      this.spawn(next.x, next.s);
    }
    this.queue.sort((a, b) => a.at - b.at);

    for (const b of this.bodies) {
      const held = this.grab?.body === b;
      if (b.sleeping >= SLEEP_AFTER && !held) {
        // asleep: stays put until a toss or a collision gives it velocity
        if (Math.abs(b.v[0]) + Math.abs(b.v[1]) + Math.abs(b.v[2]) + Math.abs(b.w[0]) + Math.abs(b.w[1]) + Math.abs(b.w[2]) < 1e-3) continue;
        b.sleeping = 0;
      }
      if (held && this.grab) {
        // Kinematic spring towards the pointer target; keeps throw velocity on release.
        const toTarget = sub(this.grab.target, b.p);
        b.v = add(mul(b.v, 0.6), mul(toTarget, 14 * 0.4));
        b.w = mul(b.w, 0.9);
      } else {
        b.v[1] += GRAVITY * dt;
      }
      b.p = add(b.p, mul(b.v, dt));
      // integrate orientation
      const [x, y, z, w] = b.q;
      const [wx, wy, wz] = b.w;
      const h = dt * 0.5;
      b.q = [
        x + h * (wx * w + wy * z - wz * y),
        y + h * (wy * w + wz * x - wx * z),
        z + h * (wz * w + wx * y - wy * x),
        w + h * (-wx * x - wy * y - wz * z)
      ];
      const ql = Math.hypot(...b.q) || 1;
      b.q = [b.q[0] / ql, b.q[1] / ql, b.q[2] / ql, b.q[3] / ql];
      b.v = mul(b.v, 1 - 0.15 * dt);
      b.w = mul(b.w, 1 - 0.6 * dt);
      this.floorContacts(b);
      this.walls(b);
      // Rest detection by displacement: the contact solver leaves a small
      // velocity jitter on resting boxes, but they don't actually go anywhere.
      const drift = Math.hypot(b.p[0] - b.anchor[0], b.p[1] - b.anchor[1], b.p[2] - b.anchor[2]);
      if (!held && drift < 0.03 * b.s && len(b.w) < 0.6) {
        b.sleeping += dt;
        if (b.sleeping >= SLEEP_AFTER) {
          b.v = [0, 0, 0];
          b.w = [0, 0, 0];
        }
      } else {
        b.anchor = [b.p[0], b.p[1], b.p[2]];
        b.sleeping = 0;
      }
    }

    // gift-to-gift collisions (sphere proxies)
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i];
        const c = this.bodies[j];
        if (a.sleeping >= SLEEP_AFTER && c.sleeping >= SLEEP_AFTER) continue;
        const ra = a.s * 1.12;
        const rc = c.s * 1.12;
        const d = sub(c.p, a.p);
        const dist = len(d);
        const minDist = ra + rc;
        if (dist <= 0 || dist >= minDist) continue;
        const n = mul(d, 1 / dist);
        const overlap = minDist - dist;
        const rel = dot(sub(c.v, a.v), n);
        let aStatic = a.sleeping >= SLEEP_AFTER;
        let cStatic = c.sleeping >= SLEEP_AFTER;
        // A sleeping gift is a fixed obstacle for resting neighbours; only a real hit wakes it.
        if ((aStatic || cStatic) && rel < -1.2) {
          a.sleeping = 0;
          c.sleeping = 0;
          aStatic = cStatic = false;
        }
        const ma = a.s ** 3;
        const mc = c.s ** 3;
        const invA = aStatic ? 0 : 1 / ma;
        const invC = cStatic ? 0 : 1 / mc;
        const ka = invA / (invA + invC);
        const kc = invC / (invA + invC);
        if (ka > 0) a.p = sub(a.p, mul(n, overlap * ka));
        if (kc > 0) c.p = add(c.p, mul(n, overlap * kc));
        if (rel < 0) {
          const j2 = -(1.3 * rel) / (invA + invC);
          if (invA) a.v = sub(a.v, mul(n, j2 * invA));
          if (invC) c.v = add(c.v, mul(n, j2 * invC));
          // a little spin from glancing hits
          const tangent = sub(sub(c.v, a.v), mul(n, dot(sub(c.v, a.v), n)));
          if (invA) a.w = add(a.w, mul(cross(n, tangent), 0.15));
          if (invC) c.w = sub(c.w, mul(cross(n, tangent), 0.15));
        }
      }
    }
  }

  private floorContacts(b: Body) {
    const s = b.s;
    let deepest = 0;
    const invMass = 1 / (s ** 3);
    // Approximate inertia of a cube-ish box: I = m * (2 * h^2) / 3
    const invInertia = 1 / ((s ** 3) * (2 * (s * 1.0) ** 2) / 3);
    for (let ix = -1; ix <= 1; ix += 2) {
      for (let iy = -1; iy <= 1; iy += 2) {
        for (let iz = -1; iz <= 1; iz += 2) {
          const r = quatRotate(b.q, [ix * HX * s, iy * HY * s, iz * HZ * s]);
          const py = b.p[1] + r[1];
          if (py >= FLOOR) continue;
          deepest = Math.max(deepest, FLOOR - py);
          const vContact = add(b.v, cross(b.w, r));
          const vn = vContact[1];
          if (vn >= 0) continue;
          const n: Vec3 = [0, 1, 0];
          const rn = cross(r, n);
          const denom = invMass + dot(rn, rn) * invInertia;
          const e = Math.abs(vn) > 3 ? 0.32 : 0.05;
          const jn = (-(1 + e) * vn) / denom / 2.5;
          b.v = add(b.v, mul(n, jn * invMass));
          b.w = add(b.w, mul(cross(r, mul(n, jn)), invInertia));
          // friction
          const vt: Vec3 = [vContact[0], 0, vContact[2]];
          const vtl = len(vt);
          if (vtl > 1e-4) {
            const t = mul(vt, -1 / vtl);
            const rt = cross(r, t);
            const jtMax = 0.6 * jn;
            const jt = Math.min(vtl / (invMass + dot(rt, rt) * invInertia) / 2.5, jtMax);
            b.v = add(b.v, mul(t, jt * invMass));
            b.w = add(b.w, mul(cross(r, mul(t, jt)), invInertia));
          }
        }
      }
    }
    if (deepest > 0) {
      b.p[1] += deepest;
      // resting: bleed energy so piles settle instead of jittering
      if (len(b.v) < 0.6 && len(b.w) < 0.8) {
        b.v = mul(b.v, 0.85);
        b.w = mul(b.w, 0.85);
      }
    }
  }

  private walls(b: Body) {
    const r = b.s * 1.1;
    const lim: Vec3 = [this.halfWidth - r, 0, this.halfDepth - r];
    for (const axis of [0, 2] as const) {
      if (b.p[axis] < -lim[axis]) {
        b.p[axis] = -lim[axis];
        b.v[axis] = Math.abs(b.v[axis]) * 0.4;
      } else if (b.p[axis] > lim[axis]) {
        b.p[axis] = lim[axis];
        b.v[axis] = -Math.abs(b.v[axis]) * 0.4;
      }
    }
  }

  /* ------------------------------------------------------------ pointer */

  private ray(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    const inv = invert(this.viewProj);
    const near = transformPoint(inv, nx, ny, -1);
    const far = transformPoint(inv, nx, ny, 1);
    const dir = sub(far, near);
    return { origin: near, dir: mul(dir, 1 / (len(dir) || 1)) };
  }

  private bindPointer() {
    const canvas = this.canvas;
    const onDown = (event: PointerEvent) => {
      this.pointerDown = { x: event.clientX, y: event.clientY };
      const { origin, dir } = this.ray(event);
      let best: Body | null = null;
      let bestT = Infinity;
      for (const b of this.bodies) {
        const oc = sub(b.p, origin);
        const t = dot(oc, dir);
        if (t < 0) continue;
        const closest = add(origin, mul(dir, t));
        if (len(sub(closest, b.p)) < b.s * 1.3 && t < bestT) {
          best = b;
          bestT = t;
        }
      }
      if (best) {
        this.grab = { body: best, target: [...best.p] as Vec3, height: Math.max(best.p[1] + 1.6, 2.5), moved: false };
        canvas.setPointerCapture?.(event.pointerId);
        canvas.classList.add('is-grabbing');
        event.preventDefault();
      }
    };
    const onMove = (event: PointerEvent) => {
      if (!this.grab) return;
      const { origin, dir } = this.ray(event);
      // intersect with a camera-facing vertical plane through the gift (z = body z)
      const planeZ = this.grab.body.p[2];
      const t = Math.abs(dir[2]) > 1e-4 ? (planeZ - origin[2]) / dir[2] : 0;
      const hit = add(origin, mul(dir, t));
      this.grab.target = [hit[0], Math.max(hit[1], this.grab.body.s * 1.2), planeZ];
      this.grab.moved = true;
    };
    const onUp = (event: PointerEvent) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (this.grab) {
        canvas.releasePointerCapture?.(event.pointerId);
        canvas.classList.remove('is-grabbing');
        const b = this.grab.body;
        if (!this.grab.moved) {
          // tap: toss it up with a spin
          b.v = add(b.v, [(Math.random() - 0.5) * 3, 11, (Math.random() - 0.5) * 2]);
          b.w = add(b.w, [(Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10]);
        }
        this.grab = null;
        return;
      }
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6) {
        // click on empty space: drop a new gift right there
        const { origin, dir } = this.ray(event);
        const t = Math.abs(dir[2]) > 1e-4 ? (0 - origin[2]) / dir[2] : 0;
        const hit = add(origin, mul(dir, t));
        this.queue.push({ at: this.time, x: Math.max(-this.halfWidth + 1, Math.min(this.halfWidth - 1, hit[0])), s: 0.45 + Math.random() * 0.4 });
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    this.cleanup.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    });
  }

  /* ------------------------------------------------------------- render */

  private upload(geo: Geo): GpuMesh {
    const gl = this.gl;
    const pos = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.pos), gl.STATIC_DRAW);
    const nor = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, nor);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.nor), gl.STATIC_DRAW);
    const idx = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.idx), gl.STATIC_DRAW);
    return { pos, nor, idx, count: geo.idx.length };
  }

  private attrib(location: number, buffer: WebGLBuffer, size: number) {
    if (location < 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  /** Draw a single still frame as soon as the shaders are ready (reduced motion, paused). */
  private renderWhenReady(dt = 0) {
    if (this.ready()) {
      this.render(dt);
      return;
    }
    if (this.broken || this.isLost()) return;
    window.setTimeout(() => {
      if (!this.running) this.renderWhenReady(dt);
    }, 50);
  }

  /** Poll the asynchronously compiling shaders; physics and drawing wait for them. */
  private ready() {
    if (this.programsReady) return true;
    if (this.broken) return false;
    try {
      this.programsReady = this.mesh.ready() && this.quad.ready();
    } catch (err) {
      console.warn('3D pile shaders failed:', err);
      this.broken = true;
      this.stop();
      this.onContextLost?.();
    }
    return this.programsReady;
  }

  private render(_dt: number) {
    const gl = this.gl;
    if (gl.isContextLost() || !this.ready()) return;
    if (!this.canvas.classList.contains('is-ready')) requestAnimationFrame(() => this.canvas.classList.add('is-ready'));
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // soft contact shadows
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const q = this.quad;
    gl.useProgram(q.program);
    gl.uniformMatrix4fv(q.u('uViewProj'), false, this.viewProj);
    gl.uniform1f(q.u('uFloor'), 1);
    gl.uniform3fv(q.u('uColor'), [0, 0, 0]);
    gl.uniform1f(q.u('uTime'), this.time);
    this.attrib(q.attrib('aUv'), this.quadBuf, 2);
    for (const b of this.bodies) {
      const height = Math.max(0, b.p[1] - b.s * CENTER_Y);
      const k = Math.max(0, 1 - height / 8);
      gl.uniform3fv(q.u('uCenter'), [b.p[0], 0.002, b.p[2]]);
      gl.uniform2fv(q.u('uSize'), [b.s * 4.4 * (1 + height * 0.08), b.s * 4.4 * (1 + height * 0.08)]);
      gl.uniform1f(q.u('uStrength'), 0.5 * k);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    const p = this.mesh;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u('uViewProj'), false, this.viewProj);
    gl.uniform3fv(p.u('uCam'), this.eye);
    gl.uniform3fv(p.u('uGlowColor'), [1, 0.8, 0.45]);
    gl.uniform1f(p.u('uTopY'), 1.45);
    gl.uniform1f(p.u('uGlowTop'), 0);
    gl.uniform1f(p.u('uInnerLight'), 0);
    gl.uniform1f(p.u('uLite'), this.software ? 1 : 0);

    // Front-to-back: nearer gifts fill the depth buffer first, so pixels of
    // gifts hidden behind them are rejected before the expensive shading.
    const eye = this.eye;
    const order = this.drawOrder;
    order.length = 0;
    for (const b of this.bodies) order.push(b);
    order.sort((a, c) => {
      const da = (a.p[0] - eye[0]) ** 2 + (a.p[1] - eye[1]) ** 2 + (a.p[2] - eye[2]) ** 2;
      const dc = (c.p[0] - eye[0]) ** 2 + (c.p[1] - eye[1]) ** 2 + (c.p[2] - eye[2]) ** 2;
      return da - dc;
    });
    for (const b of order) {
      const model = chain(translation(b.p[0], b.p[1], b.p[2]), quatToMat(b.q), scaling(b.s, b.s, b.s), translation(0, -CENTER_Y, 0));
      const lidModel = chain(model, translation(0, 1.54, 0));
      const paper = { color: b.palette.paper, metal: 0, rough: 0.44, clear: 0.55, pattern: 1, dots: b.palette.dots };
      const ribbon = { color: b.palette.ribbon, metal: 1, rough: 0.26, clear: 0, pattern: 0, dots: b.palette.dots };
      this.draw(this.meshes.body, model, paper);
      this.draw(this.meshes.bodyRibbon, model, ribbon);
      this.draw(this.meshes.lid, lidModel, paper);
      this.draw(this.meshes.lidGold, lidModel, ribbon);
    }
  }

  private draw(mesh: GpuMesh, model: Mat4, mat: { color: Vec3; metal: number; rough: number; clear: number; pattern: number; dots: Vec3 }) {
    const gl = this.gl;
    const p = this.mesh;
    gl.uniformMatrix4fv(p.u('uModel'), false, model);
    gl.uniformMatrix3fv(p.u('uNormalMat'), false, upper3(model));
    gl.uniform3fv(p.u('uColor'), mat.color);
    gl.uniform1f(p.u('uMetal'), mat.metal);
    gl.uniform1f(p.u('uRough'), mat.rough);
    gl.uniform1f(p.u('uClear'), mat.clear);
    gl.uniform1f(p.u('uPattern'), mat.pattern);
    gl.uniform3fv(p.u('uPatternColor'), mat.dots);
    this.attrib(p.attrib('aPos'), mesh.pos, 3);
    this.attrib(p.attrib('aNor'), mesh.nor, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }
}
