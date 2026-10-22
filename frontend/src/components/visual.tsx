import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';
import { GiftPileRenderer } from '../gl/giftPhysics';
import { GiftRenderer, type GiftTone } from '../gl/giftRenderer';
import { canPlayGiftLoop, GiftFramePlayer, virtualFrame } from '../gl/giftFrames';
import { LOOP_VIDEOS, PILE_IMAGE } from '../gl/giftFramesData';
import { downgradeGifts, giftMode, onGiftModeChange, type GiftMode } from '../gl/giftMode';
import { parkRenderer, takeRenderer, whenIdle } from '../gl/pool';
import { coveredByOverlay, onOverlayChange } from '../hooks/overlay';

export type { GiftTone };
type GiftRevealState = 'closed' | 'opening' | 'open';

const faces = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;

/** Off-screen scenes give their drawing buffer back after this long. */
const RELEASE_AFTER_MS = 1500;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Current gift mode, updated when the page downgrades to frames (GPU reset, low fps). */
function useGiftMode(): GiftMode {
  const [mode, setMode] = useState<GiftMode>(() => (typeof window === 'undefined' ? 'frames' : giftMode()));
  useEffect(() => onGiftModeChange(() => setMode(giftMode())), []);
  return mode;
}

/** Minimal interface shared by the WebGL renderer and the image-sequence player. */
type GiftScene = {
  element: HTMLCanvasElement;
  start(): void;
  stop(): void;
  resize(): void;
  releaseBuffer(): void;
  renderStill(): void;
};

/**
 * Run a scene only while it is on screen: start/stop with visibility, overlays and
 * tab visibility; give the drawing buffer back when it has been off screen for a
 * moment (a parked full-size buffer is exactly what exhausts integrated GPUs).
 */
function bindVisibility(wrap: HTMLElement, scene: GiftScene, reduced: boolean, onShow?: () => void, threshold = 0) {
  let visible = false;
  let releaseTimer = 0;
  const sync = () => {
    const show = visible && !document.hidden && !coveredByOverlay(wrap);
    window.clearTimeout(releaseTimer);
    if (show) {
      scene.resize();
      onShow?.();
      if (reduced) scene.renderStill();
      else scene.start();
    } else {
      scene.stop();
      releaseTimer = window.setTimeout(() => scene.releaseBuffer(), RELEASE_AFTER_MS);
    }
  };
  const resizeObserver = new ResizeObserver(() => {
    if (visible) scene.resize();
  });
  resizeObserver.observe(wrap);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    sync();
  }, threshold ? { threshold } : { rootMargin: '120px' });
  intersection.observe(wrap);
  document.addEventListener('visibilitychange', sync);
  const offOverlay = onOverlayChange(sync);
  return () => {
    window.clearTimeout(releaseTimer);
    document.removeEventListener('visibilitychange', sync);
    offOverlay();
    resizeObserver.disconnect();
    intersection.disconnect();
  };
}

/**
 * Call `fn` once the element comes near the viewport. Creating a WebGL context
 * for a scene three screens below (story, pile) is wasted GPU memory until then.
 */
function whenNear(element: HTMLElement, fn: () => void, margin = '400px'): () => void {
  let done = false;
  const observer = new IntersectionObserver((entries) => {
    if (done || !entries.some((entry) => entry.isIntersecting)) return;
    done = true;
    observer.disconnect();
    fn();
  }, { rootMargin: margin });
  observer.observe(element);
  return () => {
    done = true;
    observer.disconnect();
  };
}

/**
 * 3D gift. Real-time WebGL where the GPU copes; otherwise (no GPU, GPU resets,
 * low fps, little memory) the same gift as pre-rendered frames — see gl/giftFrames.
 */
export function Gift3D({
  className = '',
  tone = 'red',
  interactive = true,
  autoRotate = true,
  particles = true,
  open = false,
  revealState,
  onRevealComplete,
  progressRef
}: {
  className?: string;
  tone?: GiftTone;
  interactive?: boolean;
  autoRotate?: boolean;
  particles?: boolean;
  open?: boolean;
  revealState?: GiftRevealState;
  onRevealComplete?: () => void;
  progressRef?: MutableRefObject<number | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GiftRenderer | GiftFramePlayer | null>(null);
  const mode = useGiftMode();
  const [framesFailed, setFramesFailed] = useState(false);
  const targetState: GiftRevealState = revealState ?? (open ? 'open' : 'closed');
  // A decorative gift that only turns (never dragged, never opened) plays a
  // pre-rendered seamless video in frames mode: perfectly smooth at no cost.
  const [loopFailed, setLoopFailed] = useState(false);
  const useLoop = mode === 'frames' && !loopFailed && !framesFailed && !interactive && autoRotate && !progressRef
    && revealState === undefined && !open && tone in LOOP_VIDEOS && typeof window !== 'undefined' && canPlayGiftLoop();
  const toneRef = useRef(tone);
  toneRef.current = tone;
  const targetStateRef = useRef(targetState);
  targetStateRef.current = targetState;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || framesFailed || useLoop) return;
    const reduced = prefersReducedMotion();
    let detach = () => {};
    let cancelCreate = () => {};

    const prepare = (scene: GiftRenderer | GiftFramePlayer) => {
      scene.setTone(toneRef.current);
      const state = targetStateRef.current;
      scene.snapOpen(state === 'open' ? 1 : 0);
      if (state === 'opening') scene.setOpen(1, true);
      if (progressRef) scene.setProgressSource(() => progressRef.current);
      wrap.appendChild(scene.element);
      sceneRef.current = scene;
      detach = bindVisibility(wrap, scene, reduced);
    };

    if (mode === 'frames') {
      const player = new GiftFramePlayer(document.createElement('canvas'), { tone: toneRef.current, interactive, autoRotate, particles });
      player.setErrorHandler((err) => {
        console.warn('3D gift frames:', err);
        setFramesFailed(true);
      });
      prepare(player);
      return () => {
        detach();
        player.dispose();
        player.element.remove();
        sceneRef.current = null;
      };
    }

    const key = `gift:${interactive}:${autoRotate}:${particles}`;
    let renderer: GiftRenderer | null = null;
    const attach = (instance: GiftRenderer) => {
      renderer = instance;
      instance.reset();
      // A dropped context is not rebuilt: after a GPU reset the browser blocks WebGL
      // for the page if we keep asking. The same gift continues as frames.
      instance.setContextLostHandler(() => downgradeGifts('gpu-lost', 'видеокарта сбросила WebGL-контекст'));
      instance.onStruggle = () => downgradeGifts('slow', '3D не успевает отрисовываться (меньше 30 кадров/с)');
      prepare(instance);
    };

    const pooled = takeRenderer<GiftRenderer>(key);
    if (pooled) {
      attach(pooled);
    } else {
      cancelCreate = whenNear(wrap, () => {
        cancelCreate = whenIdle(() => {
          try {
            attach(new GiftRenderer(document.createElement('canvas'), { tone: toneRef.current, interactive, autoRotate, particles }));
          } catch (err) {
            console.warn('3D gift:', err);
            downgradeGifts('error', 'не удалось создать WebGL-контекст');
          }
        });
      });
    }

    return () => {
      cancelCreate();
      detach();
      if (renderer) {
        renderer.setContextLostHandler(undefined);
        renderer.onStruggle = undefined;
        renderer.setProgressSource(null);
        parkRenderer(key, renderer);
      }
      sceneRef.current = null;
    };
    // The scene is attached once per mount (and mode); dynamic props are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, framesFailed, useLoop]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setOpen(targetState === 'closed' ? 0 : 1, targetState === 'opening');
    if (prefersReducedMotion()) scene.renderStill();
  }, [targetState]);

  useEffect(() => {
    sceneRef.current?.setTone(tone);
  }, [tone]);

  // Same timing contract as before: the parent waits for this callback.
  useEffect(() => {
    if (targetState !== 'opening') return;
    const timeoutId = window.setTimeout(() => onRevealComplete?.(), prefersReducedMotion() ? 120 : 1650);
    return () => window.clearTimeout(timeoutId);
  }, [targetState, onRevealComplete]);

  if (framesFailed) {
    // Last resort (frames could not be downloaded): the CSS gift.
    return (
      <div className={`gift-3d gift-3d-fallback ${className}`.trim()} aria-hidden="true">
        <CubeGift size={150} tone={tone} open={targetState !== 'closed'} draggable={interactive} />
      </div>
    );
  }

  if (useLoop) return <GiftLoop className={className} tone={tone} particles={particles} onError={() => setLoopFailed(true)} />;

  return (
    <div
      ref={wrapRef}
      className={`gift-3d ${interactive ? 'is-interactive' : ''} ${mode === 'frames' ? 'is-frames' : ''} ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

/** Golden glints around the looping gift (pure CSS: transform/opacity on the compositor). */
const GLINTS = [
  { x: 18, y: 30, d: 0, s: 1 }, { x: 80, y: 22, d: 1.3, s: 0.8 }, { x: 70, y: 62, d: 2.1, s: 1.1 },
  { x: 26, y: 70, d: 3.2, s: 0.7 }, { x: 52, y: 12, d: 0.7, s: 0.9 }, { x: 88, y: 48, d: 2.7, s: 0.6 },
  { x: 10, y: 52, d: 1.8, s: 0.8 }, { x: 60, y: 84, d: 3.8, s: 0.7 }, { x: 36, y: 18, d: 4.4, s: 0.6 },
  { x: 92, y: 76, d: 0.4, s: 0.7 }
];

/**
 * Seamless pre-rendered turntable (VP9 video with alpha), placed exactly where
 * the live renderer would draw the gift. Pauses off screen.
 */
function GiftLoop({ className, tone, particles, onError }: { className: string; tone: GiftTone; particles: boolean; onError: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [box, setBox] = useState<CSSProperties | null>(null);
  const [ready, setReady] = useState(false);
  const clip = LOOP_VIDEOS[tone]!;
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';

  useEffect(() => {
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!wrap || !video) return;
    const layout = () => {
      const frame = virtualFrame(wrap.clientWidth, wrap.clientHeight);
      setBox({
        left: frame.x + clip.x * frame.w,
        top: frame.y + clip.y * frame.h,
        width: clip.w * frame.w,
        height: clip.h * frame.h
      });
    };
    layout();
    const reduced = prefersReducedMotion();
    let visible = false;
    const sync = () => {
      if (!reduced && visible && !document.hidden && !coveredByOverlay(wrap)) video.play().catch(() => undefined);
      else video.pause();
    };
    const resizeObserver = new ResizeObserver(layout);
    resizeObserver.observe(wrap);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      sync();
    });
    intersection.observe(wrap);
    document.addEventListener('visibilitychange', sync);
    const offOverlay = onOverlayChange(sync);
    return () => {
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', sync);
      offOverlay();
    };
  }, [clip]);

  return (
    <div ref={wrapRef} className={`gift-3d gift-loop ${className}`.trim()} aria-hidden="true">
      <video
        ref={videoRef}
        className={ready ? 'is-ready' : ''}
        style={box ?? { visibility: 'hidden' }}
        src={`${base}gift-frames/loop-${tone}.webm`}
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        onLoadedData={() => setReady(true)}
        onError={onError}
      />
      {particles && (
        <div className="gift-glints">
          {GLINTS.map((g, i) => (
            <span key={i} style={{ left: `${g.x}%`, top: `${g.y}%`, animationDelay: `${g.d}s`, scale: String(g.s) } as CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Backwards-compatible name used across pages. */
export const PremiumGiftObject = Gift3D;

/** Lightweight CSS 3D gift for cards and lists (no WebGL context needed). */
export function CubeGift({
  size = 72,
  tone = 'red',
  open = false,
  spin = false,
  draggable = false,
  className = ''
}: {
  size?: number;
  tone?: GiftTone;
  open?: boolean;
  /** Continuous rotation; off by default (decorative infinite motion is avoided). */
  spin?: boolean;
  /** Rotate with mouse/touch drag, with spring inertia (used as the WebGL fallback). */
  draggable?: boolean;
  className?: string;
}) {
  const rotY = useMotionValue(-32);
  const rotX = useMotionValue(-24);
  const springY = useSpring(rotY, { stiffness: 120, damping: 18 });
  const springX = useSpring(rotX, { stiffness: 120, damping: 18 });
  const sceneTransform = useTransform([springX, springY], ([x, y]) => `rotateX(${x}deg) rotateY(${y}deg)`);
  const drag = useRef<{ x: number; y: number; vx: number; t: number } | null>(null);

  const dragProps = draggable ? {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, vx: 0, t: performance.now() };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      const now = performance.now();
      state.vx = dx / Math.max(1, now - state.t);
      state.x = event.clientX;
      state.y = event.clientY;
      state.t = now;
      rotY.set(rotY.get() + dx * 0.6);
      rotX.set(Math.max(-60, Math.min(20, rotX.get() - dy * 0.4)));
    },
    onPointerUp: () => {
      const state = drag.current;
      drag.current = null;
      if (!state) return;
      // Fling: carry the last velocity forward, then ease the tilt back.
      rotY.set(rotY.get() + state.vx * 260);
      rotX.set(-24);
    },
    onPointerCancel: () => { drag.current = null; rotX.set(-24); }
  } : {};

  return (
    <div
      className={`cube-gift tone-${tone} ${open ? 'is-open' : ''} ${spin ? 'is-spinning' : ''} ${draggable ? 'is-draggable' : ''} ${className}`.trim()}
      style={{ '--s': `${size}px` } as CSSProperties}
      aria-hidden="true"
      {...dragProps}
    >
      <motion.div className="cg-scene" style={draggable ? { transform: sceneTransform, transition: 'none' } : undefined}>
        <div className="cg-box cg-body">
          {faces.map((face) => <span className={`cg-face cg-${face}`} key={face} />)}
        </div>
        <div className="cg-box cg-lid">
          {faces.map((face) => <span className={`cg-face cg-${face}`} key={face} />)}
          <div className="cg-bow">
            <span className="cg-loop cg-loop-l" />
            <span className="cg-loop cg-loop-r" />
            <span className="cg-knot" />
          </div>
          <div className="cg-bow cg-bow-cross">
            <span className="cg-loop cg-loop-l" />
            <span className="cg-loop cg-loop-r" />
          </div>
        </div>
      </motion.div>
      <span className="cg-shadow" />
    </div>
  );
}

export function toneForStatus(status: 'OPEN' | 'DRAWN' | 'CLOSED'): GiftTone {
  if (status === 'DRAWN') return 'green';
  if (status === 'CLOSED') return 'graphite';
  return 'red';
}

/**
 * Interactive WebGL pile of gifts with physics: they rain down when the scene
 * scrolls into view; grab and throw them, tap to toss, click empty space to drop more.
 * In frames mode it is a pre-rendered still of the same pile that drops in.
 */
export function GiftPile({
  count = 14,
  className = '',
  width = 16,
  maxGifts = 26,
  interactive = true,
  dropKey,
  hint
}: {
  count?: number;
  className?: string;
  width?: number;
  maxGifts?: number;
  interactive?: boolean;
  /** Changing this value clears the pile and drops `count` gifts again. */
  dropKey?: string | number;
  hint?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GiftPileRenderer | null>(null);
  const droppedRef = useRef(false);
  const mode = useGiftMode();

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || mode === 'frames') return;
    const key = `pile:${interactive}`;
    let renderer: GiftPileRenderer | null = null;
    let detach = () => {};
    let cancelCreate = () => {};

    const attach = (instance: GiftPileRenderer) => {
      renderer = instance;
      instance.configure(width, maxGifts);
      instance.setContextLostHandler(() => downgradeGifts('gpu-lost', 'видеокарта сбросила WebGL-контекст'));
      instance.onStruggle = () => downgradeGifts('slow', '3D не успевает отрисовываться (меньше 30 кадров/с)');
      const canvas = instance.element;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', hint ?? 'Гора подарков');
      wrap.prepend(canvas);
      rendererRef.current = instance;
      droppedRef.current = false;
      const reduced = prefersReducedMotion();
      if (reduced) {
        instance.settle(count);
        droppedRef.current = true;
      }
      const scene: GiftScene = {
        element: canvas,
        start: () => instance.start(),
        stop: () => instance.stop(),
        resize: () => instance.resize(),
        releaseBuffer: () => instance.releaseBuffer(),
        renderStill: () => instance.resize()
      };
      detach = bindVisibility(wrap, scene, reduced, () => {
        if (!droppedRef.current) {
          instance.drop(count);
          droppedRef.current = true;
        }
      }, 0.25);
    };

    const pooled = takeRenderer<GiftPileRenderer>(key);
    if (pooled) {
      attach(pooled);
    } else {
      cancelCreate = whenNear(wrap, () => {
        cancelCreate = whenIdle(() => {
          try {
            attach(new GiftPileRenderer(document.createElement('canvas'), { width, maxGifts, interactive }));
          } catch (err) {
            console.warn('3D pile:', err);
            downgradeGifts('error', 'не удалось создать WebGL-контекст');
          }
        });
      });
    }

    return () => {
      cancelCreate();
      detach();
      if (renderer) {
        renderer.setContextLostHandler(undefined);
        renderer.onStruggle = undefined;
        renderer.clear();
        parkRenderer(key, renderer);
      }
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || dropKey === undefined) return;
    renderer.clear();
    if (prefersReducedMotion()) renderer.settle(count);
    else renderer.drop(count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropKey]);

  if (mode === 'frames') {
    const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
    return (
      <div className={`gift-pile gift-pile-frames ${className}`.trim()} role="img" aria-label={hint ?? 'Гора подарков'}>
        <motion.img
          key={dropKey ?? 'pile'}
          src={`${base}gift-frames/pile.webp`}
          width={PILE_IMAGE.width}
          height={PILE_IMAGE.height}
          alt=""
          decoding="async"
          loading="lazy"
          draggable={false}
          initial={{ opacity: 0, y: -60 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ type: 'spring', stiffness: 170, damping: 14, mass: 0.9 }}
        />
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`gift-pile ${interactive ? 'is-interactive' : ''} ${className}`.trim()}>
      {hint && interactive && <span className="gift-pile-hint">{hint}</span>}
    </div>
  );
}

const shelfTones = ['red', 'green', 'graphite', 'gold', 'navy'] as const;

function describeLink(link: string) {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, '');
    const path = decodeURIComponent(url.pathname).split('/').filter(Boolean).pop() ?? '';
    return { title: host, subtitle: path.replace(/[-_]/g, ' ').slice(0, 28) || 'подарок' };
  } catch {
    return { title: link.slice(0, 22), subtitle: 'пожелание' };
  }
}

/** One wishlist item as a 3D product package: drops onto the shelf, drag to spin it. */
function ProductBox({ link, href, index }: { link: string; href: string | null; index: number }) {
  const reduced = useReducedMotion();
  const spin = useMotionValue(-24);
  const rotateY = useSpring(spin, { stiffness: 140, damping: 16 });
  const shadowScale = useTransform(rotateY, (value) => 0.85 + Math.abs(Math.sin((value * Math.PI) / 180)) * 0.25);
  const startRef = useRef(0);
  const { title, subtitle } = describeLink(link);
  const tone = shelfTones[index % shelfTones.length];
  let hash = 0;
  for (const char of link) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const bars = Array.from({ length: 18 }, (_, i) => 1 + ((Math.abs(hash) >> (i % 16)) & 3));

  return (
    <motion.figure
      className="product"
      initial={reduced ? false : { opacity: 0, y: -180, rotate: (index % 2 ? 1 : -1) * 14 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true }}
      transition={{ type: 'spring', stiffness: 220, damping: 13, delay: index * 0.09 }}
    >
      <motion.div
        className={`product-box tone-${tone}`}
        style={{ rotateY, rotateX: -10 }}
        drag="x"
        dragSnapToOrigin
        dragElastic={0.2}
        dragConstraints={{ left: 0, right: 0 }}
        onDragStart={() => { startRef.current = spin.get(); }}
        onDrag={(_, info) => spin.set(startRef.current + info.offset.x * 1.4)}
        onDragEnd={(_, info) => {
          const projected = spin.get() + info.velocity.x * 0.25;
          animate(spin, Math.round(projected / 90) * 90 - 24, { type: 'spring', stiffness: 120, damping: 18 });
        }}
        whileHover={{ y: -8 }}
        whileTap={{ cursor: 'grabbing' }}
        aria-hidden="true"
      >
        <span className="pb-face pb-front">
          <span className="pb-brand">Secret Santa · №{String(index + 1).padStart(2, '0')}</span>
          <strong>{title}</strong>
          <em>{subtitle}</em>
          <span className="pb-barcode">{bars.map((w, i) => <i key={i} style={{ width: w }} />)}</span>
        </span>
        <span className="pb-face pb-back"><span className="pb-ribbon" /></span>
        <span className="pb-face pb-left" />
        <span className="pb-face pb-right"><span className="pb-side-text">{title}</span></span>
        <span className="pb-face pb-top"><span className="pb-ribbon" /></span>
        <span className="pb-face pb-bottom" />
      </motion.div>
      <motion.span className="product-shadow" style={{ scaleX: shadowScale }} aria-hidden="true" />
      <figcaption>
        {href ? <a href={href} target="_blank" rel="noreferrer">{title} ↗</a> : <span>{link}</span>}
      </figcaption>
    </motion.figure>
  );
}

export function ProductShelf({ links, toHref }: { links: string[]; toHref: (link: string) => string | null }) {
  return (
    <div className="product-shelf">
      {links.map((link, index) => <ProductBox key={link} link={link} href={toHref(link)} index={index} />)}
      <span className="product-shelf-hint">Потяните коробку, чтобы повернуть</span>
    </div>
  );
}
