import { GiftRenderer, type GiftTone } from '../../src/gl/giftRenderer';
import { GiftPileRenderer } from '../../src/gl/giftPhysics';

/** The story scene opens the lid at scroll progress 0.55, i.e. at this spin. */
const OPEN_SPIN = 0.55 * Math.PI * 1.35;

type Job = { kind: 'turn' | 'open' | 'story' | 'loop'; tone: GiftTone; frames: number; start?: number; count?: number };

/**
 * 'loop': one seamless turn for the looping hero video. Auto-rotation is 0.22 rad/s,
 * so a full turn lasts 2π / 0.22 s; the float bob is set to exactly 5 cycles per turn.
 */
export const LOOP_SECONDS = (Math.PI * 2) / 0.22;

declare global { interface Window { bake: (job: Job, w: number, h: number) => Promise<string[]>; bakePile: (w: number, h: number, count: number, width: number) => Promise<string>; } }

function canvasOf(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  document.body.appendChild(canvas);
  return canvas;
}

window.bake = async (job, w, h) => {
  const canvas = canvasOf(w, h);
  const r = new GiftRenderer(canvas, { tone: job.tone, interactive: false, autoRotate: false, particles: false, forceFull: true });
  canvas.width = w; canvas.height = h; // exact size, devicePixelRatio = 1
  await r.whenReady();
  const out: string[] = [];
  const from = job.start ?? 0;
  const to = Math.min(job.frames, from + (job.count ?? job.frames));
  for (let i = from; i < to; i++) {
    let spin = 0, open = 0, time = 0;
    if (job.kind === 'turn') spin = (i / job.frames) * Math.PI * 2;
    if (job.kind === 'open') { open = i / (job.frames - 1); spin = OPEN_SPIN; }
    if (job.kind === 'loop') {
      const t = (i / job.frames) * LOOP_SECONDS;
      spin = t * 0.22;
      time = (t * ((5 * Math.PI * 2) / LOOP_SECONDS)) / 1.15; // float: sin(time·1.15) = 5 cycles per turn
    }
    if (job.kind === 'story') {
      const p = i / (job.frames - 1);
      spin = p * Math.PI * 1.35;
      open = Math.min(1, Math.max(0, (p - 0.55) / 0.3));
    }
    r.renderPose(spin, open, job.tone, job.kind === 'loop', time);
    out.push(canvas.toDataURL('image/png'));
  }
  r.dispose();
  canvas.remove();
  return out;
};

window.bakePile = async (w, h, count, width) => {
  const canvas = canvasOf(w, h);
  const r = new GiftPileRenderer(canvas, { width, maxGifts: count, interactive: false, forceFull: true });
  r.resize();
  canvas.width = w; canvas.height = h;
  r.resize();
  await r.renderSettled(count);
  const url = canvas.toDataURL('image/png');
  r.dispose();
  return url;
};
