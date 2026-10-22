/*
 * Dependency-free WebGL renderer for the 3D gift box.
 * Studio-lit physically-inspired shading (GGX + analytic softbox environment),
 * procedural foil-dot wrapping paper, satin-gold ribbons, an opening lid with a
 * spring, a light beam and two particle systems (ambient sparkles + burst).
 */
import {
  chain,
  lookAt,
  normalMatrix,
  perspective,
  rotationX,
  rotationY,
  rotationZ,
  scaling,
  translation,
  upper3,
  type Mat4,
  type Vec3
} from './math';

export type GiftTone = 'red' | 'green' | 'graphite';

export type GiftRendererOptions = {
  tone?: GiftTone;
  interactive?: boolean;
  autoRotate?: boolean;
  particles?: boolean;
  onContextLost?: () => void;
  /** Full-quality shading and MSAA even on a software renderer (used to bake image sequences). */
  forceFull?: boolean;
};

export type Geo = { pos: number[]; nor: number[]; idx: number[] };

type GpuMesh = {
  pos: WebGLBuffer;
  nor: WebGLBuffer;
  idx: WebGLBuffer;
  count: number;
};

type Material = {
  color: Vec3;
  metal: number;
  rough: number;
  clear: number;
  pattern: number;
  patternColor: Vec3;
};

export const tones: Record<GiftTone, { paper: Vec3; dots: Vec3; ribbon: Vec3; glow: Vec3 }> = {
  red: { paper: [0.27, 0.008, 0.018], dots: [1.0, 0.74, 0.38], ribbon: [1.0, 0.72, 0.36], glow: [1.0, 0.78, 0.42] },
  green: { paper: [0.012, 0.12, 0.062], dots: [1.0, 0.76, 0.4], ribbon: [1.0, 0.72, 0.36], glow: [1.0, 0.84, 0.5] },
  graphite: { paper: [0.035, 0.037, 0.045], dots: [0.8, 0.82, 0.86], ribbon: [1.0, 0.72, 0.36], glow: [0.95, 0.86, 0.7] }
};

/* ---------------------------------------------------------------- geometry */

export function roundedBox(w: number, h: number, d: number, r: number, n = 3): Geo {
  const half = [w / 2, h / 2, d / 2];
  const geo: Geo = { pos: [], nor: [], idx: [] };
  const coords = (hl: number) => {
    const inner = hl - r;
    const list: number[] = [];
    for (let k = n; k >= 0; k--) list.push(-inner - r * Math.tan((k / n) * (Math.PI / 4)));
    for (let k = 0; k <= n; k++) list.push(inner + r * Math.tan((k / n) * (Math.PI / 4)));
    return list;
  };

  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      const cu = coords(half[u]);
      const cv = coords(half[v]);
      const base = geo.pos.length / 3;
      for (let j = 0; j < cv.length; j++) {
        for (let i = 0; i < cu.length; i++) {
          const p = [0, 0, 0];
          p[axis] = sign * half[axis];
          p[u] = cu[i];
          p[v] = cv[j];
          const inner = p.map((value, k) => Math.max(-(half[k] - r), Math.min(half[k] - r, value)));
          let nx = p[0] - inner[0];
          let ny = p[1] - inner[1];
          let nz = p[2] - inner[2];
          const len = Math.hypot(nx, ny, nz);
          if (len < 1e-6 || r <= 0) {
            const nn = [0, 0, 0];
            nn[axis] = sign;
            [nx, ny, nz] = nn;
            geo.pos.push(p[0], p[1], p[2]);
          } else {
            nx /= len;
            ny /= len;
            nz /= len;
            geo.pos.push(inner[0] + nx * r, inner[1] + ny * r, inner[2] + nz * r);
          }
          geo.nor.push(nx, ny, nz);
        }
      }
      const stride = cu.length;
      for (let j = 0; j < cv.length - 1; j++) {
        for (let i = 0; i < cu.length - 1; i++) {
          const a = base + j * stride + i;
          geo.idx.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
        }
      }
    }
  }
  return geo;
}

export function torus(R: number, tube: number, radial = 18, tubular = 56): Geo {
  const geo: Geo = { pos: [], nor: [], idx: [] };
  for (let j = 0; j <= radial; j++) {
    const v = (j / radial) * Math.PI * 2;
    for (let i = 0; i <= tubular; i++) {
      const u = (i / tubular) * Math.PI * 2;
      const cx = R * Math.cos(u);
      const cy = R * Math.sin(u);
      const x = (R + tube * Math.cos(v)) * Math.cos(u);
      const y = (R + tube * Math.cos(v)) * Math.sin(u);
      const z = tube * Math.sin(v);
      const l = Math.hypot(x - cx, y - cy, z) || 1;
      geo.pos.push(x, y, z);
      geo.nor.push((x - cx) / l, (y - cy) / l, z / l);
    }
  }
  for (let j = 0; j < radial; j++) {
    for (let i = 0; i < tubular; i++) {
      const a = j * (tubular + 1) + i;
      const b = a + tubular + 1;
      geo.idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return geo;
}

export function sphere(radius: number, seg = 20): Geo {
  const geo: Geo = { pos: [], nor: [], idx: [] };
  for (let j = 0; j <= seg; j++) {
    const theta = (j / seg) * Math.PI;
    for (let i = 0; i <= seg * 2; i++) {
      const phi = (i / (seg * 2)) * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      geo.pos.push(x * radius, y * radius, z * radius);
      geo.nor.push(x, y, z);
    }
  }
  const row = seg * 2 + 1;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg * 2; i++) {
      const a = j * row + i;
      geo.idx.push(a, a + row, a + 1, a + row, a + row + 1, a + 1);
    }
  }
  return geo;
}

export function transform(geo: Geo, m: Mat4): Geo {
  const nm = normalMatrix(m);
  const out: Geo = { pos: [], nor: [], idx: geo.idx.slice() };
  for (let i = 0; i < geo.pos.length; i += 3) {
    const x = geo.pos[i], y = geo.pos[i + 1], z = geo.pos[i + 2];
    out.pos.push(
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14]
    );
    const a = geo.nor[i], b = geo.nor[i + 1], c = geo.nor[i + 2];
    const nx = nm[0] * a + nm[3] * b + nm[6] * c;
    const ny = nm[1] * a + nm[4] * b + nm[7] * c;
    const nz = nm[2] * a + nm[5] * b + nm[8] * c;
    const l = Math.hypot(nx, ny, nz) || 1;
    out.nor.push(nx / l, ny / l, nz / l);
  }
  return out;
}

export function merge(...geos: Geo[]): Geo {
  const out: Geo = { pos: [], nor: [], idx: [] };
  for (const geo of geos) {
    const base = out.pos.length / 3;
    out.pos.push(...geo.pos);
    out.nor.push(...geo.nor);
    for (const i of geo.idx) out.idx.push(i + base);
  }
  return out;
}


/* ---- ribbon sweep: a flat, slightly cupped satin band following a curve ---- */

type V3 = [number, number, number];
const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vscale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const vadd = (...vs: V3[]): V3 => vs.reduce<V3>((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0]);
const vdot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Sweep a ribbon (width × thickness rectangle, top/bottom faces gently cupped)
 * along `path`. `across(t)` gives the direction of the ribbon's width,
 * `width(t)` its width; `notch` cuts a V into the far end like real gift ribbon.
 */
function ribbonSweep(
  path: (t: number) => V3,
  across: (t: number) => V3,
  width: (t: number) => number,
  thickness: number,
  samples: number,
  notch = 0,
  lanes = 5 // vertices across the width (smooth cupping highlight)
): Geo {
  const geo: Geo = { pos: [], nor: [], idx: [] };
  const cup = 0.22; // depth of the cupping relative to the half width
  const frames: Array<{ p: V3; w: V3; n: V3; t: V3; half: number }> = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = path(t);
    const t0 = path(Math.max(0, t - 0.002));
    const t1 = path(Math.min(1, t + 0.002));
    const tangent = vnorm(vsub(t1, t0));
    let w = across(t);
    w = vnorm(vsub(w, vscale(tangent, vdot(w, tangent))));
    const n = vnorm(vcross(tangent, w));
    frames.push({ p, w, n, t: tangent, half: width(t) / 2 });
  }

  const strip = (side: 1 | -1) => {
    const base = geo.pos.length / 3;
    frames.forEach((f, i) => {
      for (let k = 0; k < lanes; k++) {
        const s = (k / (lanes - 1)) * 2 - 1;
        const bend = cup * f.half * (s * s - 0.35);
        let p = vadd(f.p, vscale(f.w, s * f.half), vscale(f.n, side * thickness / 2 + bend));
        if (notch && i === frames.length - 1) p = vadd(p, vscale(f.t, -notch * (1 - Math.abs(s))));
        const normal = vnorm(vsub(vscale(f.n, side), vscale(f.w, side * 2 * cup * s)));
        geo.pos.push(...p);
        geo.nor.push(...normal);
      }
    });
    for (let i = 0; i < frames.length - 1; i++) {
      for (let k = 0; k < lanes - 1; k++) {
        const a = base + i * lanes + k;
        geo.idx.push(a, a + lanes, a + 1, a + 1, a + lanes, a + lanes + 1);
      }
    }
  };
  strip(1);
  strip(-1);

  // thin side edges
  for (const edge of [-1, 1] as const) {
    const base = geo.pos.length / 3;
    frames.forEach((f) => {
      const bend = cup * f.half * 0.65;
      const rim = vadd(f.p, vscale(f.w, edge * f.half));
      geo.pos.push(...vadd(rim, vscale(f.n, thickness / 2 + bend)), ...vadd(rim, vscale(f.n, -thickness / 2 + bend)));
      const normal = vscale(f.w, edge);
      geo.nor.push(...normal, ...normal);
    });
    for (let i = 0; i < frames.length - 1; i++) {
      const a = base + i * 2;
      geo.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  return geo;
}

/**
 * Level of detail. The hero gift is one large object; the physics pile draws
 * up to 26 small ones, where a fraction of the triangles looks identical and
 * keeps frames cheap even when the browser renders WebGL without a GPU.
 */
export type GiftDetail = 'hero' | 'pile';
const DETAIL = {
  hero: { box: 4, band: 2, knot: 3, loop: 56, tail: 24, lanes: 5 },
  pile: { box: 2, band: 1, knot: 1, loop: 18, tail: 9, lanes: 3 }
} as const;

const giftGeometryCache = new Map<string, ReturnType<typeof buildGiftGeometryUncached>>();

/**
 * Geometry is identical for every gift: build it once per page load.
 * `bowScale` < 1 gives a compact bow for the physics pile, where gifts tumble
 * and are collided as plain boxes (a full-size bow would poke through others).
 */
export function buildGiftGeometry(bowScale = 1, detail: GiftDetail = 'hero') {
  const key = `${bowScale}:${detail}`;
  let geo = giftGeometryCache.get(key);
  if (!geo) {
    geo = buildGiftGeometryUncached(bowScale, DETAIL[detail]);
    giftGeometryCache.set(key, geo);
  }
  return geo;
}

function buildGiftGeometryUncached(bowScale: number, lod: (typeof DETAIL)[GiftDetail]) {
  // Body sits on the floor (y = 0 .. 1.45)
  const lift = translation(0, 0.725, 0);
  const body = transform(roundedBox(2, 1.45, 2, 0.07, lod.box), lift);
  const bodyRibbon = merge(
    transform(roundedBox(0.3, 1.47, 2.02, 0.014, lod.band), lift),
    transform(roundedBox(2.02, 1.47, 0.3, 0.014, lod.band), lift)
  );

  // Lid is modelled around its own origin (top surface at y ≈ 0.22) and animated as a group.
  const lid = roundedBox(2.14, 0.42, 2.14, 0.075, lod.box);
  const knotY = 0.22 + 0.08 * bowScale;
  const ribbonW = 0.3;
  const ribbonT = 0.022;

  // Bow loops: teardrop curves of flat ribbon, rising up and out from the knot.
  const loop = (side: number, tilt: number, length: number, splay: number): Geo => {
    const L = length;
    const H = L * 0.4;
    const rot = chain(translation(0, knotY, 0), rotationY(side * splay), rotationZ(side * tilt));
    const local = (t: number): V3 => {
      const th = t * Math.PI * 2;
      const a = (1 - Math.cos(th)) / 2;
      return [side * L * a, H * Math.sin(th) * Math.sqrt(a), 0];
    };
    const apply = (m: Mat4, v: V3, w = 1): V3 => [
      m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * w,
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * w,
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * w
    ];
    return ribbonSweep(
      (t) => apply(rot, local(t)),
      // width runs across the loop plane, with a gentle twist toward the knot
      (t) => apply(rot, [0, Math.sin(t * Math.PI * 2) * 0.18 * side, 1], 0),
      (t) => ribbonW * (0.55 + 0.45 * Math.pow(Math.sin(Math.PI * t), 0.6)),
      ribbonT,
      lod.loop,
      0,
      lod.lanes
    );
  };

  // Tails: lie on the lid, ripple slightly and end in a V-notch.
  const tail = (dirX: number, dirZ: number, length: number): Geo => {
    const d = vnorm([dirX, 0, dirZ]);
    const across: V3 = [d[2], 0, -d[0]];
    return ribbonSweep(
      (t) => {
        const r = 0.08 + t * length;
        const lift = 0.245 + 0.04 * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t) + 0.012;
        const wave = Math.sin(t * Math.PI * 1.5) * 0.05;
        return [d[0] * r + across[0] * wave, knotY - (knotY - lift) * Math.min(1, t * 4), d[2] * r + across[2] * wave];
      },
      (t) => vnorm(vadd(across, [0, 0.25 * Math.sin(t * Math.PI), 0])),
      () => ribbonW * 0.92,
      ribbonT,
      lod.tail,
      0.09,
      lod.lanes
    );
  };

  const lidGold = merge(
    roundedBox(0.3, 0.44, 2.16, 0.014, lod.band),
    roundedBox(2.16, 0.44, 0.3, 0.014, lod.band),
    loop(-1, 0.78, 0.92 * bowScale, 0.34),
    loop(1, 0.78, 0.92 * bowScale, 0.34),
    loop(-1, 0.42, 0.72 * bowScale, -0.55),
    loop(1, 0.42, 0.72 * bowScale, -0.55),
    tail(-0.55, 1, 0.68 * Math.sqrt(bowScale)),
    tail(0.5, 1, 0.72 * Math.sqrt(bowScale)),
    // the knot wrapping the middle of the bow
    transform(roundedBox(0.34, 0.24, 0.34, 0.1, lod.knot), chain(translation(0, knotY + 0.02, 0), rotationY(0.15)))
  );
  return { body, bodyRibbon, lid, lidGold };
}

/* ----------------------------------------------------------------- shaders */

export const MESH_VS = `
attribute vec3 aPos;
attribute vec3 aNor;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat3 uNormalMat;
varying vec3 vWorld;
varying vec3 vNor;
varying vec3 vObj;
varying vec3 vObjN;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNor = uNormalMat * aNor;
  vObj = aPos;
  vObjN = aNor;
  gl_Position = uViewProj * w;
}`;

export const MESH_FS = `
precision highp float;
varying vec3 vWorld;
varying vec3 vNor;
varying vec3 vObj;
varying vec3 vObjN;
uniform vec3 uCam;
uniform vec3 uColor;
uniform float uMetal;
uniform float uRough;
uniform float uClear;
uniform float uPattern;
uniform vec3 uPatternColor;
uniform float uGlowTop;
uniform float uTopY;
uniform vec3 uGlowColor;
uniform float uInnerLight;
// 1.0 when WebGL runs without a GPU (software rendering): a cheaper lighting path
uniform float uLite;

vec3 envMap(vec3 d, float rough) {
  vec3 sky = vec3(1.0, 1.0, 1.06);
  vec3 hor = vec3(0.42, 0.4, 0.42);
  vec3 gnd = vec3(0.03, 0.028, 0.032);
  vec3 c = mix(gnd, hor, smoothstep(-0.35, 0.0, d.y));
  c = mix(c, sky, smoothstep(0.0, 0.9, d.y) * 0.85);
  float sharp = mix(260.0, 5.0, rough);
  float energy = mix(1.0, 0.18, rough);
  vec3 L1 = normalize(vec3(-0.55, 0.75, 0.7));
  vec3 L2 = normalize(vec3(0.9, 0.3, 0.35));
  vec3 L3 = normalize(vec3(0.1, 0.35, -1.0));
  c += vec3(1.0, 0.97, 0.92) * 7.0 * energy * pow(max(dot(d, L1), 0.0), sharp);
  c += vec3(0.82, 0.88, 1.0) * 3.2 * energy * pow(max(dot(d, L2), 0.0), sharp);
  c += vec3(1.0, 0.72, 0.5) * 2.6 * energy * pow(max(dot(d, L3), 0.0), sharp * 0.7);
  return c;
}

float ggx(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (3.14159 * d * d);
}

vec3 schlick(vec3 f0, float c) {
  return f0 + (1.0 - f0) * pow(1.0 - c, 5.0);
}

vec3 light(vec3 N, vec3 V, vec3 L, vec3 radiance, vec3 base, vec3 f0, float metal, float rough) {
  vec3 H = normalize(L + V);
  float NoL = max(dot(N, L), 0.0);
  float NoH = max(dot(N, H), 0.0);
  float LoH = max(dot(L, H), 0.0);
  float a = max(rough * rough, 0.02);
  vec3 F = schlick(f0, LoH);
  vec3 spec = ggx(NoH, a) * F * (0.25 / max(LoH * LoH, 0.05));
  vec3 diff = (1.0 - metal) * base / 3.14159 * (1.0 - F);
  return (diff + spec) * radiance * NoL;
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 N = normalize(vNor);
  vec3 V = normalize(uCam - vWorld);
  vec3 base = uColor;
  float metal = uMetal;
  float rough = uRough;

  if (uPattern > 0.5) {
    vec2 uv = abs(vObjN.x) > 0.6 ? vObj.zy : (abs(vObjN.y) > 0.6 ? vObj.xz : vObj.xy);
    uv *= 4.4;
    float rowShift = 0.5 * step(1.0, mod(floor(uv.y), 2.0));
    vec2 g = fract(uv + vec2(rowShift, 0.0)) - 0.5;
    // wider edge in lite mode: without MSAA/supersampling crisp dots shimmer
    float edge = uLite > 0.5 ? 0.09 : 0.035;
    float dotMask = (1.0 - smoothstep(0.1, 0.1 + edge, length(g))) * (uLite > 0.5 ? 0.75 : 1.0);
    // tiny diagonal emboss to make the paper feel tactile
    float weave = sin((uv.x + uv.y) * 22.0) * 0.5 + 0.5;
    base *= 0.975 + weave * 0.025;
    base = mix(base, uPatternColor, dotMask);
    metal = mix(metal, 1.0, dotMask);
    rough = mix(rough, 0.28, dotMask);
  }

  vec3 f0 = mix(vec3(0.04), base, metal);
  float NoV = max(dot(N, V), 0.001);

  vec3 col = vec3(0.0);
  vec3 R = reflect(-V, N);
  if (uLite > 0.5) {
    // one key light + hemisphere ambient + a single reflection lookup
    col += light(N, V, normalize(vec3(-0.5, 0.85, 0.65)), vec3(3.6, 3.3, 3.0), base, f0, metal, rough);
    col += base * (1.0 - metal) * mix(vec3(0.06, 0.055, 0.06), vec3(0.5, 0.48, 0.5), 0.5 + 0.5 * N.y);
    col += envMap(R, rough) * schlick(f0, NoV) * mix(0.55, 1.0, metal);
  } else {
  col += light(N, V, normalize(vec3(-0.5, 0.85, 0.65)), vec3(3.2, 3.0, 2.8), base, f0, metal, rough);
  col += light(N, V, normalize(vec3(0.85, 0.35, 0.45)), vec3(0.9, 1.0, 1.2), base, f0, metal, rough);
  col += light(N, V, normalize(vec3(0.15, 0.45, -1.0)), vec3(2.2, 1.6, 1.1), base, f0, metal, rough);

  // light leaking from inside the box when it opens
  vec3 innerDir = normalize(vec3(0.0, uTopY + 0.4, 0.0) - vObj);
  col += uInnerLight * uGlowColor * base * max(dot(normalize(vObjN), innerDir), 0.0) * 1.6;

  vec3 F = schlick(f0, NoV);
  col += envMap(R, rough) * F * mix(0.55, 1.0, metal);
  col += envMap(N, 1.0) * base * (1.0 - metal) * 0.45;

  if (uClear > 0.0) {
    float Fc = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
    col = col * (1.0 - Fc * uClear) + envMap(R, 0.06) * Fc * uClear;
  }
  }

  if (uGlowTop > 0.0 && vObjN.y > 0.9 && vObj.y > uTopY - 0.02) {
    float center = 1.0 - clamp(length(vObj.xz) / 1.45, 0.0, 1.0);
    vec3 glow = uGlowColor * (0.9 + 2.4 * center * center);
    col = mix(col, glow, clamp(uGlowTop, 0.0, 1.0));
  }

  col = aces(col * 1.05);
  col = pow(col, vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}`;

export const QUAD_VS = `
precision highp float;
attribute vec2 aUv;
uniform mat4 uViewProj;
uniform vec3 uCenter;
uniform vec2 uSize;
uniform float uFloor;
varying vec2 vUv;
void main() {
  vUv = aUv;
  vec2 p = (aUv - 0.5) * uSize;
  vec3 world = uFloor > 0.5 ? uCenter + vec3(p.x, 0.0, p.y) : uCenter + vec3(p.x, p.y + uSize.y * 0.5, 0.0);
  gl_Position = uViewProj * vec4(world, 1.0);
}`;

export const QUAD_FS = `
precision highp float;
varying vec2 vUv;
uniform float uFloor;
uniform float uStrength;
uniform vec3 uColor;
uniform float uTime;
void main() {
  if (uFloor > 0.5) {
    float d = length((vUv - 0.5) * 2.0);
    float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2) * uStrength;
    float glow = pow(clamp(1.0 - d, 0.0, 1.0), 3.0);
    gl_FragColor = vec4(uColor * glow, a);
  } else {
    float x = abs(vUv.x - 0.5) * 2.0;
    float core = pow(clamp(1.0 - x, 0.0, 1.0), 3.0);
    float fade = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.4) * smoothstep(0.0, 0.08, vUv.y);
    float rays = 0.75 + 0.25 * sin(vUv.x * 40.0 + uTime * 1.5) * sin(vUv.x * 17.0 - uTime);
    float a = core * fade * rays * uStrength;
    gl_FragColor = vec4(uColor * a, a);
  }
}`;

export const POINTS_VS = `
precision highp float;
attribute vec3 aPos;
attribute vec4 aData;
uniform mat4 uViewProj;
uniform float uTime;
uniform float uPx;
uniform float uMode;
uniform float uBurst;
uniform vec3 uOrigin;
varying float vAlpha;
varying float vTwinkle;
void main() {
  vec3 p;
  float alpha;
  if (uMode < 0.5) {
    float h = 5.0;
    float y = mod(aPos.y + uTime * (0.08 + aData.y * 0.14), h);
    p = vec3(aPos.x + sin(uTime * 0.35 + aData.x * 6.283) * 0.3, y - 0.6, aPos.z + cos(uTime * 0.3 + aData.x * 4.0) * 0.2);
    alpha = smoothstep(0.0, 0.8, y) * (1.0 - smoothstep(h - 1.4, h, y)) * (0.35 + 0.65 * aData.z);
  } else {
    float age = uTime - uBurst;
    float life = 1.6 + aData.y * 1.4;
    float t = clamp(age / life, 0.0, 1.0);
    vec3 dir = normalize(aPos);
    float speed = 1.4 + aData.x * 2.6;
    p = uOrigin + dir * speed * age * (1.0 - t * 0.45) + vec3(0.0, -0.35 * age * age, 0.0);
    alpha = (age < 0.0 || age > life) ? 0.0 : pow(1.0 - t, 1.3);
  }
  vTwinkle = 0.55 + 0.45 * sin(uTime * (2.0 + aData.w * 4.0) + aData.x * 30.0);
  vAlpha = alpha;
  gl_Position = uViewProj * vec4(p, 1.0);
  gl_PointSize = (0.035 + aData.w * 0.07) * uPx / gl_Position.w;
}`;

export const POINTS_FS = `
precision highp float;
varying float vAlpha;
varying float vTwinkle;
uniform vec3 uColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float core = smoothstep(0.5, 0.0, d);
  float star = exp(-abs(c.x) * 28.0) * exp(-abs(c.y) * 4.0) + exp(-abs(c.y) * 28.0) * exp(-abs(c.x) * 4.0);
  float a = (core * core + star * 0.6) * vAlpha * vTwinkle;
  gl_FragColor = vec4(uColor * a, a * 0.8);
}`;

import { bufferDpr, createGLContext, isSoftwareRenderer, nativeDpr, QualityGovernor, releaseGLContext } from './quality';

/** Resolution (× native) when WebGL runs without a GPU: no supersampling, slightly under native. */
const SOFTWARE_SCALE = 0.75;

// Native resolution only: supersampling a 1x screen (2x buffer + MSAA) cost ~4x the
// GPU memory and fill rate, which is what tipped integrated GPUs into context loss.
const DPR_MIN = 1;
const PIXEL_BUDGET = 900_000;
const DPR_MAX = 2;

/* --------------------------------------------------------------- renderer */

/**
 * Compile a program without stalling the main thread.
 *
 * Asking for COMPILE_STATUS / LINK_STATUS right after compiling forces the
 * driver to finish synchronously (often 50–300 ms on first use). With
 * KHR_parallel_shader_compile we poll COMPLETION_STATUS instead and only start
 * drawing once the program is ready; errors are still reported.
 */
export function compile(gl: WebGLRenderingContext, vs: string, fs: string) {
  const parallel = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
  const make = (type: number, src: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  };
  const vertex = make(gl.VERTEX_SHADER, vs);
  const fragment = make(gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  let ready = false;
  const check = () => {
    if (ready) return true;
    if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) return false;
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getShaderInfoLog(vertex) || gl.getShaderInfoLog(fragment) || gl.getProgramInfoLog(program);
      throw new Error(`Shader program failed: ${log}`);
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    ready = true;
    return true;
  };

  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const attribs = new Map<string, number>();
  return {
    program,
    /** True once compiled and linked; throws if compilation failed. */
    ready: check,
    attrib: (name: string) => {
      let location = attribs.get(name);
      if (location === undefined) {
        location = gl.getAttribLocation(program, name);
        attribs.set(name, location);
      }
      return location;
    },
    u: (name: string) => {
      if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
      return uniforms.get(name) ?? null;
    }
  };
}

export type Program = ReturnType<typeof compile>;

let webglSupport: boolean | null = null;
let webglSoftware = false;

/** One-time probe: is WebGL available, and is it GPU-backed? (the probe context is released) */
export function supportsWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    const gl = createGLContext(canvas, false);
    webglSupport = Boolean(gl);
    if (gl) {
      webglSoftware = isSoftwareRenderer(gl);
      releaseGLContext(gl);
    }
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** True when WebGL is rendered on the CPU (see isSoftwareRenderer). */
export function webglIsSoftware(): boolean {
  supportsWebGL();
  return webglSoftware;
}

export function rand(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export class GiftRenderer {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private meshProgram: Program;
  private quadProgram: Program;
  private pointsProgram: Program;
  private meshes: Record<'body' | 'bodyRibbon' | 'lid' | 'lidGold', GpuMesh>;
  private quad: WebGLBuffer;
  private ambient: { pos: WebGLBuffer; data: WebGLBuffer; count: number };
  private burst: { pos: WebGLBuffer; data: WebGLBuffer; count: number };
  private tone: GiftTone;
  private opts: Required<Omit<GiftRendererOptions, 'onContextLost' | 'tone' | 'forceFull'>>;
  private onContextLost?: () => void;

  private frame = 0;
  private running = false;
  private disposed = false;
  private last = 0;
  private time = 0;
  private intro = 0;

  private openTarget = 0;
  private open = 0;
  private openVel = 0;
  private shake = 0;
  private burstStart = -100;
  private burstArmed = true;

  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private spin = 0;
  private spinVel = 0;
  private dragging = false;
  private lastDragX = 0;
  private progress: number | null = null;
  private progressSource: (() => number | null) | null = null;
  private smoothProgress = 0;

  private cleanup: Array<() => void> = [];
  private quality = new QualityGovernor(0.5, () => this.resize(), () => this.onStruggle?.());
  /** Set by the component: called when the GPU cannot keep the scene smooth. */
  onStruggle?: () => void;
  private programsReady = false;
  private software = false;
  private broken = false;
  private floorShadow = true;

  constructor(canvas: HTMLCanvasElement, options: GiftRendererOptions = {}) {
    this.canvas = canvas;
    this.tone = options.tone ?? 'red';
    this.opts = {
      interactive: options.interactive ?? true,
      autoRotate: options.autoRotate ?? true,
      particles: options.particles ?? true
    };
    this.onContextLost = options.onContextLost;

    // MSAA costs ~40% extra when there is no GPU; skip it then.
    const gl = createGLContext(canvas, options.forceFull || !webglIsSoftware());
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.software = options.forceFull ? false : isSoftwareRenderer(gl);

    this.meshProgram = compile(gl, MESH_VS, MESH_FS);
    this.quadProgram = compile(gl, QUAD_VS, QUAD_FS);
    this.pointsProgram = compile(gl, POINTS_VS, POINTS_FS);

    const giftGeo = buildGiftGeometry();
    this.meshes = {
      body: this.upload(giftGeo.body),
      bodyRibbon: this.upload(giftGeo.bodyRibbon),
      lid: this.upload(giftGeo.lid),
      lidGold: this.upload(giftGeo.lidGold)
    };

    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);

    this.ambient = this.makePoints(64, (i) => [
      (rand(i) - 0.5) * 7,
      rand(i + 11) * 5,
      (rand(i + 23) - 0.5) * 5 - 0.5
    ]);
    this.burst = this.makePoints(110, (i) => {
      const a = rand(i + 5) * Math.PI * 2;
      const spread = 0.25 + rand(i + 9) * 0.75;
      return [Math.cos(a) * spread, 1.4 + rand(i + 3) * 1.2, Math.sin(a) * spread];
    });

    const onLost = (event: Event) => {
      event.preventDefault();
      if (!this.disposed) console.warn('3D gift: браузер сбросил WebGL-контекст (сбой или перегрузка видеокарты).');
      this.stop();
      this.onContextLost?.();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    this.cleanup.push(() => canvas.removeEventListener('webglcontextlost', onLost));

    if (this.opts.interactive) this.bindPointer();
    this.resize();
  }

  /* ------------------------------------------------------------- public */

  setOpen(target: number, dramatic = false) {
    if (dramatic && target > this.openTarget) this.shake = 0.55;
    if (target < 0.5) this.burstArmed = true;
    this.openTarget = target;
  }

  /** Immediately jump to a state (no animation). */
  snapOpen(value: number) {
    this.open = value;
    this.openTarget = value;
    this.openVel = 0;
    this.burstArmed = value < 0.5;
  }

  setTone(tone: GiftTone) {
    this.tone = tone;
  }

  get element() {
    return this.canvas;
  }

  isLost() {
    return this.disposed || this.broken || this.gl.isContextLost();
  }

  setContextLostHandler(handler: (() => void) | undefined) {
    this.onContextLost = handler;
  }

  /** Prepare a pooled renderer for a new mount: replay the intro from scratch. */
  reset() {
    this.stop();
    this.time = 0;
    this.intro = 0;
    this.spin = 0;
    this.spinVel = 0;
    this.shake = 0;
    this.burstStart = -100;
    this.dragging = false;
    this.progress = null;
    this.progressSource = null;
    this.smoothProgress = 0;
    this.canvas.classList.remove('is-grabbing');
  }

  setProgress(value: number | null) {
    this.progress = value;
  }

  /** Read scroll progress every frame (e.g. from a ref updated by ScrollTrigger). */
  setProgressSource(source: (() => number | null) | null) {
    this.progressSource = source;
  }

  resize() {
    // Layout size, not getBoundingClientRect: CSS transforms (page transitions,
    // parallax scale) must not reallocate the drawing buffer every frame.
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    const dpr = this.software
      ? nativeDpr() * SOFTWARE_SCALE * this.quality.scale
      : bufferDpr(cssW, cssH, DPR_MIN, DPR_MAX, PIXEL_BUDGET, this.quality.scale);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    const changed = this.canvas.width !== w || this.canvas.height !== h;
    if (changed) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (changed && !this.running) this.renderWhenReady();
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.quality.frame(now - this.last);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.render(dt);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /** Free the drawing buffer while the gift is off screen (resize() restores it). */
  releaseBuffer() {
    this.stop();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }

  /** Resolves once the shaders are compiled (rejects if they failed). */
  whenReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const poll = () => {
        if (this.ready()) resolve();
        else if (this.broken || this.isLost()) reject(new Error('WebGL gift renderer unavailable'));
        else window.setTimeout(poll, 30);
      };
      poll();
    });
  }

  /**
   * Draw one exact pose with no animation state (no intro, pointer or particles; float only via `time`).
   * Used offline to bake the image-sequence fallback, so `spin` / `open` here map 1:1
   * to the frames the fallback shows.
   */
  renderPose(spin: number, open: number, tone: GiftTone, floorShadow = true, time = 0) {
    this.stop();
    this.floorShadow = floorShadow;
    this.tone = tone;
    this.time = time; // drives the floating bob (sin(time · 1.15))
    this.intro = 1;
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.spin = spin;
    this.spinVel = 0;
    this.open = open;
    this.openTarget = open;
    this.openVel = 0;
    this.shake = 0;
    this.burstStart = -100;
    this.progress = null;
    this.progressSource = null;
    this.dragging = false;
    const autoRotate = this.opts.autoRotate;
    this.opts.autoRotate = false;
    this.render(0);
    this.opts.autoRotate = autoRotate;
    this.floorShadow = true;
  }

  renderStill() {
    this.intro = 1;
    this.open = this.openTarget;
    this.renderWhenReady();
  }

  dispose() {
    this.stop();
    if (this.disposed) return;
    this.disposed = true;
    this.cleanup.forEach((fn) => fn());
    // Free GPU resources and release the context: browsers cap the number of live
    // WebGL contexts (~16). Renderers are normally parked in the pool instead.
    const gl = this.gl;
    if (gl.isContextLost()) return;
    Object.values(this.meshes).forEach((mesh) => {
      gl.deleteBuffer(mesh.pos);
      gl.deleteBuffer(mesh.nor);
      gl.deleteBuffer(mesh.idx);
    });
    [this.quad, this.ambient.pos, this.ambient.data, this.burst.pos, this.burst.data].forEach((buffer) => gl.deleteBuffer(buffer));
    [this.meshProgram, this.quadProgram, this.pointsProgram].forEach((program) => gl.deleteProgram(program.program));
    releaseGLContext(gl);
  }

  /* ------------------------------------------------------------ private */

  private upload(geo: Geo): GpuMesh {
    const gl = this.gl;
    const pos = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.pos), gl.STATIC_DRAW);
    const nor = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, nor);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.nor), gl.STATIC_DRAW);
    const idx = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.idx), gl.STATIC_DRAW);
    return { pos, nor, idx, count: geo.idx.length };
  }

  private makePoints(count: number, position: (i: number) => Vec3) {
    const gl = this.gl;
    const pos: number[] = [];
    const data: number[] = [];
    for (let i = 0; i < count; i++) {
      pos.push(...position(i));
      data.push(rand(i + 101), rand(i + 202), rand(i + 303), rand(i + 404));
    }
    const posBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    const dataBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, dataBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return { pos: posBuffer, data: dataBuffer, count };
  }

  private bindPointer() {
    const canvas = this.canvas;
    const fine = window.matchMedia('(pointer: fine)').matches;

    const onWindowMove = (event: PointerEvent) => {
      this.pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
      this.pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
    };
    const onDown = (event: PointerEvent) => {
      this.dragging = true;
      this.lastDragX = event.clientX;
      this.spinVel = 0;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add('is-grabbing');
    };
    const onMove = (event: PointerEvent) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastDragX;
      this.lastDragX = event.clientX;
      this.spin += dx * 0.012;
      this.spinVel = dx * 0.012 * 60;
    };
    const onUp = (event: PointerEvent) => {
      this.dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.classList.remove('is-grabbing');
    };

    if (fine) window.addEventListener('pointermove', onWindowMove, { passive: true });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    this.cleanup.push(() => {
      window.removeEventListener('pointermove', onWindowMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    });
  }

  private step(dt: number) {
    this.time += dt;
    this.intro = Math.min(1, this.intro + dt / 1.6);

    this.pointer.x += (this.pointer.tx - this.pointer.x) * Math.min(1, dt * 3);
    this.pointer.y += (this.pointer.ty - this.pointer.y) * Math.min(1, dt * 3);

    if (!this.dragging) {
      this.spin += this.spinVel * dt;
      this.spinVel *= Math.exp(-dt * 2.4);
      if (this.opts.autoRotate) this.spin += dt * 0.22;
    }

    let target = this.openTarget;
    if (this.progressSource) this.progress = this.progressSource();
    if (this.progress !== null) {
      this.smoothProgress += (this.progress - this.smoothProgress) * Math.min(1, dt * 6);
      const p = this.smoothProgress;
      target = Math.min(1, Math.max(0, (p - 0.55) / 0.3));
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
    } else {
      // critically-under-damped spring for a satisfying lid pop
      const stiffness = 70;
      const damping = 9;
      this.openVel += (target - this.open) * stiffness * dt;
      this.openVel *= Math.exp(-damping * dt);
      this.open += this.openVel * dt;
    }

    if (this.burstArmed && this.open > 0.35 && this.openTarget > 0.5) {
      this.burstStart = this.time;
      this.burstArmed = false;
    }
    if (this.progress !== null && target < 0.2) this.burstArmed = true;
  }

  /** Draw a single still frame as soon as the shaders are ready (reduced motion, paused). */
  private renderWhenReady(dt = 0) {
    if (this.ready()) {
      this.render(dt);
      return;
    }
    if (this.broken || this.isLost()) return;
    window.setTimeout(() => {
      if (!this.running) this.renderWhenReady(dt);
    }, 50);
  }

  /** Poll the asynchronously compiling shaders; nothing is drawn until they are ready. */
  private ready() {
    if (this.programsReady) return true;
    if (this.broken) return false;
    try {
      this.programsReady = [this.meshProgram, this.quadProgram, this.pointsProgram].every((program) => program.ready());
    } catch (err) {
      console.warn('3D gift shaders failed:', err);
      this.broken = true;
      this.stop();
      this.onContextLost?.();
    }
    return this.programsReady;
  }

  private render(dt: number) {
    const gl = this.gl;
    if (gl.isContextLost() || !this.ready()) return;
    this.step(dt);
    // Fade the canvas in (CSS) once real pixels exist, instead of popping in.
    if (!this.canvas.classList.contains('is-ready')) requestAnimationFrame(() => this.canvas.classList.add('is-ready'));

    const w = this.canvas.width;
    const h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = w / h;
    const fov = (28 * Math.PI) / 180;
    const fit = aspect < 1.05 ? Math.pow(1.05 / aspect, 0.92) : 1;
    const lift = Math.max(0, Math.min(1, this.open));
    const distance = (7.7 + lift * 1.9) * fit;
    const eye: Vec3 = [0, 2.6 * fit * 0.9 + lift * 0.4, distance];
    const target: Vec3 = [0, 1.05 + lift * 0.55, 0];
    const proj = perspective(fov, aspect, 0.1, 60);
    const view = lookAt(eye, target, [0, 1, 0]);
    const viewProj = chain(proj, view);

    const ease = 1 - Math.pow(1 - this.intro, 3);
    const open = Math.max(-0.05, this.open);
    const float = Math.sin(this.time * 1.15) * 0.07;
    const progressSpin = this.progress !== null ? this.smoothProgress * Math.PI * 1.35 : 0;
    const rotY = this.spin + progressSpin + this.pointer.x * 0.35 - (1 - ease) * 1.1 - 0.55;
    const rotX = this.pointer.y * 0.1;
    const shakeZ = this.shake > 0 ? Math.sin(this.time * 46) * 0.035 * (this.shake / 0.55) : 0;
    const scale = 0.82 + 0.18 * ease;

    const group = chain(
      translation(0, float, 0),
      translation(0, 0.8, 0),
      rotationX(rotX),
      rotationZ(shakeZ),
      scaling(scale, scale, scale),
      translation(0, -0.8, 0),
      rotationY(rotY)
    );

    const lidModel = chain(
      group,
      translation(0, 1.54 + open * 0.95, -open * 0.45),
      rotationX(-open * 0.6),
      rotationZ(open * 0.16 + (this.shake > 0 ? Math.sin(this.time * 38) * 0.04 : 0))
    );

    const palette = tones[this.tone];
    const glowAmount = Math.max(0, Math.min(1, open));

    // --- floor shadow / glow
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (this.floorShadow) this.drawQuad(viewProj, [0, 0.001 + float * 0.2, 0], [4.6 - float, 4.6 - float], true, 0.55 - float * 0.8, [
      palette.glow[0] * 0.18 * glowAmount,
      palette.glow[1] * 0.14 * glowAmount,
      palette.glow[2] * 0.1 * glowAmount
    ]);

    // --- solid meshes
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    const mp = this.meshProgram;
    gl.useProgram(mp.program);
    gl.uniformMatrix4fv(mp.u('uViewProj'), false, viewProj);
    gl.uniform3fv(mp.u('uCam'), eye);
    gl.uniform3fv(mp.u('uGlowColor'), palette.glow);
    gl.uniform1f(mp.u('uTopY'), 1.45);

    const paper: Material = { color: palette.paper, metal: 0, rough: 0.44, clear: 0.55, pattern: 1, patternColor: palette.dots };
    const gold: Material = { color: palette.ribbon, metal: 1, rough: 0.26, clear: 0, pattern: 0, patternColor: palette.dots };

    this.drawMesh(this.meshes.body, group, paper, glowAmount, glowAmount);
    this.drawMesh(this.meshes.bodyRibbon, group, gold, glowAmount * 0.8, glowAmount);
    this.drawMesh(this.meshes.lid, lidModel, paper, 0, glowAmount * 0.6);
    this.drawMesh(this.meshes.lidGold, lidModel, gold, 0, glowAmount * 0.6);

    // --- additive light beam + sparkles
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    if (glowAmount > 0.01) {
      this.drawQuad(viewProj, [0, 1.45 + float, 0], [2.6, 3.4], false, glowAmount * 1.3, palette.glow);
    }
    if (this.opts.particles) {
      // ambient sparkles are pure decoration; without a GPU they cost as much as the gift itself
      if (!this.software) this.drawPoints(viewProj, this.ambient, 0, [1.0, 0.86, 0.62], h, [0, 0, 0]);
      if (this.time - this.burstStart < 3.2) {
        this.drawPoints(viewProj, this.burst, 1, [1.0, 0.82, 0.5], h, [0, 1.5 + float, 0]);
      }
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  private bindAttrib(location: number, buffer: WebGLBuffer, size: number) {
    if (location < 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  private drawMesh(mesh: GpuMesh, model: Mat4, mat: Material, glowTop: number, innerLight: number) {
    const gl = this.gl;
    const p = this.meshProgram;
    gl.uniformMatrix4fv(p.u('uModel'), false, model);
    gl.uniformMatrix3fv(p.u('uNormalMat'), false, upper3(model));
    gl.uniform3fv(p.u('uColor'), mat.color);
    gl.uniform1f(p.u('uMetal'), mat.metal);
    gl.uniform1f(p.u('uRough'), mat.rough);
    gl.uniform1f(p.u('uClear'), mat.clear);
    gl.uniform1f(p.u('uPattern'), mat.pattern);
    gl.uniform3fv(p.u('uPatternColor'), mat.patternColor);
    gl.uniform1f(p.u('uGlowTop'), glowTop);
    gl.uniform1f(p.u('uInnerLight'), innerLight);
    gl.uniform1f(p.u('uLite'), this.software ? 1 : 0);
    this.bindAttrib(p.attrib('aPos'), mesh.pos, 3);
    this.bindAttrib(p.attrib('aNor'), mesh.nor, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  private drawQuad(viewProj: Mat4, center: Vec3, size: [number, number], floor: boolean, strength: number, color: Vec3) {
    const gl = this.gl;
    const p = this.quadProgram;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u('uViewProj'), false, viewProj);
    gl.uniform3fv(p.u('uCenter'), center);
    gl.uniform2fv(p.u('uSize'), size);
    gl.uniform1f(p.u('uFloor'), floor ? 1 : 0);
    gl.uniform1f(p.u('uStrength'), Math.max(0, strength));
    gl.uniform3fv(p.u('uColor'), color);
    gl.uniform1f(p.u('uTime'), this.time);
    this.bindAttrib(p.attrib('aUv'), this.quad, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private drawPoints(viewProj: Mat4, set: { pos: WebGLBuffer; data: WebGLBuffer; count: number }, mode: number, color: Vec3, height: number, origin: Vec3) {
    const gl = this.gl;
    const p = this.pointsProgram;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u('uViewProj'), false, viewProj);
    gl.uniform1f(p.u('uTime'), this.time);
    gl.uniform1f(p.u('uPx'), height * (1 / Math.tan((28 * Math.PI) / 360)) * 0.5);
    gl.uniform1f(p.u('uMode'), mode);
    gl.uniform1f(p.u('uBurst'), this.burstStart);
    gl.uniform3fv(p.u('uOrigin'), origin);
    gl.uniform3fv(p.u('uColor'), color);
    this.bindAttrib(p.attrib('aPos'), set.pos, 3);
    this.bindAttrib(p.attrib('aData'), set.data, 4);
    gl.drawArrays(gl.POINTS, 0, set.count);
    // keep attribute state clean for other programs
    gl.disableVertexAttribArray(p.attrib('aData'));
  }
}
