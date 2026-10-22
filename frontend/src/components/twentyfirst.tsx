/*
 * Components from the 21st.dev community library, ported from Tailwind/Radix to the
 * project's plain CSS (`.tf-*` classes in styles.css) and tuned for Secret Santa:
 *
 *  - LiquidButton, MetalButton — 21st.dev/@designali-in/components/liquid-glass-button
 *  - BackgroundPaths            — 21st.dev/@kokonutd/components/background-paths
 *                                 (Kokonut UI, MIT, https://github.com/kokonut-labs/kokonutui)
 *  - TextRotate                 — 21st.dev/@danielpetho/components/text-rotate
 *                                 (Fancy Components, MIT, https://github.com/danielpetho/fancy)
 *  - InteractiveHoverButton     — 21st.dev/@dillionverma/components/interactive-hover-button
 *                                 (Magic UI, MIT, https://github.com/magicuidesign/magicui)
 *  - ContainerScroll            — Motion-based take on the 21st.dev "Container Scroll Animation" pattern
 */
import { ArrowRight } from 'lucide-react';
import { coveredByOverlay, onOverlayChange } from '../hooks/overlay';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode
} from 'react';

/* ------------------------------------------------------------- LiquidButton */

export const LiquidButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'md' | 'lg' }>(
  function LiquidButton({ className = '', children, size = 'md', ...props }, ref) {
    // The original used an SVG displacement filter as a backdrop-filter. It looked
    // nice but was re-rendered on every frame whenever anything behind the button
    // moved; a light CSS frost gives the same glass read at a fraction of the cost.
    return (
      <button ref={ref} {...props} className={`tf-liquid tf-liquid-${size} ${className}`.trim()}>
        <span className="tf-liquid-rim" aria-hidden="true" />
        <span className="tf-liquid-lens" aria-hidden="true" />
        <span className="tf-liquid-content">{children}</span>
      </button>
    );
  }
);

/* -------------------------------------------------------------- MetalButton */

type MetalVariant = 'gold' | 'default' | 'bronze';

export const MetalButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: MetalVariant }>(
  function MetalButton({ className = '', children, variant = 'gold', disabled, ...props }, ref) {
    const [pressed, setPressed] = useState(false);
    return (
      <span className={`tf-metal tf-metal-${variant} ${pressed ? 'is-pressed' : ''} ${disabled ? 'is-disabled' : ''}`.trim()}>
        <span className="tf-metal-inner" aria-hidden="true" />
        <button
          ref={ref}
          {...props}
          disabled={disabled}
          className={`tf-metal-button ${className}`.trim()}
          onPointerDown={(event) => {
            setPressed(true);
            props.onPointerDown?.(event);
          }}
          onPointerUp={(event) => {
            setPressed(false);
            props.onPointerUp?.(event);
          }}
          onPointerLeave={(event) => {
            setPressed(false);
            props.onPointerLeave?.(event);
          }}
        >
          <span className="tf-metal-shine" aria-hidden="true" />
          {children}
        </button>
      </span>
    );
  }
);

/* ---------------------------------------------------------- BackgroundPaths */

const SAMPLES = 64;
const OVERSCAN = 0.06;
const DRAW_MS = 1400;
const DRAW_STAGGER_MS = 40;
const PART_RADIUS = 150;
const PART_PUSH = 56;

type Layer = { width: number; opacity: number; phase: number; pace: number; part: number };
const LAYERS: Layer[] = [
  { width: 1, opacity: 0.16, phase: 0.6, pace: 0.7, part: 0.45 },
  { width: 1.25, opacity: 0.26, phase: 0.3, pace: 0.85, part: 0.75 },
  { width: 1.5, opacity: 0.4, phase: 0, pace: 1, part: 1 }
];

type Frame = {
  width: number;
  height: number;
  time: number;
  drawn: number[];
  pointer: { x: number; y: number; amount: number; on: boolean };
};
type Shape = { count: number; spread: number; slope: number; interactive: boolean };

function lineY(s: number, u: number, layer: Layer, frame: Frame, shape: Shape, band: number) {
  const t = frame.time * layer.pace;
  const x = u * frame.width;
  const center = frame.height * 0.5 + shape.slope * (x - frame.width / 2)
    + band * 0.1 * Math.sin(Math.PI * 2 * (0.75 * u + 0.1) + layer.phase + t * 0.35);
  const turn = 0.22 + 0.09 * Math.sin(t * 0.21 + layer.phase);
  const breathe = 0.3 * Math.sin(t * 0.5 + s * 4 + layer.phase);
  const twist = Math.cos(Math.PI * (u - turn) + s * (0.6 + breathe) + layer.phase);
  return center + s * shape.spread * band * twist;
}

function partLine(x: number, y: number, frame: Frame, strength: number) {
  const { pointer } = frame;
  if (pointer.amount < 0.001) return y;
  const dx = x - pointer.x;
  const dy = y - pointer.y;
  const falloff = Math.exp(-(dx * dx + dy * dy) / (PART_RADIUS * PART_RADIUS));
  const side = dy / (Math.abs(dy) + 24);
  return y + side * falloff * PART_PUSH * strength * pointer.amount;
}

// reused every frame: no per-frame allocations (avoids GC hitches)
const lineXs = new Float32Array(SAMPLES + 1);
const lineYs = new Float32Array(SAMPLES + 1);

/**
 * Edge fade of the ribbon, as an alpha factor: transparent at the top and bottom
 * 15 %, dimmed to 30 % in the middle (behind the headline), full towards the sides.
 */
function edgeFade(x: number, y: number, width: number, height: number) {
  const vertical = Math.max(0, Math.min(1, Math.min(y, height - y) / (0.15 * height)));
  const d = Math.hypot(x - width / 2, y - height / 2) / (Math.max(width, height) * 0.5);
  const center = d >= 0.8 ? 1 : 0.3 + 0.7 * (d / 0.8);
  return vertical * center;
}

/** Samples per stroked piece of a line: the fade is applied per piece, not per pixel. */
const PIECE = 4;

function drawLines(ctx: CanvasRenderingContext2D, frame: Frame, shape: Shape, color: string) {
  const { width, height } = frame;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = color;
  // butt caps: neighbouring pieces meet without overlapping (no brighter dots at the seams)
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  const band = Math.min(height, width * 1.1);
  const perLayer = Math.max(1, Math.round(shape.count / LAYERS.length));
  const xs = lineXs;
  const ys = lineYs;

  for (let layerIndex = 0; layerIndex < LAYERS.length; layerIndex++) {
    const layer = LAYERS[layerIndex];
    ctx.lineWidth = layer.width;
    for (let i = 0; i < perLayer; i++) {
      const drawn = frame.drawn[layerIndex * perLayer + i] ?? 1;
      if (drawn <= 0) continue;
      const s = perLayer === 1 ? 0 : i / (perLayer - 1) - 0.5;
      const last = Math.max(1, Math.ceil(SAMPLES * drawn));
      for (let k = 0; k <= last; k++) {
        const u = -OVERSCAN + (k / SAMPLES) * (1 + OVERSCAN * 2);
        const x = u * width;
        const y = lineY(s, u, layer, frame, shape, band);
        xs[k] = x;
        ys[k] = shape.interactive ? partLine(x, y, frame, layer.part) : y;
      }
      const alpha = layer.opacity * (0.45 + 0.55 * (1 - Math.abs(s) * 2));
      // The curve is the same smooth quadratic chain as before (control points at
      // the samples, on-curve points at the midpoints), cut into short pieces so
      // each piece can carry its own fade. A per-pixel mask instead (two
      // full-canvas 'destination-in' fills, or a pattern stroke) halved the frame
      // rate whenever the browser rasterises canvas without a GPU.
      for (let p = 0; p < last; p += PIECE) {
        const q = Math.min(last, p + PIECE);
        const mid = (p + q) >> 1;
        const a = alpha * edgeFade(xs[mid], ys[mid], width, height);
        if (a < 0.004) continue;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(p === 0 ? xs[0] : (xs[p - 1] + xs[p]) / 2, p === 0 ? ys[0] : (ys[p - 1] + ys[p]) / 2);
        for (let k = Math.max(1, p); k < q; k++) {
          ctx.quadraticCurveTo(xs[k], ys[k], (xs[k] + xs[k + 1]) / 2, (ys[k] + ys[k + 1]) / 2);
        }
        if (q === last) ctx.lineTo(xs[last], ys[last]);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Flowing ribbon of lines (canvas). Colour follows CSS `color` of `.tf-paths`. */
export function BackgroundPaths({
  className = '',
  count = 42,
  spread = 1,
  angle = -8,
  speed = 1,
  interactive = true
}: {
  className?: string;
  count?: number;
  spread?: number;
  angle?: number;
  speed?: number;
  interactive?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!root || !canvas || !ctx) return;
    const host = root.parentElement ?? root;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shape: Shape = { count, spread, slope: Math.tan((angle * Math.PI) / 180), interactive: interactive && !reduceMotion };
    const perLayer = Math.max(1, Math.round(count / LAYERS.length));
    const frame: Frame = {
      width: 0,
      height: 0,
      time: 40,
      drawn: new Array(perLayer * LAYERS.length).fill(reduceMotion ? 1 : 0),
      pointer: { x: 0, y: 0, amount: 0, on: false }
    };
    const color = getComputedStyle(canvas).color;
    let start = 0;
    let last = 0;
    let raf = 0;
    let visible = true;

    const paint = () => drawLines(ctx, frame, shape, color);
    const resize = () => {
      // Layout size (ignores transforms of page transitions).
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      frame.width = width;
      frame.height = height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint();
    };
    const loop = (now: number) => {
      raf = 0;
      if (!start) {
        start = now;
        last = now;
      }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      frame.time += dt * speed;
      const elapsed = now - start;
      for (let i = 0; i < frame.drawn.length; i++) {
        if (frame.drawn[i] < 1) {
          frame.drawn[i] = easeOut(Math.min(Math.max((elapsed - (i % perLayer) * DRAW_STAGGER_MS) / DRAW_MS, 0), 1));
        }
      }
      frame.pointer.amount += ((frame.pointer.on ? 1 : 0) - frame.pointer.amount) * 0.08;
      paint();
      if (visible && speed > 0 && !coveredByOverlay(root)) raf = requestAnimationFrame(loop);
    };
    const play = () => {
      if (!raf && visible && !reduceMotion && !coveredByOverlay(root)) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };

    resize();
    canvas.style.opacity = '1';
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      if (visible) play();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    intersection.observe(root);
    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) play();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const offOverlay = onOverlayChange(() => {
      if (coveredByOverlay(root)) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else {
        play();
      }
    });
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !shape.interactive) return;
      const rect = canvas.getBoundingClientRect();
      frame.pointer.x = event.clientX - rect.left;
      frame.pointer.y = event.clientY - rect.top;
      frame.pointer.on = true;
    };
    const onLeave = () => {
      frame.pointer.on = false;
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    play();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      offOverlay();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
    };
  }, [count, spread, angle, speed, interactive]);

  return (
    <div className={`tf-paths ${className}`.trim()} ref={rootRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

/* --------------------------------------------------------------- TextRotate */

function splitIntoCharacters(text: string): string[] {
  type SegmenterCtor = new (locale: string, options: { granularity: 'grapheme' }) => {
    segment: (input: string) => Iterable<{ segment: string }>;
  };
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter('ru', { granularity: 'grapheme' }).segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}

export function TextRotate({
  texts,
  rotationInterval = 2600,
  staggerDuration = 0.025,
  staggerFrom = 'last',
  className = '',
  elementClassName = ''
}: {
  texts: string[];
  rotationInterval?: number;
  staggerDuration?: number;
  staggerFrom?: 'first' | 'last' | 'center';
  className?: string;
  elementClassName?: string;
}) {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  const chars = useMemo(() => splitIntoCharacters(texts[index]), [texts, index]);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setIndex((value) => (value + 1) % texts.length), rotationInterval);
    return () => window.clearInterval(id);
  }, [texts.length, rotationInterval, reduced]);

  const delay = (i: number) => {
    const total = chars.length;
    if (staggerFrom === 'last') return (total - 1 - i) * staggerDuration;
    if (staggerFrom === 'center') return Math.abs(Math.floor(total / 2) - i) * staggerDuration;
    return i * staggerDuration;
  };

  return (
    <motion.span className={`tf-text-rotate ${className}`.trim()} layout transition={{ type: 'spring', damping: 30, stiffness: 400 }}>
      <span className="sr-only">{texts[index]}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={index} className="tf-text-rotate-word" aria-hidden="true" layout>
          {chars.map((char, i) => (
            <span key={`${index}-${i}`} className="tf-text-rotate-mask">
              <motion.span
                className={`tf-text-rotate-char ${elementClassName}`.trim()}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '-120%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 400, delay: delay(i) }}
              >
                {char === ' ' ? ' ' : char}
              </motion.span>
            </span>
          ))}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

/* --------------------------------------------------- InteractiveHoverButton */

/**
 * Pill CTA. Hover: a fill glides in from the left, the arrow nudges forward and
 * the button lifts a touch; press: a quick, even scale-down. Everything is
 * transform/opacity only and the size never changes, so it can't wobble.
 *  - tone="dark": outline on dark backgrounds, gold fill on hover
 *  - tone="gold": solid gold, light sheen sweeps across on hover
 *  - tone="light": outline on light backgrounds, ink fill on hover
 */
export const InteractiveHoverButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'light' | 'dark' | 'gold' }>(
  function InteractiveHoverButton({ children, className = '', tone = 'light', ...props }, ref) {
    return (
      <button ref={ref} {...props} className={`tf-hover-button tf-hover-${tone} ${className}`.trim()}>
        <span className="tf-hover-fill" aria-hidden="true" />
        <span className="tf-hover-label">{children}</span>
        <ArrowRight className="tf-hover-arrow" size={17} strokeWidth={2.4} aria-hidden="true" />
      </button>
    );
  }
);

/* ---------------------------------------------------------- ContainerScroll */

/** A device frame that tilts back in 3D and straightens as the section scrolls in. */
export function ContainerScroll({ title, children }: { title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [28, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.86, 1]);
  const titleY = useTransform(scrollYProgress, [0, 1], [60, 0]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.6], [0, 1]);

  return (
    <div className="tf-container-scroll" ref={ref}>
      <motion.div className="tf-container-title" style={reduced ? undefined : { y: titleY, opacity: titleOpacity }}>
        {title}
      </motion.div>
      <motion.div
        className="tf-container-card"
        style={reduced ? undefined : { rotateX, scale, transformPerspective: 1200 }}
      >
        <div className="tf-container-screen">{children}</div>
      </motion.div>
    </div>
  );
}
