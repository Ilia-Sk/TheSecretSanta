/*
 * Components adapted from Magic UI (https://magicui.design, MIT License,
 * Copyright (c) Magic UI) — the same components distributed on 21st.dev.
 * Ported from Tailwind to the project's plain CSS (see `.mu-*` classes in styles.css)
 * and tuned for Secret Santa. Animations use Motion for React (`motion/react`).
 */
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue
} from 'motion/react';
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from 'react';

/* ------------------------------------------------------------ NumberTicker */

export function NumberTicker({
  value,
  startValue = 0,
  delay = 0,
  className = ''
}: {
  value: number;
  startValue?: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(startValue);
  const spring = useSpring(motionValue, { damping: 26, stiffness: 90 });
  const inView = useInView(ref, { once: true, margin: '0px' });
  const format = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      if (ref.current) ref.current.textContent = format(value);
      return;
    }
    const timer = window.setTimeout(() => motionValue.set(value), delay * 1000);
    return () => window.clearTimeout(timer);
  }, [inView, value, delay, motionValue, reduced]);

  useEffect(() => spring.on('change', (latest) => {
    if (ref.current) ref.current.textContent = format(Math.round(latest));
  }), [spring]);

  return <span ref={ref} className={`mu-number-ticker ${className}`.trim()}>{format(startValue)}</span>;
}

/* -------------------------------------------------------------- BorderBeam */

export function BorderBeam({
  size = 120,
  duration = 8,
  delay = 0,
  colorFrom = '#f5c66b',
  colorTo = '#ff6a3d',
  borderWidth = 1.5,
  reverse = false
}: {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
  reverse?: boolean;
}) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <div className="mu-border-beam" style={{ '--beam-width': `${borderWidth}px` } as CSSProperties} aria-hidden="true">
      <motion.div
        className="mu-border-beam-dot"
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          '--color-from': colorFrom,
          '--color-to': colorTo
        } as CSSProperties}
        initial={{ offsetDistance: '0%' }}
        animate={{ offsetDistance: reverse ? ['100%', '0%'] : ['0%', '100%'] }}
        transition={{ repeat: Infinity, ease: 'linear', duration, delay: -delay }}
      />
    </div>
  );
}

/* ----------------------------------------------------------- ShimmerButton */

export type ShimmerButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  shimmerColor?: string;
  background?: string;
  loading?: boolean;
};

export const ShimmerButton = forwardRef<HTMLButtonElement, ShimmerButtonProps>(function ShimmerButton(
  { shimmerColor = '#ffe2a8', background = 'linear-gradient(110deg, #1c1917, #3a2a12 55%, #1c1917)', className = '', children, loading, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`mu-shimmer-button ${className}`.trim()}
      style={{ '--shimmer-color': shimmerColor, '--bg': background, ...props.style } as CSSProperties}
    >
      <span className="mu-shimmer-spark-wrap" aria-hidden="true">
        <span className="mu-shimmer-spark"><span className="mu-shimmer-spark-before" /></span>
      </span>
      <span className="mu-shimmer-content">{children}</span>
      <span className="mu-shimmer-highlight" aria-hidden="true" />
      <span className="mu-shimmer-backdrop" aria-hidden="true" />
    </button>
  );
});

/* -------------------------------------------------------- BlurFade (Reveal) */

export function BlurFade({
  children,
  className = '',
  delay = 0,
  duration = 0.7,
  offset = 24,
  blur = '8px',
  as = 'div',
  style
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  offset?: number;
  blur?: string;
  as?: 'div' | 'section' | 'header' | 'li';
  style?: CSSProperties;
}) {
  const Component = motion[as];
  return (
    <Component
      className={className}
      style={style}
      initial={{ opacity: 0, y: offset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ delay: 0.04 + delay, duration, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Component>
  );
}

/* ------------------------------------------------------------ WordRotate */

export function WordRotate({
  words,
  duration = 2800,
  className = ''
}: {
  words: string[];
  duration?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const interval = window.setInterval(() => setIndex((value) => (value + 1) % words.length), duration);
    return () => window.clearInterval(interval);
  }, [words, duration, reduced]);

  return (
    <span className="mu-word-rotate">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={words[index]}
          className={className}
          initial={{ opacity: 0, y: '60%', rotateX: -70, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: '0%', rotateX: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: '-60%', rotateX: 70, filter: 'blur(6px)' }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------ AnimatedShinyText */

export function AnimatedShinyText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`mu-shiny-text ${className}`.trim()}>{children}</span>;
}

/* ---------------------------------------------------------- ScrollProgress */

export function ScrollProgress({ progress, className = '' }: { progress?: MotionValue<number>; className?: string }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(progress ?? scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });
  return <motion.div className={`mu-scroll-progress ${className}`.trim()} style={{ scaleX }} aria-hidden="true" />;
}

/* -------------------------------------------------------------- TextReveal */

export function TextReveal({ text, className = '' }: { text: string; className?: string }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: sectionRef });
  const words = text.split(' ');

  if (reduced) {
    return (
      <div className={`mu-text-reveal is-static ${className}`.trim()}>
        <p className="mu-text-reveal-text">{text}</p>
      </div>
    );
  }

  return (
    <div ref={sectionRef} className={`mu-text-reveal ${className}`.trim()}>
      <div className="mu-text-reveal-sticky">
        <p className="mu-text-reveal-text" aria-label={text}>
          {words.map((word, i) => {
            const start = i / words.length;
            return <RevealWord key={i} progress={scrollYProgress} range={[start, start + 1 / words.length]}>{word}</RevealWord>;
          })}
        </p>
      </div>
    </div>
  );
}

function RevealWord({ children, progress, range }: { children: ReactNode; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0, 1]);
  const y = useTransform(progress, range, [8, 0]);
  return (
    <span className="mu-reveal-word" aria-hidden="true">
      <span className="mu-reveal-ghost">{children}</span>
      <motion.span style={{ opacity, y }}>{children}</motion.span>
    </span>
  );
}

/* -------------------------------------------------------------------- Dock */

type DockItemInjected = {
  mouseX?: MotionValue<number>;
  size?: number;
  magnification?: number;
  distance?: number;
};

export function Dock({
  children,
  className = '',
  iconSize = 44,
  iconMagnification = 64,
  iconDistance = 140,
  label
}: {
  children: ReactNode;
  className?: string;
  iconSize?: number;
  iconMagnification?: number;
  iconDistance?: number;
  label: string;
}) {
  const mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      role="tablist"
      aria-label={label}
      className={`mu-dock glass ${className}`.trim()}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') mouseX.set(event.clientX);
      }}
      onPointerLeave={() => mouseX.set(Infinity)}
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26, delay: 0.25 }}
    >
      {Children.map(children, (child) => isValidElement(child)
        ? cloneElement(child as ReactElement<DockItemInjected>, { mouseX, size: iconSize, magnification: iconMagnification, distance: iconDistance })
        : child)}
    </motion.div>
  );
}

export function DockIcon({
  mouseX,
  size = 44,
  magnification = 64,
  distance = 140,
  active = false,
  label,
  children,
  onClick,
  id,
  controls
}: DockItemInjected & {
  active?: boolean;
  label: string;
  children: ReactNode;
  onClick: () => void;
  id?: string;
  controls?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const fallback = useMotionValue(Infinity);
  // Measure the icon's resting centre once per hover instead of on every pointer
  // move: reading layout while sizes animate forced a synchronous reflow per frame.
  const centerRef = useRef<number | null>(null);
  const distanceCalc = useTransform(mouseX ?? fallback, (value: number) => {
    if (!Number.isFinite(value)) {
      centerRef.current = null;
      return Infinity;
    }
    if (centerRef.current === null && ref.current) {
      const bounds = ref.current.getBoundingClientRect();
      centerRef.current = bounds.x + bounds.width / 2;
    }
    return value - (centerRef.current ?? 0);
  });
  const sizeTransform = useTransform(distanceCalc, [-distance, 0, distance], [size, magnification, size]);
  const scaleSize = useSpring(sizeTransform, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      className={active ? 'mu-dock-item active' : 'mu-dock-item'}
      onClick={onClick}
    >
      <motion.span className="mu-dock-icon" style={{ width: scaleSize, height: scaleSize }}>
        {active && <motion.span layoutId="dock-active" className="mu-dock-active" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
        <span className="mu-dock-glyph">{children}</span>
      </motion.span>
      <span className="mu-dock-label">{label}</span>
    </button>
  );
}

/* ------------------------------------------------- Magnetic (UI UX Pro Max) */

/** Magnetic pull for 1–2 focal CTAs per screen (pull clamped at 0.3). */
export function Magnetic({ children, strength = 0.3 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const x = useSpring(0, { stiffness: 220, damping: 15, mass: 0.4 });
  const y = useSpring(0, { stiffness: 220, damping: 15, mass: 0.4 });
  const reduced = useReducedMotion();

  return (
    <motion.span
      ref={ref}
      className="mu-magnetic"
      style={{ x, y }}
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== 'mouse' || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        x.set((event.clientX - rect.left - rect.width / 2) * strength);
        y.set((event.clientY - rect.top - rect.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}

