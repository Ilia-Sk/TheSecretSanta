import { Gift } from 'lucide-react';
import { gsap } from 'gsap';
import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

type GiftRevealState = 'closed' | 'opening' | 'open';

type GiftSetters = {
  rotateX: (value: number) => void;
  rotateY: (value: number) => void;
  x: (value: number) => void;
  y: (value: number) => void;
  shadowX: (value: number) => void;
  shadowY: (value: number) => void;
  shadowScale: (value: number) => void;
  specularX: (value: number) => void;
  specularOpacity: (value: number) => void;
};

const sparkParticles = [
  { cx: 151, cy: 130, r: 2.4, dx: -23, dy: -36 },
  { cx: 180, cy: 122, r: 1.8, dx: 0, dy: -43 },
  { cx: 207, cy: 134, r: 2.2, dx: 26, dy: -34 },
  { cx: 133, cy: 158, r: 1.5, dx: -38, dy: -19 },
  { cx: 225, cy: 159, r: 1.4, dx: 43, dy: -16 },
  { cx: 162, cy: 171, r: 1.2, dx: -17, dy: -4 },
  { cx: 199, cy: 172, r: 1.2, dx: 18, dy: -5 },
  { cx: 180, cy: 146, r: 1.6, dx: 2, dy: -26 },
  { cx: 147, cy: 190, r: 1.3, dx: -30, dy: 8 },
  { cx: 214, cy: 190, r: 1.3, dx: 32, dy: 8 },
  { cx: 173, cy: 109, r: 1.2, dx: -7, dy: -50 },
  { cx: 191, cy: 111, r: 1.1, dx: 12, dy: -48 }
];

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AmbientLayer({ compact = false }: { compact?: boolean }) {
  const count = compact ? 22 : 42;
  return (
    <div className={compact ? 'ambient-layer compact' : 'ambient-layer'} aria-hidden="true">
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />
      <div className="vignette" />
      <div className="grain" />
      <div className="particle-field">
        {Array.from({ length: count }).map((_, index) => (
          <span
            key={index}
            style={{
              '--p-x': `${(index * 29) % 100}%`,
              '--p-y': `${(index * 47) % 100}%`,
              '--p-size': `${2 + (index % 4)}px`,
              '--p-delay': `${-(index % 12) * 0.7}s`,
              '--p-duration': `${11 + (index % 11)}s`
            } as CSSProperties}
          />
        ))}
      </div>
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
  const stageRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<SVGGElement>(null);
  const rigRef = useRef<SVGGElement>(null);
  const lidRef = useRef<SVGGElement>(null);
  const bowRef = useRef<SVGGElement>(null);
  const leftBowRef = useRef<SVGGElement>(null);
  const rightBowRef = useRef<SVGGElement>(null);
  const knotRef = useRef<SVGGElement>(null);
  const verticalRibbonRef = useRef<SVGGElement>(null);
  const horizontalRibbonRef = useRef<SVGGElement>(null);
  const glowRef = useRef<SVGGElement>(null);
  const shadowRef = useRef<SVGEllipseElement>(null);
  const specularRef = useRef<SVGPathElement>(null);
  const hoverSweepRef = useRef<SVGRectElement>(null);
  const particleGroupRef = useRef<SVGGElement>(null);
  const settersRef = useRef<GiftSetters | null>(null);
  const idleTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const revealTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const hoverSweepTimelineRef = useRef<gsap.core.Tween | null>(null);
  const targetState = revealState ?? (open ? 'open' : 'closed');
  const idPrefix = `gift-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ids = {
    bodyGradient: `${idPrefix}-body-gradient`,
    bodySideGradient: `${idPrefix}-body-side-gradient`,
    lidGradient: `${idPrefix}-lid-gradient`,
    ribbonGradient: `${idPrefix}-ribbon-gradient`,
    glowGradient: `${idPrefix}-glow-gradient`,
    specularGradient: `${idPrefix}-specular-gradient`,
    sweepGradient: `${idPrefix}-sweep-gradient`,
    softBlur: `${idPrefix}-soft-blur`,
    fineShadow: `${idPrefix}-fine-shadow`,
    ribbonClip: `${idPrefix}-ribbon-clip`
  };
  const urlFor = (id: string) => `url(#${id})`;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const rig = rigRef.current;
    const float = floatRef.current;
    const shadow = shadowRef.current;
    const specular = specularRef.current;
    const hoverSweep = hoverSweepRef.current;
    if (!stage || !rig || !float || !shadow || !specular || !hoverSweep) return;

    const reduced = prefersReducedMotion();
    const context = gsap.context(() => {
      gsap.set([rig, float], { transformOrigin: '50% 50%' });
      gsap.set([lidRef.current, bowRef.current, leftBowRef.current, rightBowRef.current, knotRef.current], {
        transformOrigin: '50% 70%'
      });
      gsap.set([verticalRibbonRef.current, horizontalRibbonRef.current], { transformOrigin: '50% 50%' });
      gsap.set(glowRef.current, { opacity: 0, scale: 0.82, transformOrigin: '50% 50%' });
      gsap.set(particleGroupRef.current?.children ?? [], { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' });
      gsap.set(hoverSweep, { opacity: 0, x: -90 });

      if (reduced || !interactive) {
        settersRef.current = null;
        return;
      }

      settersRef.current = {
        rotateX: gsap.quickTo(rig, 'rotationX', { duration: 0.62, ease: 'power3.out' }),
        rotateY: gsap.quickTo(rig, 'rotationY', { duration: 0.62, ease: 'power3.out' }),
        x: gsap.quickTo(rig, 'x', { duration: 0.62, ease: 'power3.out' }),
        y: gsap.quickTo(rig, 'y', { duration: 0.62, ease: 'power3.out' }),
        shadowX: gsap.quickTo(shadow, 'x', { duration: 0.7, ease: 'power3.out' }),
        shadowY: gsap.quickTo(shadow, 'y', { duration: 0.7, ease: 'power3.out' }),
        shadowScale: gsap.quickTo(shadow, 'scaleX', { duration: 0.7, ease: 'power3.out' }),
        specularX: gsap.quickTo(specular, 'x', { duration: 0.55, ease: 'power3.out' }),
        specularOpacity: gsap.quickTo(specular, 'opacity', { duration: 0.4, ease: 'power2.out' })
      };

      idleTimelineRef.current = gsap.timeline({ repeat: -1, yoyo: true })
        .to(float, { y: -3, duration: 3.8, ease: 'sine.inOut' })
        .to(shadow, { scaleX: 0.96, opacity: 0.58, duration: 3.8, ease: 'sine.inOut' }, 0);
    }, stage);

    return () => {
      idleTimelineRef.current?.kill();
      revealTimelineRef.current?.kill();
      hoverSweepTimelineRef.current?.kill();
      settersRef.current = null;
      context.revert();
    };
  }, [interactive]);

  useLayoutEffect(() => {
    const lid = lidRef.current;
    const bow = bowRef.current;
    const leftBow = leftBowRef.current;
    const rightBow = rightBowRef.current;
    const knot = knotRef.current;
    const verticalRibbon = verticalRibbonRef.current;
    const horizontalRibbon = horizontalRibbonRef.current;
    const glow = glowRef.current;
    const particles = particleGroupRef.current?.children;
    if (!lid || !bow || !leftBow || !rightBow || !knot || !verticalRibbon || !horizontalRibbon || !glow) return;

    revealTimelineRef.current?.kill();

    const closedState = {
      lid: { x: 0, y: 0, rotation: 0 },
      bow: { x: 0, y: 0, rotation: 0, scale: 1 },
      leftBow: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      rightBow: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      knot: { scale: 1, y: 0 },
      verticalRibbon: { opacity: 1, scaleY: 1, y: 0 },
      horizontalRibbon: { opacity: 1, scaleX: 1, y: 0 },
      glow: { opacity: 0, scale: 0.82 }
    };

    const openState = {
      lid: { x: 10, y: -56, rotation: -5 },
      bow: { x: 8, y: -58, rotation: -5, scale: 0.98 },
      leftBow: { x: -7, y: -2, rotation: -7, scaleX: 1.04, scaleY: 0.96 },
      rightBow: { x: 7, y: -2, rotation: 7, scaleX: 1.04, scaleY: 0.96 },
      knot: { scale: 0.94, y: -1 },
      verticalRibbon: { opacity: 0.62, scaleY: 0.9, y: 8 },
      horizontalRibbon: { opacity: 0.5, scaleX: 0.9, y: 11 },
      glow: { opacity: 1, scale: 1.08 }
    };

    function setGiftState(state: typeof closedState, duration = 0.58) {
      const method = duration === 0 ? gsap.set : gsap.to;
      method(lid, { ...state.lid, duration, ease: 'power3.out' });
      method(bow, { ...state.bow, duration, ease: 'power3.out' });
      method(leftBow, { ...state.leftBow, duration, ease: 'power3.out' });
      method(rightBow, { ...state.rightBow, duration, ease: 'power3.out' });
      method(knot, { ...state.knot, duration, ease: 'power3.out' });
      method(verticalRibbon, { ...state.verticalRibbon, duration, ease: 'power3.out' });
      method(horizontalRibbon, { ...state.horizontalRibbon, duration, ease: 'power3.out' });
      method(glow, { ...state.glow, duration, ease: 'power2.out' });
      if (particles) {
        gsap.set(particles, { opacity: 0, scale: 0.4, x: 0, y: 0 });
      }
    }

    if (targetState === 'opening') {
      setGiftState(closedState, 0);
      if (prefersReducedMotion()) {
        setGiftState(openState, 0);
        const timeout = window.setTimeout(() => onRevealComplete?.(), 420);
        return () => window.clearTimeout(timeout);
      }

      revealTimelineRef.current = gsap.timeline({ onComplete: onRevealComplete })
        .to([leftBow, rightBow, knot], { y: -2, scaleY: 0.93, duration: 0.42, ease: 'sine.inOut' }, 0.7)
        .to(horizontalRibbon, { y: 7, scaleX: 0.92, opacity: 0.72, duration: 0.44, ease: 'power2.out' }, 1.08)
        .to(verticalRibbon, { y: 7, scaleY: 0.91, opacity: 0.74, duration: 0.44, ease: 'power2.out' }, 1.16)
        .to(bow, { x: 8, y: -58, rotation: -5, scale: 0.98, duration: 0.64, ease: 'power3.out' }, 1.52)
        .to(lid, { x: 10, y: -56, rotation: -5, duration: 0.7, ease: 'power3.out' }, 1.72)
        .to(glow, { opacity: 1, scale: 1.08, duration: 0.58, ease: 'sine.out' }, 2.1);

      if (particles) {
        Array.from(particles).forEach((particle, index) => {
          const spec = sparkParticles[index % sparkParticles.length];
          revealTimelineRef.current?.fromTo(
            particle,
            { opacity: 0, x: 0, y: 0, scale: 0.35 },
            { opacity: 0.92, x: spec.dx, y: spec.dy, scale: 1, duration: 0.54, ease: 'power2.out' },
            2.48 + index * 0.028
          ).to(
            particle,
            { opacity: 0, y: spec.dy - 16, duration: 0.48, ease: 'sine.in' },
            2.9 + index * 0.02
          );
        });
      }
      revealTimelineRef.current.to(glow, { opacity: 0.92, duration: 0.28, ease: 'sine.inOut' }, 3.34);
      return;
    }

    setGiftState(targetState === 'open' ? openState : closedState, prefersReducedMotion() ? 0 : 0.58);
  }, [targetState, onRevealComplete]);

  useEffect(() => () => {
    idleTimelineRef.current?.kill();
    revealTimelineRef.current?.kill();
    hoverSweepTimelineRef.current?.kill();
  }, []);

  function updateTilt(event: React.PointerEvent<HTMLDivElement>) {
    const setters = settersRef.current;
    if (!interactive || !setters) return;
    if (!window.matchMedia('(pointer: fine)').matches || prefersReducedMotion()) return;

    const target = stageRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));

    setters.rotateY(x * 5);
    setters.rotateX(y * -3);
    setters.x(x * 3);
    setters.y(y * 2.4);
    setters.shadowX(x * -7);
    setters.shadowY(Math.abs(y) * 2.5);
    setters.shadowScale(1 - Math.min(0.07, Math.abs(x) * 0.035 + Math.abs(y) * 0.035));
    setters.specularX(x * 20);
    setters.specularOpacity(0.2 + Math.min(0.18, Math.abs(x) * 0.1 + Math.abs(y) * 0.08));
  }

  function resetTilt() {
    const setters = settersRef.current;
    if (!setters) return;
    setters.rotateY(0);
    setters.rotateX(0);
    setters.x(0);
    setters.y(0);
    setters.shadowX(0);
    setters.shadowY(0);
    setters.shadowScale(1);
    setters.specularX(0);
    setters.specularOpacity(0.18);
  }

  function runHoverSweep() {
    if (!interactive || prefersReducedMotion() || !hoverSweepRef.current) return;
    hoverSweepTimelineRef.current?.kill();
    hoverSweepTimelineRef.current = gsap.fromTo(
      hoverSweepRef.current,
      { opacity: 0, x: -86 },
      { opacity: 0.38, x: 86, duration: 0.72, ease: 'power2.out', repeat: 1, yoyo: true }
    );
  }

  return (
    <div
      ref={stageRef}
      className={`gift-stage premium-gift-stage ${targetState === 'open' ? 'gift-open' : ''} ${className}`.trim()}
      onPointerEnter={runHoverSweep}
      onPointerMove={updateTilt}
      onPointerLeave={resetTilt}
      aria-hidden="true"
    >
      <svg className="premium-gift-svg" viewBox="0 0 360 360" role="img">
        <defs>
          <linearGradient id={ids.bodyGradient} x1="72" y1="126" x2="284" y2="304" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#b83a42" />
            <stop offset="0.43" stopColor="#861c27" />
            <stop offset="1" stopColor="#3b0810" />
          </linearGradient>
          <linearGradient id={ids.bodySideGradient} x1="245" y1="156" x2="278" y2="292" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7b1720" />
            <stop offset="1" stopColor="#260509" />
          </linearGradient>
          <linearGradient id={ids.lidGradient} x1="78" y1="107" x2="280" y2="155" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#cf4d52" />
            <stop offset="0.48" stopColor="#96222d" />
            <stop offset="1" stopColor="#5b1119" />
          </linearGradient>
          <linearGradient id={ids.ribbonGradient} x1="128" y1="110" x2="221" y2="298" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff1b8" />
            <stop offset="0.24" stopColor="#e8c872" />
            <stop offset="0.58" stopColor="#bf8f34" />
            <stop offset="1" stopColor="#7c531e" />
          </linearGradient>
          <radialGradient id={ids.glowGradient} cx="50%" cy="45%" r="58%">
            <stop offset="0" stopColor="#fff4be" stopOpacity="0.9" />
            <stop offset="0.38" stopColor="#f0c466" stopOpacity="0.38" />
            <stop offset="1" stopColor="#f0c466" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={ids.specularGradient} x1="116" y1="120" x2="210" y2="290" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff6e0" stopOpacity="0" />
            <stop offset="0.45" stopColor="#fff6e0" stopOpacity="0.34" />
            <stop offset="1" stopColor="#fff6e0" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={ids.sweepGradient} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff6d4" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff6d4" stopOpacity="0.68" />
            <stop offset="1" stopColor="#fff6d4" stopOpacity="0" />
          </linearGradient>
          <filter id={ids.softBlur} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
          <filter id={ids.fineShadow} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#050605" floodOpacity="0.28" />
          </filter>
          <clipPath id={ids.ribbonClip}>
            <path d="M88 116h184c8 0 14 6 14 14v23c0 8-6 14-14 14H88c-8 0-14-6-14-14v-23c0-8 6-14 14-14Z" />
          </clipPath>
        </defs>

        <ellipse ref={shadowRef} className="premium-gift-shadow" cx="180" cy="307" rx="94" ry="18" />

        <g ref={floatRef}>
          <g ref={rigRef} className="premium-gift-rig" filter={urlFor(ids.fineShadow)}>
            <g ref={glowRef} className="premium-gift-glow">
              <ellipse cx="180" cy="158" rx="92" ry="76" fill={urlFor(ids.glowGradient)} filter={urlFor(ids.softBlur)} />
              <ellipse cx="180" cy="174" rx="58" ry="25" fill="#ffe9a4" opacity="0.32" />
            </g>

            <g className="premium-gift-body-layer">
              <path d="M93 154h174c6 0 11 5 10 11l-13 124c-1 7-6 12-13 12H109c-7 0-12-5-13-12L83 165c-1-6 4-11 10-11Z" fill={urlFor(ids.bodyGradient)} />
              <path d="M244 154h23c6 0 11 5 10 11l-13 124c-1 7-6 12-13 12h-29c12-43 18-92 22-147Z" fill={urlFor(ids.bodySideGradient)} opacity="0.72" />
              <path d="M96 164c48 10 116 11 178 0" fill="none" stroke="#f9d3c6" strokeOpacity="0.12" strokeWidth="2" />
              <path d="M108 208c40 7 99 8 146 0M113 248c38 5 87 6 132 0" fill="none" stroke="#fff1df" strokeOpacity="0.08" strokeWidth="2" />
              <path ref={specularRef} d="M116 157c17 40 20 91 13 139" fill="none" stroke={urlFor(ids.specularGradient)} strokeWidth="28" strokeLinecap="round" opacity="0.18" />
            </g>

            <g ref={verticalRibbonRef} className="premium-gift-ribbon premium-gift-ribbon-vertical">
              <path d="M164 148h33l-2 153h-33l2-153Z" fill={urlFor(ids.ribbonGradient)} />
              <path d="M169 151h8l-2 148h-8l2-148Z" fill="#fff7d4" opacity="0.28" />
              <path d="M190 151h5l-2 148h-5l2-148Z" fill="#57310b" opacity="0.22" />
            </g>

            <g ref={horizontalRibbonRef} className="premium-gift-ribbon premium-gift-ribbon-horizontal">
              <path d="M88 203h180l-5 33H94l-6-33Z" fill={urlFor(ids.ribbonGradient)} />
              <path d="M93 207h168" stroke="#fff5cc" strokeOpacity="0.28" strokeWidth="3" strokeLinecap="round" />
              <rect ref={hoverSweepRef} x="91" y="202" width="36" height="36" fill={urlFor(ids.sweepGradient)} opacity="0" transform="skewX(-16)" />
            </g>

            <g ref={lidRef} className="premium-gift-lid">
              <path d="M86 114h188c8 0 14 6 14 14v25c0 8-6 14-14 14H86c-8 0-14-6-14-14v-25c0-8 6-14 14-14Z" fill={urlFor(ids.lidGradient)} />
              <path d="M84 116c52 12 127 13 196 2" fill="none" stroke="#fff0df" strokeOpacity="0.18" strokeWidth="2" />
              <path d="M78 158h204" stroke="#230406" strokeOpacity="0.42" strokeWidth="5" strokeLinecap="round" />
              <g clipPath={urlFor(ids.ribbonClip)}>
                <path d="M162 110h35v62h-35z" fill={urlFor(ids.ribbonGradient)} />
                <path d="M170 113h8v55h-8z" fill="#fff7d4" opacity="0.25" />
              </g>
            </g>

            <g ref={bowRef} className="premium-gift-bow">
              <path d="M181 115c-25-25-68-23-78 1-6 15 10 28 30 24 18-4 35-15 48-25Z" fill={urlFor(ids.ribbonGradient)} />
              <g ref={leftBowRef}>
                <path d="M177 113c-26-30-67-36-87-17-14 13-6 36 17 43 24 8 53-7 70-26Z" fill={urlFor(ids.ribbonGradient)} />
                <path d="M160 112c-18-12-38-15-55-7" fill="none" stroke="#fff7d4" strokeOpacity="0.34" strokeWidth="4" strokeLinecap="round" />
                <path d="M146 129c-18 6-31 6-41 0" fill="none" stroke="#6d4314" strokeOpacity="0.26" strokeWidth="4" strokeLinecap="round" />
              </g>
              <g ref={rightBowRef}>
                <path d="M183 113c26-30 67-36 87-17 14 13 6 36-17 43-24 8-53-7-70-26Z" fill={urlFor(ids.ribbonGradient)} />
                <path d="M200 112c18-12 38-15 55-7" fill="none" stroke="#fff7d4" strokeOpacity="0.34" strokeWidth="4" strokeLinecap="round" />
                <path d="M214 129c18 6 31 6 41 0" fill="none" stroke="#6d4314" strokeOpacity="0.26" strokeWidth="4" strokeLinecap="round" />
              </g>
              <path d="M151 143c-8 15-18 23-32 32 17 3 31-1 43-9l11-31-22 8Z" fill="#b9852e" opacity="0.95" />
              <path d="M209 143c8 15 18 23 32 32-17 3-31-1-43-9l-11-31 22 8Z" fill="#b9852e" opacity="0.95" />
              <g ref={knotRef}>
                <path d="M160 118c9-12 31-12 40 0 8 10 3 28-20 31-23-3-28-21-20-31Z" fill={urlFor(ids.ribbonGradient)} />
                <path d="M169 121c7-4 16-4 24 0" fill="none" stroke="#fff7d4" strokeOpacity="0.42" strokeWidth="4" strokeLinecap="round" />
              </g>
            </g>

            <g className="premium-gift-highlights">
              <path d="M98 163c15 8 38 11 70 10" fill="none" stroke="#fff0df" strokeOpacity="0.16" strokeWidth="3" strokeLinecap="round" />
              <path d="M206 156c22 6 43 6 63 1" fill="none" stroke="#fff0df" strokeOpacity="0.1" strokeWidth="3" strokeLinecap="round" />
              <path d="M164 204h33" stroke="#fff9d6" strokeOpacity="0.22" strokeWidth="2" />
            </g>

            <g ref={particleGroupRef} className="premium-gift-particles">
              {sparkParticles.map((particle, index) => (
                index % 3 === 0 ? (
                  <path
                    key={index}
                    d={`M${particle.cx} ${particle.cy - 4}l2 3.5 4 .5-3 2.7.8 4-3.8-2-3.7 2 .7-4-3-2.7 4-.5 2-3.5Z`}
                    fill="#ffe39a"
                  />
                ) : (
                  <circle key={index} cx={particle.cx} cy={particle.cy} r={particle.r} fill="#ffe39a" />
                )
              ))}
            </g>
          </g>
        </g>
      </svg>
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
