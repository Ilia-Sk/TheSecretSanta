/**
 * Reuses WebGL renderers between mounts.
 *
 * Creating a WebGL context (getContext + shader compile) and releasing it
 * (loseContext) are synchronous and can block the main thread for tens to
 * hundreds of milliseconds — exactly while a page transition is animating.
 * Instead of destroying a renderer on unmount we park it here (canvas detached,
 * render loop stopped) and hand it to the next component that needs the same
 * kind of renderer. The number of live contexts stays small and bounded.
 */
export interface PooledRenderer {
  readonly element: HTMLCanvasElement;
  stop(): void;
  dispose(): void;
  isLost(): boolean;
  /** Shrink the drawing buffer to 1×1 so a parked renderer holds almost no GPU memory. */
  releaseBuffer(): void;
}

// Each parked renderer still owns a WebGL context; keep few of them.
const MAX_PARKED = 2;
const parked: Array<{ key: string; renderer: PooledRenderer }> = [];

export function takeRenderer<T extends PooledRenderer>(key: string): T | null {
  for (let i = parked.length - 1; i >= 0; i--) {
    const entry = parked[i];
    if (entry.key !== key) continue;
    parked.splice(i, 1);
    if (entry.renderer.isLost()) {
      entry.renderer.dispose();
      continue;
    }
    return entry.renderer as T;
  }
  return null;
}

export function parkRenderer(key: string, renderer: PooledRenderer) {
  renderer.releaseBuffer();
  renderer.element.remove();
  if (renderer.isLost()) {
    renderer.dispose();
    return;
  }
  parked.push({ key, renderer });
  while (parked.length > MAX_PARKED) parked.shift()?.renderer.dispose();
}

/**
 * Run heavy setup when the browser is idle, so a page transition that just
 * started is not interrupted. Returns a cancel function.
 */
export function whenIdle(fn: () => void, timeout = 700): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 320);
  return () => window.clearTimeout(id);
}
