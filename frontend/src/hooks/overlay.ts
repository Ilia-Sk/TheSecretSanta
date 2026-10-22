/**
 * Tracks whether a modal is open. Background animations (WebGL gifts, the
 * animated line field) pause while one is, so the modal's own animation gets
 * the whole frame budget. Scenes rendered inside the modal keep running.
 */
let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function pushOverlay(): () => void {
  openCount++;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount--;
    emit();
  };
}

export function onOverlayChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when a modal is open and `element` is behind it (not inside it). */
export function coveredByOverlay(element: Element): boolean {
  return openCount > 0 && !element.closest('.modal-backdrop');
}
