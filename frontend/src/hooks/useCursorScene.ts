import { RefObject, useEffect } from 'react';

export function useCursorScene<T extends HTMLElement>(ref: RefObject<T>) {
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const node = element;

    let targetX = 0.5;
    let targetY = 0.5;
    let currentX = 0.5;
    let currentY = 0.5;
    let frameId = 0;

    function updatePointer(event: PointerEvent) {
      const rect = node.getBoundingClientRect();
      targetX = (event.clientX - rect.left) / rect.width;
      targetY = (event.clientY - rect.top) / rect.height;
    }

    function animate() {
      currentX += (targetX - currentX) * 0.075;
      currentY += (targetY - currentY) * 0.075;
      const px = `${(currentX * 100).toFixed(2)}%`;
      const py = `${(currentY * 100).toFixed(2)}%`;
      const rx = ((currentY - 0.5) * -6).toFixed(3);
      const ry = ((currentX - 0.5) * 7).toFixed(3);
      node.style.setProperty('--cursor-x', px);
      node.style.setProperty('--cursor-y', py);
      node.style.setProperty('--scene-x', `${((currentX - 0.5) * 2).toFixed(4)}`);
      node.style.setProperty('--scene-y', `${((currentY - 0.5) * 2).toFixed(4)}`);
      node.style.setProperty('--gift-rx', `${rx}deg`);
      node.style.setProperty('--gift-ry', `${ry}deg`);
      frameId = window.requestAnimationFrame(animate);
    }

    node.addEventListener('pointermove', updatePointer, { passive: true });
    frameId = window.requestAnimationFrame(animate);

    return () => {
      node.removeEventListener('pointermove', updatePointer);
      window.cancelAnimationFrame(frameId);
    };
  }, [ref]);
}
