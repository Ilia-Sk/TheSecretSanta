/**
 * Decides how the 3D gifts are shown.
 *
 * 'webgl'  — the real-time renderer (giftRenderer / giftPhysics).
 * 'frames' — pre-rendered image sequences of the same renderer, played back on a
 *            2D canvas (the Apple product-page technique). Looks the same, costs
 *            no WebGL context and almost no GPU memory.
 *
 * Frames are used when WebGL is missing or runs without a GPU, when the GPU has
 * already dropped our contexts (the browser then blocks WebGL for the page, and
 * retrying makes it worse), when the scenes cannot hold ~30 fps, or when the
 * device reports little memory. Manual override for testing:
 *   ?gifts=frames | ?gifts=webgl   (remembered in localStorage, ?gifts=auto clears it)
 */
import { supportsWebGL, webglIsSoftware } from './giftRenderer';

export type GiftMode = 'webgl' | 'frames';

const OVERRIDE_KEY = 'santa:gifts';
const GPU_LOST_KEY = 'santa:gpu-lost-at';
const SLOW_KEY = 'santa:gifts-slow';
/** After a GPU reset, stay on frames for a while instead of provoking another one. */
const GPU_LOST_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

let forced: GiftMode | null = null;
let downgraded = false;
let reason = '';
const listeners = new Set<() => void>();

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readOverride(): GiftMode | null {
  try {
    const param = new URLSearchParams(window.location.search).get('gifts');
    if (param === 'auto') storage('local')?.removeItem(OVERRIDE_KEY);
    else if (param === 'frames' || param === 'webgl') storage('local')?.setItem(OVERRIDE_KEY, param);
  } catch {
    /* ignore */
  }
  const saved = storage('local')?.getItem(OVERRIDE_KEY);
  return saved === 'frames' || saved === 'webgl' ? saved : null;
}

function initialReason(): string {
  if (!supportsWebGL()) return 'WebGL недоступен в этом браузере';
  if (webglIsSoftware()) return 'WebGL работает без видеокарты';
  const lostAt = Number(storage('local')?.getItem(GPU_LOST_KEY) ?? 0);
  if (lostAt && Date.now() - lostAt < GPU_LOST_COOLDOWN_MS) return 'видеокарта недавно сбрасывала WebGL на этом устройстве';
  if (storage('session')?.getItem(SLOW_KEY)) return '3D не успевало отрисовываться плавно';
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) return `мало памяти (${nav.deviceMemory} ГБ)`;
  if (nav.connection?.saveData) return 'включена экономия трафика';
  return '';
}

let resolved = false;
function resolve() {
  if (resolved || typeof window === 'undefined') return;
  resolved = true;
  forced = readOverride();
  reason = initialReason();
  downgraded = reason !== '';
  syncLiteGlass();
  if (forced) console.info(`3D-подарки: режим «${forced}» задан вручную (?gifts=auto — вернуть автоматический).`);
  else if (downgraded) console.info(`3D-подарки показываются заранее отрендеренными кадрами: ${reason}.`);
}

export function giftMode(): GiftMode {
  resolve();
  if (forced) return forced;
  return downgraded ? 'frames' : 'webgl';
}

/** Switch every gift on the page to frames (and remember why). */
export function downgradeGifts(why: 'gpu-lost' | 'slow' | 'error', detail?: string) {
  resolve();
  if (why === 'gpu-lost') storage('local')?.setItem(GPU_LOST_KEY, String(Date.now()));
  if (why === 'slow') storage('session')?.setItem(SLOW_KEY, '1');
  if (forced === 'webgl') return;
  if (downgraded) return;
  downgraded = true;
  reason = detail ?? why;
  console.info(`3D-подарки переключены на заранее отрендеренные кадры: ${reason}.`);
  syncLiteGlass();
  listeners.forEach((fn) => fn());
}

/**
 * Without a usable GPU the browser composites the page on the CPU, and every
 * `backdrop-filter` blur is recomputed each frame something animates underneath
 * it (the lines, the gift) — on such machines that alone cost ~20 fps. The
 * `lite-glass` class swaps live blur for slightly denser glass (styles.css).
 */
function syncLiteGlass() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('lite-glass', downgraded && forced !== 'webgl');
}

/** Call once at startup: decides the gift mode and the glass style before first paint. */
export function initRenderingHints() {
  resolve();
}

export function onGiftModeChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
