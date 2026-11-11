import { useEffect, useRef } from 'react';
import { coveredByOverlay, onOverlayChange } from '../hooks/overlay';

/**
 * Quiet snowfall for the dark sections: three depth layers (small, slow and faint
 * far away; larger and brighter up close), a gentle sideways sway, no interaction.
 * One 2D canvas, flakes drawn from pre-rendered sprites — cheap even without a GPU.
 * Pauses off screen, behind modals and in background tabs; static with reduced motion.
 */
type Flake = { x: number; y: number; r: number; layer: number; speed: number; sway: number; phase: number; alpha: number };

const LAYERS = [
  { size: [0.8, 1.5], speed: [9, 16], alpha: 0.35, share: 0.55 },
  { size: [1.4, 2.4], speed: [16, 26], alpha: 0.55, share: 0.3 },
  { size: [2.2, 3.6], speed: [26, 40], alpha: 0.8, share: 0.15 }
] as const;

const SPRITE_SIZE = 32;
let sprite: HTMLCanvasElement | null = null;

/** A soft round flake, drawn once and scaled for every flake. */
function flakeSprite() {
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = SPRITE_SIZE;
  const ctx = sprite.getContext('2d')!;
  const c = SPRITE_SIZE / 2;
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,250,240,0.85)');
  gradient.addColorStop(1, 'rgba(255,245,230,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return sprite;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export function Snowfall({ className = '', density = 1 }: { className?: string; density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const image = flakeSprite();
    let flakes: Flake[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = 0;
    let time = 0;
    let visible = false;

    const spawn = (layer: number, anywhere: boolean): Flake => {
      const spec = LAYERS[layer];
      return {
        x: Math.random() * width,
        y: anywhere ? Math.random() * height : -10,
        r: rand(spec.size[0], spec.size[1]),
        layer,
        speed: rand(spec.speed[0], spec.speed[1]),
        sway: rand(6, 18) * (layer + 1) * 0.5,
        phase: Math.random() * Math.PI * 2,
        alpha: spec.alpha * rand(0.7, 1)
      };
    };

    const populate = () => {
      const count = Math.round((width * height) / 7500 * density);
      flakes = [];
      LAYERS.forEach((spec, layer) => {
        for (let i = 0; i < Math.round(count * spec.share); i++) flakes.push(spawn(layer, true));
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const flake of flakes) {
        const x = flake.x + Math.sin(time * 0.6 + flake.phase) * flake.sway;
        const d = flake.r * 4; // sprite has a soft halo around the core
        ctx.globalAlpha = flake.alpha;
        ctx.drawImage(image, x - d / 2, flake.y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
    };

    const step = (dt: number) => {
      time += dt;
      for (let i = 0; i < flakes.length; i++) {
        const flake = flakes[i];
        flake.y += flake.speed * dt;
        if (flake.y - flake.r * 2 > height) flakes[i] = spawn(flake.layer, false);
      }
    };

    const loop = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      step(dt);
      draw();
      if (running()) raf = requestAnimationFrame(loop);
    };

    const running = () => visible && !document.hidden && !coveredByOverlay(canvas) && !reduced;
    const sync = () => {
      if (running()) {
        if (!raf) {
          last = 0;
          raf = requestAnimationFrame(loop);
        }
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      if (!nextWidth || !nextHeight) return;
      const firstRun = width === 0;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (firstRun || Math.abs(flakes.length - (width * height) / 7500 * density) > 40) populate();
      draw();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    intersection.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    const offOverlay = onOverlayChange(sync);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', sync);
      offOverlay();
    };
  }, [density]);

  return <canvas ref={canvasRef} className={`snowfall ${className}`.trim()} aria-hidden="true" />;
}
