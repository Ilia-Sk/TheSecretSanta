/*
 * Image-sequence gift (the Apple product-page technique).
 *
 * The gift is pre-rendered by the real WebGL renderer (GiftRenderer.renderPose) in
 * full quality: a 48-frame turntable and a 20-frame lid opening per tone, packed
 * into WebP sprite sheets in /public/gift-frames. This player draws those frames
 * on a plain 2D canvas, with the same motion model as the live renderer: drag
 * with inertia, slow auto-rotation, cursor parallax, floating, the shake + spring
 * lid pop, sparkles, and scroll-scrubbed progress. No WebGL context is created,
 * so it keeps working on machines whose GPU keeps dropping contexts.
 *
 * Re-baking the frames (after changing the gift's look): scripts/gift-frames/README.md.
 */
import { chain, lookAt, perspective, type Vec3 } from './math';
import { FRAME_H, FRAME_SHEETS, FRAME_W, type FrameSheet } from './giftFramesData';
import type { GiftTone } from './giftRenderer';

/** Spin at which the lid-opening frames were rendered (the story scene opens the lid there). */
const OPEN_SPIN = 0.55 * Math.PI * 1.35;
const TAU = Math.PI * 2;
/** Camera aspect the frames were rendered with; wider containers frame the gift identically. */
const FRAME_ASPECT = FRAME_W / FRAME_H;

const sheetCache = new Map<string, Promise<HTMLImageElement>>();

function sheetUrl(name: string) {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return `${base}gift-frames/${name}.webp`;
}

/** Load (once per page) and decode a sprite sheet. */
export function loadSheet(name: string): Promise<HTMLImageElement> {
  let promise = sheetCache.get(name);
  if (!promise) {
    promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        // decode() keeps the first draw from stalling the main thread
        (img.decode ? img.decode().catch(() => undefined) : Promise.resolve()).then(() => resolve(img));
      };
      img.onerror = () => {
        sheetCache.delete(name);
        reject(new Error(`gift frames: failed to load ${img.src}`));
      };
      img.src = sheetUrl(name);
    });
    sheetCache.set(name, promise);
  }
  return promise;
}

/** Start downloading the frames for a tone early (e.g. on hover of a link that shows a gift). */
export function preloadGiftFrames(tone: GiftTone = 'red', withOpening = false) {
  loadSheet(`turn-${tone}`).catch(() => undefined);
  if (withOpening) loadSheet(`open-${tone}`).catch(() => undefined);
}

/* ------------------------------------------------- camera (same as GiftRenderer) */

type Projected = { x: number; y: number };

/** Project a world point with the renderer's camera for a given lid lift, into virtual-frame pixels. */
function project(point: Vec3, lift: number): Projected {
  const fov = (28 * Math.PI) / 180;
  const distance = 7.7 + lift * 1.9;
  const eye: Vec3 = [0, 2.6 * 0.9 + lift * 0.4, distance];
  const target: Vec3 = [0, 1.05 + lift * 0.55, 0];
  const m = chain(perspective(fov, FRAME_ASPECT, 0.1, 60), lookAt(eye, target, [0, 1, 0]));
  const [x, y, z] = point;
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return { x: (cx / cw * 0.5 + 0.5) * FRAME_W, y: (1 - (cy / cw * 0.5 + 0.5)) * FRAME_H };
}

type Floor = { cx: number; cy: number; rx: number; ry: number; unit: number; lidX: number; lidY: number };
const floorCache = new Map<number, Floor>();

/** Floor-shadow ellipse and a few anchor points for a lid lift (cached per 1/20 step). */
function floorFor(lift: number): Floor {
  const key = Math.round(Math.max(0, Math.min(1, lift)) * 20);
  let floor = floorCache.get(key);
  if (!floor) {
    const l = key / 20;
    const c = project([0, 0, 0], l);
    const right = project([2.3, 0, 0], l);
    const near = project([0, 0, 2.3], l);
    const far = project([0, 0, -2.3], l);
    const up = project([0, 1, 0], l);
    const lid = project([0, 1.5, 0], l);
    floor = {
      cx: c.x,
      cy: (near.y + far.y) / 2,
      rx: Math.abs(right.x - c.x),
      ry: Math.abs(near.y - far.y) / 2,
      unit: Math.abs(c.y - up.y),
      lidX: lid.x,
      lidY: lid.y
    };
    floorCache.set(key, floor);
  }
  return floor;
}

/**
 * Where the renderer's virtual frame (FRAME_W × FRAME_H) lands in a container of
 * the given CSS size: the same framing GiftRenderer uses for that aspect ratio.
 */
export function virtualFrame(cssW: number, cssH: number) {
  const aspect = cssW / Math.max(1, cssH);
  const fit = aspect < FRAME_ASPECT ? Math.pow(FRAME_ASPECT / aspect, 0.92) : 1;
  const h = cssH / fit;
  const w = h * FRAME_ASPECT;
  return { x: (cssW - w) / 2, y: (cssH - h) / 2, w, h };
}

/** Looping turntable videos exist only for Chromium-based browsers (VP9 with alpha). */
export function canPlayGiftLoop(): boolean {
  try {
    const nav = navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string }> } };
    const chromium = nav.userAgentData?.brands?.some((b) => /chromium/i.test(b.brand)) ?? /Chrome\//.test(navigator.userAgent);
    if (!chromium) return false;
    return document.createElement('video').canPlayType('video/webm; codecs="vp9"') !== '';
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------- sparkles */

type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number; tw: number };

let sparkSprite: HTMLCanvasElement | null = null;
function sparkle(): HTMLCanvasElement {
  if (sparkSprite) return sparkSprite;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  glow.addColorStop(0, 'rgba(255, 236, 190, 1)');
  glow.addColorStop(0.18, 'rgba(255, 210, 130, 0.85)');
  glow.addColorStop(0.5, 'rgba(255, 180, 90, 0.18)');
  glow.addColorStop(1, 'rgba(255, 160, 60, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
  // four-point star glint
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255, 230, 170, 0.75)';
  g.fillRect(size / 2 - 0.75, 4, 1.5, size - 8);
  g.fillRect(4, size / 2 - 0.75, size - 8, 1.5);
  sparkSprite = c;
  return c;
}

function rand(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/* --------------------------------------------------------------------- player */

export type GiftFramesOptions = {
  tone?: GiftTone;
  interactive?: boolean;
  autoRotate?: boolean;
  particles?: boolean;
};

export class GiftFramePlayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private opts: Required<Omit<GiftFramesOptions, 'tone'>>;
  private tone: GiftTone;
  private turn: HTMLImageElement | null = null;
  private openSheet: HTMLImageElement | null = null;
  private wantOpenSheet = false;
  private disposed = false;
  private onError?: (err: unknown) => void;

  private frame = 0;
  private running = false;
  private last = 0;
  private time = 0;
  private intro = 0;
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;

  private spin = 0;
  private spinVel = 0;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private pointerWeight = 1;
  private dragging = false;
  private lastDragX = 0;

  private openTarget = 0;
  private open = 0;
  private openVel = 0;
  private shake = 0;
  private aligned = false;
  private burstArmed = true;
  private sparks: Spark[] = [];
  private ambient: Spark[] = [];

  private progressSource: (() => number | null) | null = null;
  /** Frame position and time of the previous draw, to blend only when motion is slow. */
  private lastPos = 0;
  private lastDrawAt = 0;
  private blendSharpness = 0;
  private smoothProgress = 0;

  private cleanup: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, options: GiftFramesOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.tone = options.tone ?? 'red';
    this.opts = {
      interactive: options.interactive ?? true,
      autoRotate: options.autoRotate ?? true,
      particles: options.particles ?? true
    };
    for (let i = 0; i < 26; i++) {
      this.ambient.push({
        x: (rand(i) - 0.5) * 1.5,
        y: rand(i + 11),
        vx: 0,
        vy: 0.08 + rand(i + 3) * 0.14,
        born: rand(i + 7) * 6,
        life: 0,
        size: 0.5 + rand(i + 5),
        tw: 2 + rand(i + 9) * 4
      });
    }
    if (this.opts.interactive) this.bindPointer();
    this.loadTone();
  }

  /* ------------------------------------------------------------- public */

  get element() {
    return this.canvas;
  }

  setErrorHandler(handler: ((err: unknown) => void) | undefined) {
    this.onError = handler;
  }

  setTone(tone: GiftTone) {
    if (tone === this.tone) return;
    this.tone = tone;
    this.turn = null;
    this.openSheet = null;
    this.loadTone();
  }

  setOpen(target: number, dramatic = false) {
    if (dramatic && target > this.openTarget) this.shake = 0.55;
    if (target < 0.5) this.burstArmed = true;
    if (target > 0) this.needOpenSheet();
    this.openTarget = target;
    this.kick();
  }

  snapOpen(value: number) {
    this.open = value;
    this.openTarget = value;
    this.openVel = 0;
    this.burstArmed = value < 0.5;
    if (value > 0) {
      this.needOpenSheet();
      this.spin = OPEN_SPIN;
      this.aligned = true;
      this.pointerWeight = 0;
    }
    this.kick();
  }

  setProgressSource(source: (() => number | null) | null) {
    this.progressSource = source;
    if (source) this.needOpenSheet();
  }

  resize() {
    const cssW = Math.max(1, this.canvas.clientWidth);
    const cssH = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      if (!this.running) this.draw();
    }
  }

  /** Shrink the bitmap while off screen; resize() restores it. */
  releaseBuffer() {
    this.stop();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /** Reduced motion: show the final pose without animating. */
  renderStill() {
    this.intro = 1;
    this.open = this.openTarget;
    if (this.open > 0) {
      this.spin = OPEN_SPIN;
      this.aligned = true;
      this.pointerWeight = 0;
    }
    if (this.progressSource) this.smoothProgress = this.progressSource() ?? 0;
    this.draw();
  }

  dispose() {
    this.stop();
    this.disposed = true;
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
  }

  /* ------------------------------------------------------------ private */

  /** Redraw once when a paused player changes state (e.g. reduced motion). */
  private kick() {
    if (!this.running) this.draw();
  }

  private loadTone() {
    const tone = this.tone;
    loadSheet(`turn-${tone}`).then(
      (img) => {
        if (this.disposed || tone !== this.tone) return;
        this.turn = img;
        this.revealed();
      },
      (err) => this.onError?.(err)
    );
    if (this.wantOpenSheet) this.loadOpenSheet();
  }

  private needOpenSheet() {
    if (this.wantOpenSheet) return;
    this.wantOpenSheet = true;
    this.loadOpenSheet();
  }

  private loadOpenSheet() {
    const tone = this.tone;
    loadSheet(`open-${tone}`).then(
      (img) => {
        if (this.disposed || tone !== this.tone) return;
        this.openSheet = img;
        this.revealed();
      },
      (err) => this.onError?.(err)
    );
  }

  private revealed() {
    if (!this.running) this.draw();
    if (!this.canvas.classList.contains('is-ready')) requestAnimationFrame(() => this.canvas.classList.add('is-ready'));
  }

  private bindPointer() {
    const canvas = this.canvas;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const onWindowMove = (event: PointerEvent) => {
      this.pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
      this.pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
    };
    const onDown = (event: PointerEvent) => {
      if (this.openTarget > 0 || this.open > 0.01) return; // the open gift stays facing the viewer
      this.dragging = true;
      this.lastDragX = event.clientX;
      this.spinVel = 0;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add('is-grabbing');
    };
    const onMove = (event: PointerEvent) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastDragX;
      this.lastDragX = event.clientX;
      this.spin += dx * 0.012;
      this.spinVel = dx * 0.012 * 60;
    };
    const onUp = (event: PointerEvent) => {
      this.dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.classList.remove('is-grabbing');
    };
    if (fine) window.addEventListener('pointermove', onWindowMove, { passive: true });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    this.cleanup.push(() => {
      window.removeEventListener('pointermove', onWindowMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    });
  }

  /** Same motion model as GiftRenderer.step, plus aligning to the opening angle. */
  private step(dt: number) {
    this.time += dt;
    this.intro = Math.min(1, this.intro + dt / 1.6);
    this.pointer.x += (this.pointer.tx - this.pointer.x) * Math.min(1, dt * 3);
    this.pointer.y += (this.pointer.ty - this.pointer.y) * Math.min(1, dt * 3);

    if (this.progressSource) {
      const p = this.progressSource();
      if (p !== null) this.smoothProgress += (p - this.smoothProgress) * Math.min(1, dt * 6);
      return;
    }

    const wantsOpen = this.openTarget > 0 || this.open > 0.002;
    // The lid frames exist for one angle: turn the gift there before (and while) it opens.
    this.pointerWeight += ((wantsOpen ? 0 : 1) - this.pointerWeight) * Math.min(1, dt * 6);
    if (wantsOpen) {
      const current = this.spinTotal();
      const target = OPEN_SPIN + Math.round((current - OPEN_SPIN) / TAU) * TAU;
      const delta = target - current;
      this.spin += delta * Math.min(1, dt * 9);
      this.spinVel = 0;
      this.aligned = this.aligned || (Math.abs(delta) < 0.03 && this.pointerWeight < 0.05);
    } else {
      this.aligned = false;
      if (!this.dragging) {
        this.spin += this.spinVel * dt;
        this.spinVel *= Math.exp(-dt * 2.4);
        if (this.opts.autoRotate) this.spin += dt * 0.22;
      }
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
    } else if (this.aligned || this.openTarget === 0) {
      const stiffness = 70;
      const damping = 9;
      this.openVel += (this.openTarget - this.open) * stiffness * dt;
      this.openVel *= Math.exp(-damping * dt);
      this.open += this.openVel * dt;
      if (this.openTarget === 0 && this.open < 0.002 && Math.abs(this.openVel) < 0.01) {
        this.open = 0;
        this.openVel = 0;
      }
    }

    if (this.burstArmed && this.open > 0.35 && this.openTarget > 0.5) {
      this.burstArmed = false;
      if (this.opts.particles) this.burst();
    }
    this.sparks = this.sparks.filter((s) => this.time - s.born < s.life);
  }

  private ease() {
    return 1 - Math.pow(1 - this.intro, 3);
  }

  /** Total turntable angle, as GiftRenderer computes rotY (minus its constant offset). */
  private spinTotal() {
    return this.spin + this.pointer.x * 0.35 * this.pointerWeight - (1 - this.ease()) * 1.1;
  }

  private burst() {
    const floor = floorFor(1);
    for (let i = 0; i < 70; i++) {
      const a = rand(i + 5 + this.time) * TAU;
      const speed = 1.4 + rand(i + 9 + this.time) * 2.6;
      const spread = 0.25 + rand(i + 3) * 0.75;
      this.sparks.push({
        x: floor.lidX,
        y: floor.lidY,
        vx: Math.cos(a) * spread * speed,
        vy: -(1.4 + rand(i + 13) * 1.2) * speed * 0.55,
        born: this.time,
        life: 1.6 + rand(i + 21) * 1.4,
        size: 0.6 + rand(i + 33),
        tw: 2 + rand(i + 44) * 4
      });
    }
  }

  /* ---------------------------------------------------------------- draw */

  private draw() {
    const ctx = this.ctx;
    const { canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.turn || canvas.width <= 1) return;

    // Map the virtual frame (the renderer's camera image) into the container
    // exactly like GiftRenderer frames the scene for this aspect ratio.
    const aspect = this.cssW / this.cssH;
    const fit = aspect < FRAME_ASPECT ? Math.pow(FRAME_ASPECT / aspect, 0.92) : 1;
    const vh = this.cssH / fit;
    const vw = vh * FRAME_ASPECT;
    const scale = vh / FRAME_H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate((this.cssW - vw) / 2, (this.cssH - vh) / 2);
    ctx.scale(scale, scale);
    // from here on: virtual-frame pixels (FRAME_W × FRAME_H)

    let open = 0;
    let useOpen = false;
    let angle = this.spinTotal();
    if (this.progressSource) {
      const p = this.smoothProgress;
      angle = this.spin + p * Math.PI * 1.35;
      open = Math.min(1, Math.max(0, (p - 0.55) / 0.3));
      useOpen = open > 0;
    } else {
      open = Math.min(1, Math.max(0, this.open));
      useOpen = this.aligned && open > 0.002;
    }
    if (useOpen && !this.openSheet) {
      useOpen = false; // lid frames still downloading: keep showing the closed gift
      open = 0;
    }

    const ease = this.progressSource ? 1 : this.ease();
    const float = this.progressSource ? 0 : Math.sin(this.time * 1.15) * 0.07;
    const giftScale = 0.82 + 0.18 * ease;
    const floor = floorFor(useOpen ? open : 0);

    this.drawShadow(floor, float, useOpen ? open : 0);

    ctx.save();
    // floating + intro scale + opening shake, around the gift's base
    ctx.translate(floor.cx, floor.cy);
    ctx.translate(0, -float * floor.unit);
    if (this.shake > 0) ctx.rotate(Math.sin(this.time * 46) * 0.035 * (this.shake / 0.55));
    ctx.translate(0, -0.8 * floor.unit);
    ctx.scale(giftScale, giftScale);
    ctx.translate(-floor.cx, -floor.cy + 0.8 * floor.unit);

    if (useOpen) {
      const sheet = FRAME_SHEETS[`open-${this.tone}`];
      this.drawBlend(this.openSheet!, sheet, open * (sheet.frames - 1), false);
    } else {
      const sheet = FRAME_SHEETS[`turn-${this.tone}`];
      const pos = ((angle / TAU) * sheet.frames) % sheet.frames;
      this.drawBlend(this.turn, sheet, pos < 0 ? pos + sheet.frames : pos, true);
    }
    ctx.restore();

    if (this.opts.particles && !this.progressSource) this.drawSparks(floor);
  }

  /**
   * Draw fractional frame `pos`. Slow motion (auto-rotation, a lid settling)
   * cross-fades the two neighbouring frames so the 7.5° steps don't tick; fast
   * motion (a drag or fling) shows the nearest frame only, because blending two
   * clearly different silhouettes reads as a ghost.
   */
  private drawBlend(img: HTMLImageElement, sheet: FrameSheet, pos: number, wrap: boolean) {
    const now = performance.now();
    const dt = Math.max(1, now - this.lastDrawAt) / 1000;
    let delta = Math.abs(pos - this.lastPos);
    if (wrap) delta = Math.min(delta, sheet.frames - delta);
    this.lastPos = pos;
    this.lastDrawAt = now;
    const framesPerSecond = dt < 0.2 ? delta / dt : 0;
    // 1 → show the nearest frame only: at rest (crisp still) or moving fast (drag, fling);
    // 0 → dissolve between neighbours: slow continuous motion such as auto-rotation.
    const target = framesPerSecond < 0.3 ? 1 : framesPerSecond < 2.5 ? 0 : Math.min(1, (framesPerSecond - 2.5) / 3.5);
    this.blendSharpness += (target - this.blendSharpness) * Math.min(1, dt * 8);

    const a = Math.floor(pos);
    const raw = pos - a;
    // Each frame stays crisp most of the time and dissolves into the next only
    // around the midpoint, so the dot pattern never sits doubled for long.
    const k = Math.min(1, Math.max(0, (raw - 0.3) / 0.4));
    const dissolve = k * k * (3 - 2 * k);
    const t = dissolve + (Math.round(raw) - dissolve) * this.blendSharpness;
    const b = wrap ? (a + 1) % sheet.frames : Math.min(a + 1, sheet.frames - 1);
    // The dominant frame is drawn opaque underneath, the other fades in over it:
    // any ghost is at most a half-transparent sliver at the silhouette edge.
    const [base, over, weight] = t < 0.5 ? [a, b, t] : [b, a, 1 - t];
    this.drawCell(img, sheet, base, 1);
    if (weight > 0.02 && over !== base) this.drawCell(img, sheet, over, weight);
  }

  private drawCell(img: HTMLImageElement, sheet: FrameSheet, index: number, alpha: number) {
    const ctx = this.ctx;
    const sx = (index % sheet.cols) * sheet.cellW;
    const sy = Math.floor(index / sheet.cols) * sheet.cellH;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, sx, sy, sheet.cellW, sheet.cellH, sheet.x * FRAME_W, sheet.y * FRAME_H, sheet.w * FRAME_W, sheet.h * FRAME_H);
    ctx.globalAlpha = 1;
  }

  /** The renderer's floor quad: a soft contact shadow, warming up as the lid opens. */
  private drawShadow(floor: Floor, float: number, open: number) {
    const ctx = this.ctx;
    const shrink = 1 - float / 4.6;
    ctx.save();
    ctx.translate(floor.cx, floor.cy);
    ctx.scale(floor.rx * shrink, floor.ry * shrink);
    const strength = Math.max(0, 0.55 - float * 0.8);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    // alpha = (1 - d)^2.2 * strength, sampled
    for (const d of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
      g.addColorStop(d, `rgba(0,0,0,${(Math.pow(1 - d, 2.2) * strength).toFixed(4)})`);
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    if (open > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      glow.addColorStop(0, `rgba(255, 200, 110, ${(0.22 * open).toFixed(3)})`);
      glow.addColorStop(0.5, `rgba(255, 180, 90, ${(0.04 * open).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(255, 160, 60, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSparks(floor: Floor) {
    const ctx = this.ctx;
    const sprite = sparkle();
    const unit = floor.unit;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // ambient: slow golden motes rising around the gift
    const height = 5;
    for (const s of this.ambient) {
      const y = (s.y * height + this.time * s.vy) % height;
      const fade = Math.min(1, y / 0.8) * (1 - Math.max(0, (y - (height - 1.4)) / 1.4));
      const tw = 0.55 + 0.45 * Math.sin(this.time * s.tw + s.born * 30);
      const x = floor.cx + (s.x + Math.sin(this.time * 0.35 + s.born) * 0.12) * unit * 3.2;
      const py = floor.cy - (y - 0.6) * unit;
      const size = (6 + s.size * 9) * (unit / 90);
      ctx.globalAlpha = Math.max(0, fade * tw * 0.55);
      ctx.drawImage(sprite, x - size / 2, py - size / 2, size, size);
    }
    // burst from the opening lid
    for (const s of this.sparks) {
      const age = this.time - s.born;
      const t = Math.min(1, age / s.life);
      const x = s.x + s.vx * age * (1 - t * 0.45) * unit * 0.5;
      const y = s.y + (s.vy * age * (1 - t * 0.45) + 0.35 * age * age) * unit * 0.5;
      const tw = 0.55 + 0.45 * Math.sin(this.time * s.tw + s.born * 30);
      const size = (7 + s.size * 10) * (unit / 90);
      ctx.globalAlpha = Math.pow(1 - t, 1.3) * tw;
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    }
    ctx.restore();
  }
}
