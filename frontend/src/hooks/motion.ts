import { useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import type { RefObject } from 'react';

/**
 * Apple-style hero exit built on Motion's useScroll: as the section scrolls away
 * its visual sinks back in depth. Returns a style object for a motion element.
 */
export function useHeroDepth(target: RefObject<HTMLElement>) {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ['start start', 'end start'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });
  const scale = useTransform(smooth, [0, 1], [1, 0.8]);
  const y = useTransform(smooth, [0, 1], ['0%', '16%']);
  const rotateX = useTransform(smooth, [0, 1], [0, 16]);
  const opacity = useTransform(smooth, [0, 0.9], [1, 0.25]);
  return reduced ? {} : { scale, y, rotateX, opacity, transformPerspective: 1200 };
}

/** Subtle parallax for copy blocks inside a scrolling hero. */
export function useParallax(target: RefObject<HTMLElement>, distance = 80) {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -distance]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  return reduced ? {} : { y, opacity };
}
