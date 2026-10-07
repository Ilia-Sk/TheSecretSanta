import { Gift } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { CSSProperties } from 'react';

type GiftRevealState = 'closed' | 'opening' | 'open';

function seeded(index: number) {
  const value = Math.sin(index * 9301 + 49297) * 233280;
  return value - Math.floor(value);
}

function finePointer() {
  return (
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const particles = Array.from({ length: 18 }, (_, index) => ({
  left: seeded(index) * 100,
  top: 10 + seeded(index + 100) * 90,
  size: 0.7 + Math.pow(seeded(index + 200), 2) * 2.1,
  duration: 42 + seeded(index + 300) * 46,
  delay: -seeded(index + 400) * 82,
  dx: (seeded(index + 500) - 0.5) * 44,
  opacity: 0.1 + seeded(index + 600) * 0.32,
  blur: seeded(index + 700) > 0.7
}));

export function AmbientLayer({ compact = false }: { compact?: boolean }) {
  const lightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const light = lightRef.current;
    if (!light || !finePointer()) return;
    const node = light;

    let x = 0.3;
    let y = 0.4;
    let targetX = x;
    let targetY = y;
    let frameId = 0;
    let running = false;

    function animate() {
      x += (targetX - x) * 0.052;
      y += (targetY - y) * 0.052;
      node.style.transform = `translate3d(${x * window.innerWidth - 340}px, ${y * window.innerHeight - 260}px, 0)`;

      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.0005) {
        frameId = window.requestAnimationFrame(animate);
      } else {
        running = false;
      }
    }

    function onPointerMove(event: PointerEvent) {
      targetX = event.clientX / window.innerWidth;
      targetY = event.clientY / window.innerHeight;
      if (!running) {
        running = true;
        frameId = window.requestAnimationFrame(animate);
      }
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className={compact ? 'ambient-layer compact reference-atmosphere' : 'ambient-layer reference-atmosphere'} aria-hidden="true">
      <div className="ambient-gradient" />
      <div ref={lightRef} className="cursor-follow-light" />
      <div className="grain" />
      <div className="particle-field reference-particles">
        {particles.map((particle, index) => (
          <span
            key={index}
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: particle.size,
              height: particle.size,
              filter: particle.blur ? 'blur(1px)' : undefined,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`,
              '--dx': `${particle.dx}px`,
              '--o': particle.opacity
            } as CSSProperties}
          />
        ))}
      </div>
      <div className="vignette" />
    </div>
  );
}

export function PremiumGiftObject({
  className = '',
  interactive = true,
  open = false,
  revealState,
  onRevealComplete
}: {
  className?: string;
  interactive?: boolean;
  open?: boolean;
  revealState?: GiftRevealState;
  onRevealComplete?: () => void;
}) {
  const objectRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const targetState = revealState ?? (open ? 'open' : 'closed');
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = `gift-${rawId}`;
  const ids = {
    body: `${id}-body`,
    bodyVertical: `${id}-body-v`,
    lid: `${id}-lid`,
    lidTop: `${id}-lid-top`,
    ribbon: `${id}-rib`,
    ribbonHorizontal: `${id}-rib-h`,
    loop: `${id}-loop`,
    sheen: `${id}-sheen`,
    ribbonClip: `${id}-ribbon-clip`
  };
  const url = (value: string) => `url(#${value})`;

  useEffect(() => {
    if (!interactive || !finePointer()) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frameId = 0;
    const startedAt = performance.now();

    function onPointerMove(event: PointerEvent) {
      targetX = (event.clientX / window.innerWidth) * 2 - 1;
      targetY = (event.clientY / window.innerHeight) * 2 - 1;
    }

    function animate(time: number) {
      currentX += (targetX - currentX) * 0.045;
      currentY += (targetY - currentY) * 0.045;
      const float = Math.sin((time - startedAt) / 1700) * 2.6;

      if (objectRef.current) {
        objectRef.current.style.transform = `translateY(${float}px) rotateY(${currentX * 4}deg) rotateX(${-currentY * 2.5}deg)`;
      }
      if (shadowRef.current) {
        shadowRef.current.style.transform = `translateX(${-currentX * 10}px) scale(${1 - float / 120})`;
        shadowRef.current.style.opacity = String(0.66 - float / 42);
      }

      frameId = window.requestAnimationFrame(animate);
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.cancelAnimationFrame(frameId);
    };
  }, [interactive]);

  useEffect(() => {
    if (targetState !== 'opening') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeoutId = window.setTimeout(() => onRevealComplete?.(), reduced ? 120 : 1650);
    return () => window.clearTimeout(timeoutId);
  }, [targetState, onRevealComplete]);

  return (
    <div
      className={[
        'gift-stage premium-gift-stage reference-gift-stage',
        interactive ? 'gift-hoverable' : '',
        targetState === 'open' ? 'gift-open' : '',
        targetState === 'opening' ? 'gift-opening' : '',
        className
      ].filter(Boolean).join(' ')}
      style={{ perspective: '1400px' }}
      aria-hidden="true"
    >
      <div ref={shadowRef} className="reference-gift-shadow" />
      <div ref={objectRef} className="gift-rigid-object">
        <svg viewBox="0 0 400 420" className="reference-gift-svg" role="img" aria-label="Подарок">
          <defs>
            <linearGradient id={ids.body} x1="0" x2="1">
              <stop offset="0" stopColor="oklch(0.2 0.07 16)" />
              <stop offset="0.35" stopColor="oklch(0.36 0.12 18)" />
              <stop offset="0.6" stopColor="oklch(0.32 0.11 18)" />
              <stop offset="1" stopColor="oklch(0.17 0.06 16)" />
            </linearGradient>
            <linearGradient id={ids.bodyVertical} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="oklch(0 0 0 / 0.35)" />
              <stop offset="0.12" stopColor="oklch(0 0 0 / 0)" />
              <stop offset="1" stopColor="oklch(0 0 0 / 0.3)" />
            </linearGradient>
            <linearGradient id={ids.lid} x1="0" x2="1">
              <stop offset="0" stopColor="oklch(0.24 0.08 16)" />
              <stop offset="0.38" stopColor="oklch(0.42 0.13 19)" />
              <stop offset="0.62" stopColor="oklch(0.36 0.12 18)" />
              <stop offset="1" stopColor="oklch(0.2 0.07 16)" />
            </linearGradient>
            <linearGradient id={ids.lidTop} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="oklch(0.46 0.13 20)" />
              <stop offset="1" stopColor="oklch(0.32 0.11 18)" />
            </linearGradient>
            <linearGradient id={ids.ribbon} x1="0" x2="1">
              <stop offset="0" stopColor="oklch(0.55 0.07 72)" />
              <stop offset="0.3" stopColor="oklch(0.88 0.07 86)" />
              <stop offset="0.5" stopColor="oklch(0.74 0.09 76)" />
              <stop offset="0.75" stopColor="oklch(0.9 0.06 88)" />
              <stop offset="1" stopColor="oklch(0.52 0.07 70)" />
            </linearGradient>
            <linearGradient id={ids.ribbonHorizontal} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="oklch(0.9 0.06 88)" />
              <stop offset="0.5" stopColor="oklch(0.72 0.09 75)" />
              <stop offset="1" stopColor="oklch(0.5 0.07 70)" />
            </linearGradient>
            <radialGradient id={ids.loop} cx="0.4" cy="0.35" r="0.8">
              <stop offset="0" stopColor="oklch(0.93 0.05 88)" />
              <stop offset="0.5" stopColor="oklch(0.76 0.09 78)" />
              <stop offset="1" stopColor="oklch(0.5 0.07 70)" />
            </radialGradient>
            <radialGradient id={ids.sheen} cx="0.3" cy="0.2" r="0.7">
              <stop offset="0" stopColor="oklch(1 0 0 / 0.14)" />
              <stop offset="1" stopColor="oklch(1 0 0 / 0)" />
            </radialGradient>
            <clipPath id={ids.ribbonClip}>
              <rect x="185" y="122" width="30" height="52" rx="1" />
              <rect x="186" y="170" width="28" height="215" rx="1" />
              <rect x="188" y="105" width="24" height="20" rx="6" />
            </clipPath>
          </defs>

          <g className="reference-gift-body">
            <rect x="70" y="170" width="260" height="215" rx="3" fill={url(ids.body)} />
            <rect x="70" y="170" width="260" height="215" rx="3" fill={url(ids.bodyVertical)} />
            <rect x="70" y="170" width="260" height="215" rx="3" fill={url(ids.sheen)} />
            <line x1="71" y1="384" x2="329" y2="384" stroke="oklch(0 0 0 / 0.5)" strokeWidth="2" />
            <line x1="71" y1="172" x2="71" y2="384" stroke="oklch(1 0 0 / 0.06)" />
            <rect x="186" y="170" width="28" height="215" fill={url(ids.ribbon)} />
            <rect x="186" y="170" width="28" height="215" fill={url(ids.bodyVertical)} opacity="0.7" />
            <rect x="70" y="170" width="260" height="14" fill="oklch(0 0 0 / 0.45)" />
          </g>

          <g className="reference-gift-lid">
            <rect x="56" y="122" width="288" height="52" rx="3" fill={url(ids.lid)} />
            <rect x="56" y="122" width="288" height="5" rx="2" fill={url(ids.lidTop)} />
            <line x1="58" y1="122.6" x2="342" y2="122.6" stroke="oklch(0.9 0.05 40 / 0.35)" />
            <line x1="57" y1="173" x2="343" y2="173" stroke="oklch(0 0 0 / 0.5)" strokeWidth="1.5" />
            <rect x="56" y="122" width="288" height="52" rx="3" fill={url(ids.sheen)} />
            <rect x="185" y="122" width="30" height="52" fill={url(ids.ribbon)} />
            <rect x="185" y="122" width="30" height="3" fill="oklch(0.95 0.04 88 / 0.6)" />
          </g>

          <g className="reference-gift-bow">
            <path d="M197 120 C 188 140, 172 158, 160 176 L 172 180 C 182 162, 194 144, 201 124 Z" fill={url(ids.ribbonHorizontal)} />
            <path d="M203 120 C 214 140, 230 156, 244 172 L 233 178 C 220 162, 207 144, 199 124 Z" fill={url(ids.ribbonHorizontal)} opacity="0.92" />
            <path d="M200 116 C 178 86, 132 82, 128 104 C 125 122, 168 126, 200 118 Z" fill={url(ids.loop)} />
            <path d="M200 116 C 176 98, 146 96, 142 106 C 160 110, 180 114, 200 118 Z" fill="oklch(0.45 0.06 70 / 0.55)" />
            <path d="M200 116 C 222 86, 268 82, 272 104 C 275 122, 232 126, 200 118 Z" fill={url(ids.loop)} />
            <path d="M200 116 C 224 98, 254 96, 258 106 C 240 110, 220 114, 200 118 Z" fill="oklch(0.45 0.06 70 / 0.55)" />
            <path d="M140 96 C 156 88, 178 94, 192 108" stroke="oklch(0.97 0.03 90 / 0.6)" strokeWidth="1.2" fill="none" />
            <path d="M260 96 C 244 88, 222 94, 208 108" stroke="oklch(0.97 0.03 90 / 0.45)" strokeWidth="1.2" fill="none" />
            <rect x="188" y="105" width="24" height="20" rx="6" fill={url(ids.ribbon)} />
            <rect x="190" y="106" width="20" height="4" rx="2" fill="oklch(0.97 0.03 90 / 0.5)" />
            <g clipPath={url(ids.ribbonClip)} opacity="0.85">
              <rect className="gift-satin-highlight" x="-80" y="92" width="44" height="320" fill="oklch(1 0 0 / 0.2)" />
            </g>
          </g>

          <g className="reference-gift-reveal-light">
            <ellipse cx="200" cy="166" rx="94" ry="44" fill="oklch(0.86 0.07 85 / 0.35)" />
            <ellipse cx="200" cy="170" rx="54" ry="20" fill="oklch(0.94 0.03 86 / 0.48)" />
          </g>
        </svg>
      </div>
      {interactive && <span className="gift-hover-sheen" aria-hidden="true" />}
      <div className="gift-sparkles" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => <span key={index} />)}
      </div>
    </div>
  );
}

export function MiniGiftMark() {
  return (
    <span className="mini-gift-mark" aria-hidden="true">
      <Gift size={18} />
    </span>
  );
}
