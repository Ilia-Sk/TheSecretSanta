/**
 * Dynamic resolution for the WebGL scenes.
 *
 * Watches real frame intervals. If frames take noticeably longer than the
 * display's refresh interval (GPU can't keep up: big canvas, high-DPI screen,
 * integrated graphics), the render scale steps down until motion is smooth
 * again; when there is headroom for a while, it steps back up. Animations stay
 * fluid at the cost of slightly softer pixels only on machines that need it.
 */
export class QualityGovernor {
  /** Multiplier applied to devicePixelRatio when sizing the drawing buffer. */
  scale = 1;
  private avg = 0;
  private refresh = 1000 / 60;
  private slowFor = 0;
  private fastFor = 0;
  private samples = 0;
  private struggleFor = 0;
  private struggled = false;

  /**
   * `minScale` should keep the buffer at native resolution or above (see
   * nativeFloor): the governor may drop supersampling, never sharpness.
   */
  constructor(
    private readonly minScale = 1,
    private readonly onChange?: () => void,
    /** Called once if the scene stays under ~30 fps for a few seconds (the GPU can't cope). */
    private readonly onStruggle?: () => void
  ) {}

  /** Feed the interval between two animation frames, in milliseconds. */
  frame(intervalMs: number) {
    // Ignore hiccups from tab switches or long main-thread tasks.
    if (intervalMs <= 0 || intervalMs > 120) return;
    this.samples++;
    this.avg = this.avg ? this.avg * 0.9 + intervalMs * 0.1 : intervalMs;
    // Learn the display refresh interval from the fastest frames we see (60/120/144 Hz).
    if (intervalMs < this.refresh) this.refresh = this.refresh * 0.8 + intervalMs * 0.2;
    if (this.samples < 45) return; // warm-up: first frames include shader/texture setup

    if (this.avg > this.refresh * 2.1) {
      this.struggleFor += intervalMs;
      if (this.struggleFor > 2500 && !this.struggled) {
        this.struggled = true;
        this.onStruggle?.();
      }
    } else {
      this.struggleFor = 0;
    }

    const budget = this.refresh * 1.35;
    if (this.avg > budget) {
      this.slowFor += intervalMs;
      this.fastFor = 0;
      if (this.slowFor > 1200 && this.scale > this.minScale) {
        this.set(Math.max(this.minScale, this.scale * 0.85));
        this.slowFor = 0;
      }
    } else {
      this.slowFor = 0;
      if (this.avg < this.refresh * 1.1) {
        this.fastFor += intervalMs;
        if (this.fastFor > 4000 && this.scale < 1) {
          this.set(Math.min(1, this.scale * 1.12));
          this.fastFor = 0;
        }
      }
    }
  }

  private set(value: number) {
    if (Math.abs(value - this.scale) < 0.01) return;
    this.scale = value;
    this.samples = 10; // let the new resolution settle before judging again
    this.onChange?.();
  }
}

export function nativeDpr() {
  return window.devicePixelRatio || 1;
}

/**
 * Drawing-buffer pixel ratio. On ordinary (1x) screens the scene is
 * supersampled — rendered at `min`× and scaled down by the browser — which on
 * top of MSAA gives clean edges and crisp foil dots. Capped at `max`.
 */
export function renderDpr(min: number, max: number) {
  return Math.min(Math.max(nativeDpr(), min), max);
}

/** Lowest governor scale that still renders at least at native resolution. */
export function nativeFloor(target: number) {
  return Math.min(1, nativeDpr() / target);
}

/**
 * Pixel ratio for a canvas of the given CSS size: supersampled up to `min`×
 * while the buffer stays within `pixelBudget` pixels (a full-width canvas at
 * 2× on a 1080p screen would be ~3 MP of heavy shading per frame), scaled by
 * the governor — but never below the screen's native resolution.
 */
export function bufferDpr(cssWidth: number, cssHeight: number, min: number, max: number, pixelBudget: number, scale: number) {
  const native = Math.min(nativeDpr(), max);
  const wanted = Math.min(renderDpr(min, max), Math.sqrt(pixelBudget / Math.max(1, cssWidth * cssHeight)));
  return Math.max(native, wanted * scale);
}

/**
 * True when the browser renders WebGL without a GPU (SwiftShader, llvmpipe,
 * Microsoft Basic Render Driver…). Happens when hardware acceleration is off
 * or the browser blocked the GPU after driver crashes; every pixel is then
 * shaded on the CPU, so the scenes switch to a lighter mode.
 */
export function isSoftwareRenderer(gl: WebGLRenderingContext): boolean {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
    if (software && !warned) {
      warned = true;
      console.warn(`3D: WebGL работает без видеокарты (${renderer}). Включите аппаратное ускорение в настройках браузера — анимации станут плавнее.`);
    }
    return software;
  } catch {
    return false;
  }
}
let warned = false;

/**
 * Create a WebGL context, trying progressively more conservative settings.
 * Some Windows setups (an extra "Microsoft Basic Render Driver" adapter next to
 * the real GPU) refuse contexts that ask for a specific power preference or
 * MSAA, so we fall back instead of giving up on 3D entirely.
 */
export function createGLContext(canvas: HTMLCanvasElement, antialias: boolean): WebGLRenderingContext | null {
  const attempts: WebGLContextAttributes[] = [
    { alpha: true, premultipliedAlpha: true, antialias },
    { alpha: true, premultipliedAlpha: true, antialias: false },
    { alpha: true, premultipliedAlpha: true, antialias: false, failIfMajorPerformanceCaveat: false, powerPreference: 'low-power' }
  ];
  for (const attrs of attempts) {
    for (const type of ['webgl2', 'webgl'] as const) {
      try {
        const gl = canvas.getContext(type, attrs) as WebGLRenderingContext | null;
        if (gl && !gl.isContextLost()) return gl;
      } catch {
        /* try the next combination */
      }
    }
  }
  console.warn('3D: браузер не дал создать WebGL-контекст ни с одними настройками.');
  return null;
}

/** Release a context only if it is still alive (avoids "loseContext: context lost" warnings). */
export function releaseGLContext(gl: WebGLRenderingContext | null | undefined) {
  if (!gl || gl.isContextLost()) return;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}
