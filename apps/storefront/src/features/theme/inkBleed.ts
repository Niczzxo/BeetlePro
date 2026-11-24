'use client';

/* Ink-bleed theme transition, a faithful TypeScript port of the
   legacy ink IIFE (itself ported in the legacy from
   codemure-official/ink-bleed-theme-changer, inkTransition):
   full-document html2canvas snapshots of both themes are kept on
   the GPU and a WebGL2 ink shader (domain-warped fbm blob,
   tendrils, paper fibre, speckles and a pigment rim) bleeds from
   the click point across the page into the other theme. Same
   parameters, same spread/cleanup math, same timing (1.4 s, GSAP
   power3.out, then a 0.15 s fade onto the live page), the same
   0.45 s CSS cross-fade fallback for no-WebGL2 / reduced motion /
   snapshots-not-ready, and the same 2D ink blob fallback when
   there is no WebGL2 at all. Rim colours are matched to DOSTELO's
   own themes. All hardening is preserved: the 7 s capture cap,
   the 20 s capture watchdog, the toggle busy guard, the rAF
   scroll guard and the bleed scroll pin, the pair-usability
   rule, and overlay cleanup on every path. The capture scroll
   pin is flip-only, as on the live site: background captures
   never pin, and since the scroll-independent capture round
   they are no longer discarded for scrolling either; only a
   fresh interaction or a hidden tab interrupts them, and every
   round (failed, discarded or interrupted) spends from one
   bounded attempt budget with progressive backoff (see the
   capture scheduling note below).

   The one mechanical difference from the legacy: the legacy
   bundles html2canvas 1.4.1 inline as a base64 data URI (with
   CDN retries) so window.html2canvas is simply there. Here the
   same library at the same version (1.4.1) comes from the npm
   package and is loaded with a dynamic import on first use;
   the loader keeps the legacy contract (a shared promise, and a
   failed round never poisons later attempts). No animation
   library is involved on either side. */

type ThemeName = 'light' | 'dark';

interface Snapshot {
  theme: ThemeName;
  canvas: HTMLCanvasElement;
  scale: number;
  key: string;
  headerPx: number;
}

interface Seed {
  x: number;
  y: number;
  angle: number;
}

interface FrameCore {
  from: string;
  to: ThemeName;
  center: { x: number; y: number };
  maxDist: number;
  seed: Seed;
}

interface DrawFrame extends FrameCore {
  progress: number;
  time: number;
  radius: number;
  cleanup: number;
}

const INK_PARAMS = { duration: 1.4, tendril: 1, noiseScale: 1, softness: 1.4, drift: 1 };
/* Pigment pooled at the frontier, keyed by the theme being revealed:
   a touch denser than DOSTELO's dark ground #1C1B17, a touch brighter
   than its light ground #F4F2ED (the zip keys its rim the same way). */
const RIM_COLOR: Record<ThemeName, [number, number, number]> = {
  dark: [0.055, 0.052, 0.043],
  light: [1.0, 0.998, 0.986],
};
const CAPTURE_BG: Record<ThemeName, string> = { light: '#F4F2ED', dark: '#1C1B17' };
const SPREAD = { growth: 0.7, cleanupFrom: 0.45, cleanupReach: 0.4, cleanupPow: 2 };
const FADE_OUT = 0.15;
const CSS_FADE_S = 0.45;
const RESIZE_DEBOUNCE_MS = 250;

/* ---------- html2canvas loading (the npm 1.4.1 package) ---------- */
type Html2CanvasFn = (
  element: HTMLElement,
  options?: { [key: string]: unknown },
) => Promise<HTMLCanvasElement>;

let h2cPromise: Promise<Html2CanvasFn> | null = null;
function loadHtml2Canvas(): Promise<Html2CanvasFn> {
  const w = window as unknown as { html2canvas?: Html2CanvasFn };
  if (w.html2canvas) return Promise.resolve(w.html2canvas);
  if (!h2cPromise) {
    h2cPromise = import('html2canvas').then((mod) => {
      const fn = ((mod as unknown as { default?: unknown }).default ?? mod) as Html2CanvasFn;
      if (typeof fn !== 'function') throw new Error('html2canvas failed to load');
      return fn;
    });
    /* A failed round must not poison later attempts (e.g. network back). */
    h2cPromise.catch(() => {
      h2cPromise = null;
    });
  }
  return h2cPromise;
}

/* ---------- Tileable gradient-noise texture (port of gl/noiseTexture.ts) ---------- */
const NOISE_SIZE = 256;
const NOISE_CELLS = 32;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseChannel(rand: () => number): Float32Array {
  const gx = new Float32Array(NOISE_CELLS * NOISE_CELLS);
  const gy = new Float32Array(NOISE_CELLS * NOISE_CELLS);
  for (let i = 0; i < gx.length; i++) {
    const ang = rand() * Math.PI * 2;
    gx[i] = Math.cos(ang);
    gy[i] = Math.sin(ang);
  }
  const texelsPerCell = NOISE_SIZE / NOISE_CELLS;
  const out = new Float32Array(NOISE_SIZE * NOISE_SIZE);
  function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function at(cx: number, cy: number): number {
    return ((cy + NOISE_CELLS) % NOISE_CELLS) * NOISE_CELLS + ((cx + NOISE_CELLS) % NOISE_CELLS);
  }
  for (let y = 0; y < NOISE_SIZE; y++) {
    const py = (y + 0.5) / texelsPerCell;
    const cy = Math.floor(py),
      fy = py - cy,
      v = fade(fy);
    for (let x = 0; x < NOISE_SIZE; x++) {
      const px = (x + 0.5) / texelsPerCell;
      const cx = Math.floor(px),
        fx = px - cx,
        u = fade(fx);
      const i00 = at(cx, cy),
        i10 = at(cx + 1, cy),
        i01 = at(cx, cy + 1),
        i11 = at(cx + 1, cy + 1);
      const n00 = gx[i00] * fx + gy[i00] * fy;
      const n10 = gx[i10] * (fx - 1) + gy[i10] * fy;
      const n01 = gx[i01] * fx + gy[i01] * (fy - 1);
      const n11 = gx[i11] * (fx - 1) + gy[i11] * (fy - 1);
      const nx0 = n00 + (n10 - n00) * u;
      const nx1 = n01 + (n11 - n01) * u;
      out[y * NOISE_SIZE + x] = nx0 + (nx1 - nx0) * v;
    }
  }
  for (let k = 0; k < out.length; k++) out[k] = Math.max(-1, Math.min(1, out[k] * 1.45));
  return out;
}

function createNoiseTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const rand = mulberry32(0x1b1eed);
  const channels = [noiseChannel(rand), noiseChannel(rand), noiseChannel(rand), noiseChannel(rand)];
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
  for (let i = 0; i < NOISE_SIZE * NOISE_SIZE; i++) {
    for (let c = 0; c < 4; c++) {
      data[i * 4 + c] = Math.round((channels[c][i] * 0.5 + 0.5) * 255);
    }
  }
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, NOISE_SIZE, NOISE_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return tex;
}

/* ---------- Shader program helper (port of gl/program.ts) ---------- */
interface Program {
  program: WebGLProgram;
  uniform: (name: string) => WebGLUniformLocation | null;
}

function createProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): Program {
  function compile(type: number, src: string): WebGLShader {
    const sh = gl.createShader(type);
    if (!sh) throw new Error('createShader failed');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(sh) || '';
      gl.deleteShader(sh);
      throw new Error('Shader compile error:\n' + log);
    }
    return sh;
  }
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram failed');
  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error('Program link error:\n' + (gl.getProgramInfoLog(program) || ''));
  }
  const cache: Record<string, WebGLUniformLocation | null> = {};
  return {
    program,
    uniform(name: string) {
      if (!(name in cache)) cache[name] = gl.getUniformLocation(program, name);
      return cache[name];
    },
  };
}
const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
  var FRAG_SRC = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform vec2 uFromSize;
uniform vec2 uToSize;
uniform vec4 uFromMap;
uniform vec4 uToMap;
uniform vec2 uFromHdr;
uniform vec2 uToHdr;
uniform float uCanvasScale;
uniform vec2 uRes;

uniform vec2 uCenter;
uniform float uRadius;
uniform float uCleanup;
uniform float uTime;
uniform float uRef;
uniform vec2 uSeed;
uniform mat2 uSeedRot;

uniform float uTendril;
uniform float uNoiseScale;
uniform float uSoftness;
uniform float uDrift;
uniform vec3 uRimColor;

out vec4 outColor;

const float A_LOBE = 0.22;
const float A_BLOB = 0.20;
const float A_SUM = A_LOBE + A_BLOB;
const float TENDRIL_REACH = 0.24;
const float FIBRE_PX = 1.8;
const float THIN_MAX_PX = 26.0;
const float SPECK_PX = 18.0;
const float HAZE_PX = 16.0;

uniform sampler2D uNoise;
const float INV_CELLS = 1.0 / 32.0;

float gnoise(vec2 p) {
  return textureLod(uNoise, p * INV_CELLS, 0.0).r * 2.0 - 1.0;
}

float gnoise2(vec2 p) {
  return textureLod(uNoise, p * INV_CELLS, 0.0).g * 2.0 - 1.0;
}

const mat2 OCT = mat2(0.8, 0.6, -0.6, 0.8) * 2.03;

float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * gnoise(p); p = OCT * p + 17.13; a *= 0.5; }
  return s / 0.875;
}

float fbm4(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * gnoise(p); p = OCT * p + 17.13; a *= 0.5; }
  return s / 0.9375;
}

float fbm5(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * gnoise(p); p = OCT * p + 17.13; a *= 0.5; }
  return s / 0.96875;
}

vec3 sampleDoc(sampler2D tex, vec2 size, vec4 map, vec2 hdr, vec2 devPx) {
  vec2 texPx = devPx * map.x + map.yz;
  /* Header band re-anchor: the snapshot's sticky-header copy lives
     in a trailer band at the foot of the texture (hdr.x is its first
     row, hdr.y its height, both in texture px), not at the scroll
     offset it was captured from. Viewport rows the live sticky
     header covers sample the copy; every other row samples the
     document at the current scroll. A snapshot therefore stays
     pixel-true at ANY scroll position and never needs recapturing
     just because the visitor moved. hdr.y = 0 disables the remap
     (composite sources, headerless captures). */
  if (map.w < 0.5 && hdr.y > 0.5) {
    float row = devPx.y * map.x;
    if (row < hdr.y) texPx.y = hdr.x + row;
  }
  if (map.w > 0.5) texPx.y = size.y - texPx.y;
  vec2 uv = clamp(texPx, vec2(0.5), size - 0.5) / size;
  return texture(tex, uv).rgb;
}

void main() {
  vec2 devPx = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 css = devPx / uCanvasScale;
  vec2 rel = css - uCenter;
  float d = length(rel);
  float R = uRadius;
  float cleanup = uCleanup;

  float inner = R * (1.0 - A_SUM) + cleanup - FIBRE_PX - THIN_MAX_PX - uSoftness * 2.0;
  float outer = R * (1.0 + A_SUM) * (1.0 + TENDRIL_REACH * uTendril) + cleanup + FIBRE_PX + SPECK_PX + uSoftness * 2.0;
  if (d < inner) {
    outColor = vec4(sampleDoc(uTo, uToSize, uToMap, uToHdr, devPx), 1.0);
    return;
  }
  if (d > outer) {
    outColor = vec4(sampleDoc(uFrom, uFromSize, uFromMap, uFromHdr, devPx), 1.0);
    return;
  }

  float t = uTime * uDrift;
  vec2 p = rel / uRef;
  vec2 dir = uSeedRot * (rel / max(d, 1e-3));
  float ns = uNoiseScale;

  vec2 q = p * (2.4 * ns) + uSeed;
  vec2 w = vec2(
    fbm3(q + vec2(0.0, 0.31 * t)),
    fbm3(q + vec2(5.2, 1.3) - vec2(0.27 * t, 0.0))
  );

  float blob = fbm5(q + 2.3 * w + vec2(0.12 * t, -0.08 * t));
  vec2 lq = dir * 0.9 + uSeed.yx * 0.37 + vec2(0.06 * t);
  float lobes = gnoise(lq) * 0.75 + gnoise(lq * 2.1 + 9.1) * 0.25;
  float reach = clamp(1.0 + A_LOBE * 1.6 * lobes + A_BLOB * 1.5 * blob, 1.0 - A_SUM, 1.0 + A_SUM);
  float f = d - R * reach;

  float gate = smoothstep(-0.35, 0.4, fbm3(dir * 1.6 + uSeed * 0.61 + 3.7));
  vec2 tq = dir * (2.2 * ns) + (d / uRef) * vec2(2.6, -1.9) * ns + 1.2 * w + uSeed * 1.7 + vec2(0.0, 0.18 * t);
  float n = fbm4(tq);
  float ridgePx = abs(n) * max(d, 24.0) / (4.0 * ns);
  float lenN = gnoise(dir * 3.1 + uSeed * 0.43 + vec2(0.1 * t)) * 0.5 + 0.5;
  float L = uTendril * TENDRIL_REACH * R * gate * (0.35 + 0.65 * lenN);
  float along = clamp(f / max(L, 1.0), 0.0, 1.0);
  float width = clamp(R * 0.022, 1.5, 9.0) * (1.0 - along * along) * gate;
  float ft = max(f - L, ridgePx - width);
  float k = 6.0;
  float hh = clamp(0.5 + 0.5 * (ft - f) / k, 0.0, 1.0);
  f = mix(ft, f, hh) - k * hh * (1.0 - hh);

  vec2 fq = css * 0.34 + uSeed * 13.0;
  float fibre = gnoise2(fq) * 0.65 + gnoise2(OCT * fq + 5.3) * 0.35;
  f += fibre * FIBRE_PX;

  f -= cleanup;

  float soft = max(uSoftness, 0.6);
  float inked = 1.0 - smoothstep(-soft, soft, f);

  float thinW = mix(3.0, THIN_MAX_PX, clamp(blob * 0.8 + 0.3, 0.0, 1.0));
  float density = mix(0.6, 1.0, smoothstep(0.0, thinW, -f));
  float cov = inked * density;

  float hazeW = mix(4.0, HAZE_PX, clamp(0.5 + 0.5 * blob, 0.0, 1.0));
  float haze = (1.0 - smoothstep(0.0, hazeW, f)) * smoothstep(-0.3, 0.6, 0.35 * fibre + w.x);
  cov = max(cov, haze * 0.24 * step(0.0, f));

  float ahead = clamp(f / SPECK_PX, 0.0, 1.0);
  if (f > 0.0 && ahead < 1.0) {
    float sn = gnoise2(css * 0.55 + uSeed * 7.0 + 41.0) * 0.5 + 0.5;
    float th = mix(0.80, 0.96, ahead);
    cov = max(cov, smoothstep(th, th + 0.04, sn) * 0.75 * (1.0 - ahead));
  }

  vec3 from = sampleDoc(uFrom, uFromSize, uFromMap, uFromHdr, devPx);
  vec3 to = sampleDoc(uTo, uToSize, uToMap, uToHdr, devPx);
  vec3 col = mix(from, to, cov);

  float rimX = (f + soft * 1.1) / (soft * 1.4 + 1.2);
  float rim = exp(-rimX * rimX) * inked;
  col = mix(col, uRimColor, rim * 0.45);

  outColor = vec4(col, 1.0);
}
`;

/* ---------- Renderer (port of gl/renderer.ts) ---------- */
interface TexEntry {
  texture: WebGLTexture;
  width: number;
  height: number;
  scale: number;
  key: string;
  headerPx: number;
}

interface Composite {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

interface SamplerInfo {
  texture: WebGLTexture;
  width: number;
  height: number;
  hdrStart: number;
  hdrBand: number;
  ratio: number;
  offsetX: number;
  offsetY: number;
  flipY: boolean;
}

interface Renderer {
  maxTextureSize: number;
  lost: boolean;
  rectLeft: number;
  rectTop: number;
  canvasScale: number;
  originX: number;
  originY: number;
  watchContext: (onLost: () => void, onRestored: () => void) => void;
  resize: (scale: number) => void;
  upload: (snapshot: Snapshot) => void;
  hasValid: (theme: ThemeName, key: string) => boolean;
  invalidate: (theme: ThemeName) => void;
  freeze: (frame: DrawFrame) => boolean;
  draw: (frame: DrawFrame) => void;
}

function createRenderer(cv: HTMLCanvasElement): Renderer | null {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = cv.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
  } catch (e) {
    gl = null;
  }
  if (!gl) return null;
  const g: WebGL2RenderingContext = gl;

  let textures: Partial<Record<ThemeName, TexEntry>> = {};
  let composites: (Composite | undefined)[] = [];
  let activeComposite = -1;
  let canvasScale = 1;
  let lost = false;
  let rectLeft = 0,
    rectTop = 0,
    originX = 0,
    originY = 0;
  let program: Program | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let noise: WebGLTexture | null = null;
  const maxTextureSize = g.getParameter(g.MAX_TEXTURE_SIZE) as number;

  function createTexture(): WebGLTexture {
    const t = g.createTexture();
    if (!t) throw new Error('createTexture failed');
    g.bindTexture(g.TEXTURE_2D, t);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    return t;
  }

  function init(): void {
    program = createProgram(g, VERT_SRC, FRAG_SRC);
    const v = g.createVertexArray();
    if (!v) throw new Error('createVertexArray failed');
    vao = v;
    noise = createNoiseTexture(g);
    composites = [];
    activeComposite = -1;
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    g.pixelStorei(g.UNPACK_COLORSPACE_CONVERSION_WEBGL, g.NONE);
  }
  try {
    init();
  } catch (e) {
    return null;
  }

  function ensureComposite(index: number): Composite {
    const width = cv.width,
      height = cv.height;
    let c = composites[index];
    if (!c) {
      const framebuffer = g.createFramebuffer();
      if (!framebuffer) throw new Error('createFramebuffer failed');
      c = { texture: createTexture(), framebuffer, width: 0, height: 0, originX: 0, originY: 0 };
      composites[index] = c;
    }
    if (c.width !== width || c.height !== height) {
      g.bindTexture(g.TEXTURE_2D, c.texture);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, width, height, 0, g.RGBA, g.UNSIGNED_BYTE, null);
      g.bindFramebuffer(g.FRAMEBUFFER, c.framebuffer);
      g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, c.texture, 0);
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      c.width = width;
      c.height = height;
    }
    return c;
  }

  function sampler(source: string): SamplerInfo | null {
    if (source === 'composite') {
      const c = composites[activeComposite];
      if (!c) return null;
      return {
        texture: c.texture,
        width: c.width,
        height: c.height,
        hdrStart: 0,
        hdrBand: 0,
        ratio: 1,
        offsetX: Math.round((originX - c.originX) * canvasScale),
        offsetY: Math.round((originY - c.originY) * canvasScale),
        flipY: true,
      };
    }
    const t = textures[source as ThemeName];
    if (!t) return null;
    return {
      texture: t.texture,
      width: t.width,
      height: t.height,
      hdrStart: t.headerPx ? t.height - t.headerPx : 0,
      hdrBand: t.headerPx || 0,
      ratio: t.scale / canvasScale,
      offsetX: Math.floor(originX * t.scale + 0.5),
      offsetY: Math.floor(originY * t.scale + 0.5),
      flipY: false,
    };
  }

  function render(frame: DrawFrame): boolean {
    if (!program) return false;
    const from = sampler(frame.from);
    const to = sampler(frame.to);
    if (!from || !to) return false;
    const uniform = program.uniform;
    g.viewport(0, 0, cv.width, cv.height);
    g.useProgram(program.program);
    g.bindVertexArray(vao);

    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, from.texture);
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, to.texture);
    g.activeTexture(g.TEXTURE2);
    g.bindTexture(g.TEXTURE_2D, noise);

    g.uniform1i(uniform('uFrom'), 0);
    g.uniform1i(uniform('uTo'), 1);
    g.uniform1i(uniform('uNoise'), 2);
    g.uniform2f(uniform('uFromSize'), from.width, from.height);
    g.uniform2f(uniform('uToSize'), to.width, to.height);
    g.uniform4f(uniform('uFromMap'), from.ratio, from.offsetX, from.offsetY, from.flipY ? 1 : 0);
    g.uniform4f(uniform('uToMap'), to.ratio, to.offsetX, to.offsetY, to.flipY ? 1 : 0);
    g.uniform2f(uniform('uFromHdr'), from.hdrStart, from.hdrBand);
    g.uniform2f(uniform('uToHdr'), to.hdrStart, to.hdrBand);
    g.uniform1f(uniform('uCanvasScale'), canvasScale);
    g.uniform2f(uniform('uRes'), cv.width, cv.height);
    g.uniform2f(uniform('uCenter'), frame.center.x, frame.center.y);
    g.uniform1f(uniform('uRadius'), frame.radius);
    g.uniform1f(uniform('uCleanup'), frame.cleanup);
    g.uniform1f(uniform('uTime'), frame.time);
    g.uniform1f(uniform('uRef'), Math.max(cv.width, cv.height) / canvasScale);
    g.uniform2f(uniform('uSeed'), frame.seed.x, frame.seed.y);
    const cos = Math.cos(frame.seed.angle),
      sin = Math.sin(frame.seed.angle);
    g.uniformMatrix2fv(uniform('uSeedRot'), false, [cos, sin, -sin, cos]);

    g.uniform1f(uniform('uTendril'), INK_PARAMS.tendril);
    g.uniform1f(uniform('uNoiseScale'), INK_PARAMS.noiseScale);
    g.uniform1f(uniform('uSoftness'), INK_PARAMS.softness);
    g.uniform1f(uniform('uDrift'), INK_PARAMS.drift);
    const rim = RIM_COLOR[frame.to];
    g.uniform3f(uniform('uRimColor'), rim[0], rim[1], rim[2]);

    g.drawArrays(g.TRIANGLES, 0, 3);
    return true;
  }

  const R: Renderer = {
    maxTextureSize,
    get lost() {
      return lost;
    },
    get rectLeft() {
      return rectLeft;
    },
    get rectTop() {
      return rectTop;
    },
    get canvasScale() {
      return canvasScale;
    },
    get originX() {
      return originX;
    },
    get originY() {
      return originY;
    },
    watchContext(onLost, onRestored) {
      cv.addEventListener('webglcontextlost', function (e) {
        e.preventDefault();
        lost = true;
        textures = {};
        composites = [];
        activeComposite = -1;
        onLost();
      });
      cv.addEventListener('webglcontextrestored', function () {
        lost = false;
        try {
          init();
        } catch (e) {
          /* restored context stays unusable: draws no-op while lost paths guard */
        }
        onRestored();
      });
    },
    resize(scale) {
      const rect = cv.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * scale));
      const h = Math.max(1, Math.round(rect.height * scale));
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
      canvasScale = rect.width > 0 ? w / rect.width : scale;
      /* Where the canvas box actually sits in document space. On a
         desktop the fixed inset:0 canvas starts exactly at the scroll
         offset, but on phones the visual viewport can sit offset
         inside the layout viewport (browser URL bar shown, in-app
         webview chrome), so the canvas lands some pixels away from
         (scrollX, scrollY). Sampling the snapshots from the raw scroll
         offset then draws every badge and price a second time, ghosted
         by that gap, for the whole spread. Measure the real box and
         sample from it instead: the snapshot and the live page agree
         pixel-for-pixel at any scroll position, in both directions. */
      rectLeft = rect.left;
      rectTop = rect.top;
      originX = window.scrollX + rect.left;
      originY = window.scrollY + rect.top;
    },
    upload(snapshot) {
      if (lost) return;
      let entry = textures[snapshot.theme];
      if (!entry) {
        entry = { texture: createTexture(), width: 0, height: 0, scale: 0, key: '', headerPx: 0 };
        textures[snapshot.theme] = entry;
      }
      g.bindTexture(g.TEXTURE_2D, entry.texture);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, snapshot.canvas);
      entry.width = snapshot.canvas.width;
      entry.height = snapshot.canvas.height;
      entry.scale = snapshot.scale;
      entry.key = snapshot.key;
      entry.headerPx = snapshot.headerPx || 0;
    },
    hasValid(theme, key) {
      const t = textures[theme];
      return !lost && !!t && t.key === key;
    },
    invalidate(theme) {
      delete textures[theme];
    },
    freeze(frame) {
      if (lost) return false;
      const index = activeComposite === 0 ? 1 : 0;
      let target: Composite;
      try {
        target = ensureComposite(index);
      } catch (e) {
        return false;
      }
      g.bindFramebuffer(g.FRAMEBUFFER, target.framebuffer);
      const ok = render(frame);
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      if (!ok) return false;
      target.originX = originX;
      target.originY = originY;
      activeComposite = index;
      return true;
    },
    draw(frame) {
      if (lost) return;
      render(frame);
    },
  };
  return R;
}

let inkInitialized = false;

/** Wire the ink-bleed transition to the header theme toggle and the
    #inkCanvas overlay, exactly as the legacy IIFE did at page load.
    Runs once; later calls are no-ops. */
export function initInkBleed(): void {
  if (inkInitialized) return;
  const btn = document.getElementById('themeToggle');
  const root = document.documentElement;
  const canvasEl = document.getElementById('inkCanvas');
  if (!btn || !canvasEl) return;
  inkInitialized = true;
  const canvas = canvasEl as HTMLCanvasElement;

  function getTheme(): ThemeName {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function otherTheme(t: ThemeName): ThemeName {
    return t === 'dark' ? 'light' : 'dark';
  }
  function syncBtn(): void {
    const dark = getTheme() === 'dark';
    btn!.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', dark ? '#1C1B17' : '#F4F2ED');
  }
  function applyTheme(t: ThemeName): void {
    root.setAttribute('data-theme', t);
    try {
      localStorage.setItem('dostelo-theme', t);
    } catch (e) {
      /* storage unavailable: the flip still applies for this page */
    }
    syncBtn();
  }

  /* ---------- Page snapshots (port of capture/capture.ts) ---------- */
  function renderScale(): number {
    /* Capped lower than raw DPR: full-document snapshots at DPR 2 are
       the heaviest work this page does, and at 1.5/1.25 the bleed is
       visually identical while captures finish far sooner. */
    const cap = window.matchMedia('(pointer: coarse)').matches ? 1.25 : 1.5;
    return Math.min(window.devicePixelRatio || 1, cap);
  }
  function documentSize(): { width: number; height: number } {
    const el = document.documentElement;
    /* The body can be taller than the root element when a view
       overflows it. Sizing the snapshot from the root alone then
       clips its foot, so the ink reaches the bottom of the page
       already torn, worst over the footer. Take the tallest of
       the three so the snapshot always covers the whole
       document, footer included. */
    const bodyH = document.body ? document.body.scrollHeight : 0;
    return { width: el.clientWidth, height: Math.max(el.scrollHeight, el.clientHeight, bodyH) };
  }
  function visibleViewEl(): HTMLElement | null {
    const views = document.querySelectorAll('.view');
    for (let i = 0; i < views.length; i++) {
      if (!(views[i] as HTMLElement).hidden) return views[i] as HTMLElement;
    }
    return null;
  }
  function layoutKey(scale: number): string {
    /* What a snapshot actually depends on: the visible view and its
       routed content (product, article and shop category all live
       in the route), the shop's own filter state, the document
       WIDTH (a width change reflows everything) and the capture
       scale. Document HEIGHT is deliberately NOT in the key:
       growing or shrinking below the fold (footer accordion, late
       images, the welcome modal) does not move a pixel the visitor
       can see at flip time, and keying on it made every small
       layout shift throw both snapshots away, restart the capture
       loop and bring back the first-tap lag. Scroll is not in the
       key either: the header band is re-anchored by the shader.
       Height drift is handled where the pair is used instead: the
       view's own height is drift-checked in pairUsable, and
       whole-document drift only marks the pair stale for an idle
       background refresh.
       Port note: the routes here are real Next routes, not the
       legacy hash, so the route component is location.pathname +
       search; the shop filter state lives in React state, but it
       is mirrored in the DOM (the active .fbtn carries data-filter
       and the sort is the #shopSort select's value), so the key
       reads it from there and matches the legacy shopCat, shopSort
       and shopQuery triple. */
    const s = documentSize();
    const v = visibleViewEl();
    const id = v ? v.id : 'none';
    let extra = '';
    if (id === 'view-shop') {
      const onBtn = document.querySelector('.fbtn.on');
      const cat = onBtn ? onBtn.getAttribute('data-filter') || '' : '';
      const sortEl = document.getElementById('shopSort') as HTMLSelectElement | null;
      const sort = sortEl ? sortEl.value : '';
      const q = new URLSearchParams(window.location.search).get('q') || '';
      extra = '|' + cat + '~' + sort + '~' + q;
    }
    return id + '|' + window.location.pathname + window.location.search + extra + '|' + s.width + '@' + scale;
  }

  function capturePage(
    theme: ThemeName,
    scale: number,
    maxTextureSize: number,
  ): Promise<Snapshot> {
    const key = layoutKey(scale);
    const size = documentSize();
    /* The sticky header's copy is no longer glued at the capture
       scroll offset (the old capY placement): that made every
       snapshot pixel-true at exactly one scroll position, so any
       scroll between capture and flip threw the pair away and the
       flip paid two full captures. Instead the copy is painted
       into a trailer band BELOW the document (rows size.height to
       size.height + headerH, over the theme background the canvas
       is filled with) and the shader re-anchors that band onto
       the header rows of whatever scroll position a flip happens
       at. headerH is the live header's rendered height, measured
       here on the real page. */
    const hdrEl = document.querySelector('header');
    const headerH = hdrEl ? Math.round(hdrEl.getBoundingClientRect().height) : 0;
    const totalH = size.height + headerH;
    const safeScale = Math.min(scale, maxTextureSize / size.width, maxTextureSize / totalH);
    return loadHtml2Canvas().then(function (html2canvas) {
      return html2canvas(document.body, {
        scale: safeScale,
        backgroundColor: CAPTURE_BG[theme],
        x: 0,
        y: 0,
        width: size.width,
        height: totalH,
        scrollX: 0,
        scrollY: 0,
        windowWidth: size.width,
        windowHeight: document.documentElement.clientHeight,
        logging: false,
        useCORS: true,
        onclone: function (doc: Document) {
          doc.documentElement.setAttribute('data-theme', theme);
          /* The live toggle stays above the ink, so leave a hole for it in the
             snapshot (visibility keeps its box, so the nav does not shift). */
          const live = doc.querySelectorAll<HTMLElement>('[data-ink-live]');
          for (let i = 0; i < live.length; i++) live[i].style.visibility = 'hidden';
          /* Fixed chrome html2canvas would misplace in a full-document shot. */
          const chrome = doc.querySelectorAll<HTMLElement>(
            '#scrim, #bagDrawer, #welcomeModal, #helpModal, #toast, #searchDrop',
          );
          for (let j = 0; j < chrome.length; j++) chrome[j].style.visibility = 'hidden';
          /* Freeze every transition/animation in the clone so computed styles are
             the theme's final values, reveal scroll-reveal items html2canvas
             would otherwise catch mid-flight, and glue a copy of the sticky
             header into the trailer band below the document. */
          const st = doc.createElement('style');
          st.textContent =
            '*{transition:none!important;animation:none!important}' +
            '.reveal,.reveal-zoom,.reveal-look,.reveal-pop{opacity:1!important;transform:none!important}' +
            'header{background:var(--bg)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
          doc.head.appendChild(st);
          const hdr = doc.querySelector('header');
          if (hdr) {
            /* The live header is sticky: it RESERVES its height in the
               flow and paints at the viewport top. The old glue made the
               clone's header position:absolute, which removed that
               reserved height - so every element below it rendered one
               header-height too high in the snapshot, and during the
               spread the whole page sat ~55px too high, snapping back
               down at the handoff (measured live). Instead: keep the
               original header in flow but invisible (its box preserves
               the live layout exactly), and paint a copy into the
               trailer band below the document, where it contaminates
               no content row and the shader can re-anchor it onto the
               header band of any scroll position at flip time. */
            const stuck = hdr.cloneNode(true) as HTMLElement;
            stuck.removeAttribute('id');
            const idEls = stuck.querySelectorAll('[id]');
            for (let ie = 0; ie < idEls.length; ie++) idEls[ie].removeAttribute('id');
            const liveEls = stuck.querySelectorAll<HTMLElement>('[data-ink-live]');
            for (let li = 0; li < liveEls.length; li++) liveEls[li].style.visibility = 'hidden';
            stuck.style.position = 'absolute';
            stuck.style.top = size.height + 'px';
            stuck.style.left = '0';
            stuck.style.right = '0';
            stuck.style.margin = '0';
            /* Pin the copy to the header's exact rendered height so
               its box cannot breathe by a pixel against the live one. */
            const hcs =
              doc.defaultView && doc.defaultView.getComputedStyle
                ? doc.defaultView.getComputedStyle(hdr)
                : null;
            if (hcs && hcs.height && hcs.height !== 'auto') stuck.style.height = hcs.height;
            hdr.style.visibility = 'hidden';
            if (hdr.parentNode) hdr.parentNode.insertBefore(stuck, hdr.nextSibling);
          }
          /* Snapshot fidelity: html2canvas mis-renders two things on this
             page - <img> boxes (it crops/scales them differently from the
             browser's object-fit, so photos visibly jump at the handoff)
             and CSS-styled inline SVG icons (their stroke/fill live in
             classes, which its serializer drops, so header icons vanish
             in the snapshot). Inside the CLONE only, swap each photo for
             a same-box background div (computed size + object-position
             copied inline) and stamp each svg's computed paint onto the
             element itself. The live page is untouched; the snapshot now
             matches it pixel-for-pixel, so the bleed reveals the new
             theme without any element changing size, crop or visibility. */
          try {
            const view = doc.defaultView;
            if (view) {
              const cimgs = doc.querySelectorAll('img');
              for (let ci = 0; ci < cimgs.length; ci++) {
                const cim = cimgs[ci],
                  csrc = cim.getAttribute('src');
                if (!csrc || !cim.parentNode) continue;
                const ics = view.getComputedStyle(cim);
                /* An img hidden by the clone's theme (the logo's off-theme
                   twin) must stay hidden - swapping it for a visible div
                   would double the logo in the snapshot. */
                if (ics.display === 'none') continue;
                const dv = doc.createElement('div');
                dv.setAttribute('aria-hidden', 'true');
                dv.style.width = ics.width;
                dv.style.height = ics.height;
                dv.style.display = 'block';
                dv.style.borderRadius = ics.borderRadius;
                dv.style.backgroundImage = 'url("' + csrc + '")';
                dv.style.backgroundSize = ics.objectFit === 'contain' ? 'contain' : 'cover';
                dv.style.backgroundPosition = ics.objectPosition || '50% 50%';
                dv.style.backgroundRepeat = 'no-repeat';
                cim.parentNode.replaceChild(dv, cim);
              }
              const csvgs = doc.querySelectorAll('svg');
              for (let cv = 0; cv < csvgs.length; cv++) {
                const sg = csvgs[cv],
                  scs = view.getComputedStyle(sg);
                if (scs.stroke && scs.stroke !== 'none') sg.style.stroke = scs.stroke;
                if (scs.fill) sg.style.fill = scs.fill;
                if (scs.color) sg.style.color = scs.color;
                const sw = parseFloat(scs.width),
                  sh = parseFloat(scs.height);
                if (sw > 0) sg.setAttribute('width', String(sw));
                if (sh > 0) sg.setAttribute('height', String(sh));
                /* Paint lives on the root, but html2canvas serializes the
                   svg standalone - stamp each shape's own computed paint
                   (stroke, fill, widths, caps) onto the shape itself so
                   the icons survive serialization. */
                const shapes = sg.querySelectorAll<SVGGraphicsElement>(
                  'path, circle, line, rect, polyline, polygon, ellipse, use',
                );
                for (let cp = 0; cp < shapes.length; cp++) {
                  const el = shapes[cp],
                    ecs = view.getComputedStyle(el);
                  el.style.stroke = ecs.stroke;
                  el.style.fill = ecs.fill;
                  el.style.strokeWidth = ecs.strokeWidth;
                  el.style.strokeLinecap = ecs.strokeLinecap;
                  el.style.strokeLinejoin = ecs.strokeLinejoin;
                  el.style.opacity = ecs.opacity;
                }
              }
              /* Inputs: html2canvas draws their text at the box top; the
                 live page centres it. Match by line-height in the clone. */
              const cinps = doc.querySelectorAll('input');
              for (let cq = 0; cq < cinps.length; cq++) {
                const inp = cinps[cq],
                  qcs = view.getComputedStyle(inp);
                const ih = parseFloat(qcs.height) || 0;
                const ph2 = inp.parentElement
                  ? parseFloat(view.getComputedStyle(inp.parentElement).height) || 0
                  : 0;
                const th = Math.max(ih, ph2);
                if (th > 0) {
                  inp.style.lineHeight = th + 'px';
                  if (ph2 > ih) inp.style.height = th + 'px';
                }
              }
            }
          } catch (e) {
            /* clone fidelity is best-effort: a plain snapshot still bleeds */
          }
        },
      }).then(function (cv) {
        return { theme, canvas: cv, scale: safeScale, key, headerPx: Math.round(headerH * safeScale) };
      });
    });
  }

  /* ---------- Transition orchestration (port of ui/inkTransition.ts) ---------- */
  const renderer: Renderer | null = createRenderer(canvas);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { progress: 0, time: 0 };
  let frame: FrameCore | null = null;
  let rafId = 0,
    fadeRafId = 0,
    animStart = 0,
    fadeStart = 0;
  let cssFadeTimer = 0,
    resizeTimer = 0;
  let captureGen = 0,
    capturing = false,
    captureQueued = false,
    toggleBusy = false,
    captureFailStreak = 0;
  /* When the running flip started, for the heal watchdog: a flip
     whose animation chain died mid-spread or mid-fade (a draw
     error, a throttled webview) otherwise leaves frame set forever
     and the snapshot composited over the page with no cleanup
     path. Stamped at the single frame assignment in toggle(). */
  let flipStartedAt = 0;
  /* Pair bookkeeping for the scroll-independent snapshots. The
     pair itself is keyed by layoutKey (view, route, shop state,
     width, scale) and stays usable at any scroll position.
     pairViewHeight tracks the visible view's height when the pair
     was certified: drift past a small tolerance means the view
     itself was rebuilt at a very different height (a re-rendered
     grid, a different checkout), the pair counts as unusable and
     is recaptured. pairDocHeight tracks the whole document:
     drift there (a footer accordion opening, late media) only
     marks the pair stale (pairStale) for a background refresh
     when idle, and never blocks a flip. captureBlockedKey stops
     the retry loop once a layout's attempt budget is spent, until
     a real trigger (a new layout key) arrives, and
     captureNotBefore carries the progressive backoff between
     rounds so no trigger can bypass it by rescheduling early. */
  let pairViewHeight = 0,
    pairDocHeight = 0,
    pairStale = false;
  let captureBlockedKey = '',
    lastCaptureKey = '',
    captureNotBefore = 0;
  let bleedPin: { x: number; y: number; fn: () => void } | null = null;
  /* The ink canvas is a fixed, viewport-aligned snapshot taken at one
     scroll position. If the page scrolled during the spread, the canvas
     and the live page beneath it would disagree and the swap-back would
     visibly jump. So for the whole bleed + fade-out, hold the scroll
     exactly where the flip started; release it when the canvas hides. */
  function pinBleedScroll(): void {
    unpinBleedScroll();
    const px = window.scrollX,
      py = window.scrollY;
    const fn = function () {
      if (window.scrollX !== px || window.scrollY !== py) window.scrollTo(px, py);
    };
    window.addEventListener('scroll', fn, { passive: true });
    bleedPin = { x: px, y: py, fn };
    root.classList.add('ink-capturing');
  }
  function unpinBleedScroll(): void {
    if (!bleedPin) return;
    window.removeEventListener('scroll', bleedPin.fn);
    if (window.scrollX !== bleedPin.x || window.scrollY !== bleedPin.y)
      window.scrollTo(bleedPin.x, bleedPin.y);
    bleedPin = null;
    if (!capturing) root.classList.remove('ink-capturing');
  }

  /* ---------- Scroll guard ----------
     A theme flip must never move the visitor: html2canvas is known to
     shove the live page's scroll position while it renders its clone,
     and the event-based pins react a frame late - a shove could land
     the visitor far from where they flipped (reported as "changing the
     theme throws me to the footer"). For the whole flip - capture wait,
     bleed, fade - a rAF loop puts the scroll straight back every frame,
     so the exact position survives in both directions, at any depth. */
  let guardY: number | null = null,
    guardRAF = 0,
    guardUntil = 0;
  function guardStart(): void {
    guardY = window.scrollY;
    guardUntil = performance.now() + 9000;
    if (!guardRAF) guardRAF = requestAnimationFrame(guardTick);
  }
  function guardExtend(ms: number): void {
    if (guardY === null) return;
    guardUntil = Math.max(guardUntil, performance.now() + ms);
    if (!guardRAF) guardRAF = requestAnimationFrame(guardTick);
  }
  function guardTick(): void {
    if (guardY !== null && window.scrollY !== guardY) window.scrollTo(window.scrollX, guardY);
    if (performance.now() < guardUntil) guardRAF = requestAnimationFrame(guardTick);
    else {
      guardRAF = 0;
      if (guardY !== null && window.scrollY !== guardY) window.scrollTo(window.scrollX, guardY);
    }
  }

  function currentFrame(): DrawFrame | null {
    if (!frame) return null;
    const linear = Math.min(1, state.time / INK_PARAMS.duration);
    const ramp = Math.max(0, (linear - SPREAD.cleanupFrom) / (1 - SPREAD.cleanupFrom));
    const cleanup =
      Math.pow(ramp, SPREAD.cleanupPow) * frame.maxDist * SPREAD.cleanupReach +
      Math.max(0, (linear - 0.97) / 0.03) * frame.maxDist;
    return {
      from: frame.from,
      to: frame.to,
      center: frame.center,
      maxDist: frame.maxDist,
      seed: frame.seed,
      progress: state.progress,
      time: state.time,
      radius: state.progress * frame.maxDist * SPREAD.growth,
      cleanup,
    };
  }

  function draw(): void {
    const f = currentFrame();
    if (renderer && f) {
      /* A draw error must never orphan the canvas: if the renderer
         throws mid-flip, the rAF chain would die with the snapshot
         still composited over the page and no cleanup path left.
         Route any failure through the normal flip teardown instead. */
      try {
        renderer.draw(f);
      } catch (e) {
        cancelAnim();
      }
    }
  }

  function stopRafs(): void {
    if (rafId) cancelAnimationFrame(rafId);
    if (fadeRafId) cancelAnimationFrame(fadeRafId);
    rafId = 0;
    fadeRafId = 0;
  }

  function startSpread(): void {
    stopRafs();
    animStart = performance.now();
    function tick(now: number): void {
      const elapsed = (now - animStart) / 1000;
      const linear = Math.min(1, elapsed / INK_PARAMS.duration);
      state.progress = 1 - Math.pow(1 - linear, 4); /* GSAP power3.out */
      state.time = elapsed;
      draw();
      if (linear < 1) rafId = requestAnimationFrame(tick);
      else {
        rafId = 0;
        finish();
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function finish(): void {
    fadeStart = performance.now();
    canvas.style.opacity = '1';
    function tick(now: number): void {
      const t = Math.min(1, (now - fadeStart) / (FADE_OUT * 1000));
      canvas.style.opacity = String(1 - t);
      if (t < 1) fadeRafId = requestAnimationFrame(tick);
      else {
        fadeRafId = 0;
        hide();
      }
    }
    fadeRafId = requestAnimationFrame(tick);
  }

  function hide(): void {
    frame = null;
    unpinBleedScroll();
    guardExtend(600);
    canvas.classList.remove('is-active');
    canvas.style.opacity = '0';
    if (captureQueued) scheduleCapture(0);
  }

  function cancelAnim(): void {
    if (!frame) return;
    stopRafs();
    hide();
  }

  function crossFade(to: ThemeName): void {
    stopInk2D();
    guardStart();
    root.classList.add('theme-fade');
    root.style.setProperty('--theme-fade', CSS_FADE_S + 's');
    applyTheme(to);
    window.clearTimeout(cssFadeTimer);
    cssFadeTimer = window.setTimeout(function () {
      root.classList.remove('theme-fade');
      guardExtend(500);
      if (captureQueued) scheduleCapture(0);
    }, CSS_FADE_S * 1000 + 50);
  }

  /* ---------- 2D ink fallback ----------
     When the WebGL2 bleed cannot run (no WebGL2 at all, or snapshots
     could not be captured), the visitor still gets a visible ink
     transition instead of an instant swap: a ragged ink blob in the
     incoming theme's ground colour spreads from the toggle point on a
     plain 2D canvas, the theme flips beneath it at full cover, and the
     sheet dissolves. No snapshots, no WebGL, no network - it cannot
     silently degrade. */
  let ink2d: HTMLCanvasElement | null = null,
    ink2dRaf = 0,
    ink2dStartedAt = 0;
  /* Stop any running 2D ink sheet and hide it, so a new flip (of any
     kind) never stacks two overlays or leaves one behind. */
  function stopInk2D(): void {
    if (ink2dRaf) cancelAnimationFrame(ink2dRaf);
    ink2dRaf = 0;
    if (ink2d) ink2d.style.display = 'none';
  }
  /* Self-heal: outside an active flip, nothing the ink module owns
     may cover the page. If an interrupted fade, a lost context or a
     dropped animation ever left the WebGL canvas active or the 2D
     sheet displayed, the stale snapshot would sit over the live page
     as a doubled, offset copy of it. A background capture pass
     clears any such leftover instead of leaving it up. A live
     transition is never touched while it is inside its animation
     budget: a WebGL flip takes the spread plus the fade, the 2D
     sheet takes its spread plus its dissolve. Past that budget the
     transition is not live any more, its rAF chain is dead, and the
     heal force-completes it through the normal teardown instead of
     skipping it (the old heal skipped the canvas exactly while
     frame was set, and the sheet exactly while its rAF id was
     non-zero, which are precisely the stuck states). */
  function healStuckOverlays(): void {
    if (
      frame &&
      flipStartedAt &&
      performance.now() - flipStartedAt > (INK_PARAMS.duration + FADE_OUT) * 1000 + 2500
    ) {
      stopRafs();
      hide();
    }
    if (!frame && canvas.classList.contains('is-active')) {
      canvas.classList.remove('is-active');
      canvas.style.opacity = '0';
    }
    if (
      ink2d &&
      ink2d.style.display &&
      ink2d.style.display !== 'none' &&
      (!ink2dRaf || (ink2dStartedAt && performance.now() - ink2dStartedAt > 850 + 220 + 2000))
    ) {
      if (ink2dRaf) cancelAnimationFrame(ink2dRaf);
      ink2dRaf = 0;
      ink2d.style.display = 'none';
      ink2d.style.opacity = '1';
    }
  }
  function inkFallback2D(to: ThemeName, point?: { x: number; y: number }): void {
    if (ink2dRaf) cancelAnimationFrame(ink2dRaf);
    if (!ink2d) {
      ink2d = document.createElement('canvas');
      ink2d.setAttribute('aria-hidden', 'true');
      ink2d.setAttribute('data-html2canvas-ignore', '');
      ink2d.style.cssText =
        'position:fixed;inset:0;width:100%;height:100%;z-index:1000;pointer-events:none';
      document.body.appendChild(ink2d);
    }
    const sheet = ink2d;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = Math.max(1, Math.round(window.innerWidth * dpr));
    const H = Math.max(1, Math.round(window.innerHeight * dpr));
    sheet.width = W;
    sheet.height = H;
    sheet.style.opacity = '1';
    sheet.style.display = 'block';
    ink2dStartedAt = performance.now();
    const ctx = sheet.getContext('2d');
    if (!ctx) {
      applyTheme(to);
      sheet.style.display = 'none';
      return;
    }
    const c = point || toggleCenter();
    const box = sheet.getBoundingClientRect();
    const cx = (c.x - box.left) * dpr,
      cy = (c.y - box.top) * dpr;
    const maxR = farthestCorner(c) * dpr * 1.15;
    const DUR = 850,
      start = performance.now();
    let flipped = false;
    /* Ragged ink edge: fixed radius jitter around the ring, so the
       frontier reads as wet ink rather than a perfect circle. */
    const jit: number[] = [];
    for (let j = 0; j < 72; j++) jit.push(0.92 + Math.random() * 0.16);
    guardStart();
    (function step(now: number): void {
      const t = Math.min(1, (now - start) / DUR);
      const ease = 1 - Math.pow(1 - t, 3);
      const r = Math.max(0.1, ease * maxR);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = CAPTURE_BG[to];
      ctx.beginPath();
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2;
        const rr = r * jit[k % 72] * (1 + 0.03 * Math.sin(a * 5 + now / 140));
        const px = cx + Math.cos(a) * rr,
          py = cy + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      if (!flipped && t >= 0.55) {
        flipped = true;
        applyTheme(to);
      }
      if (t < 1) {
        ink2dRaf = requestAnimationFrame(step);
        return;
      }
      const f0 = performance.now();
      (function fade(now2: number): void {
        const ft = Math.min(1, (now2 - f0) / 220);
        sheet.style.opacity = String(1 - ft);
        if (ft < 1) {
          ink2dRaf = requestAnimationFrame(fade);
          return;
        }
        ink2dRaf = 0;
        sheet.style.display = 'none';
        guardExtend(400);
        if (renderer && !reducedMotion.matches) scheduleCapture(0);
      })(performance.now());
    })(performance.now());
  }

  function farthestCorner(p: { x: number; y: number }): number {
    /* Cover whichever is larger - the layout viewport or the phone's
       visual viewport - so the ink always reaches every corner of
       what the visitor actually sees. */
    const vv = window.visualViewport;
    const w = Math.max(document.documentElement.clientWidth, vv ? vv.width : 0);
    const h = Math.max(document.documentElement.clientHeight, vv ? vv.height : 0);
    return (
      Math.max(
        Math.hypot(p.x, p.y),
        Math.hypot(w - p.x, p.y),
        Math.hypot(p.x, h - p.y),
        Math.hypot(w - p.x, h - p.y),
      ) + 4
    );
  }

  function randomSeed(): Seed {
    return { x: Math.random() * 64 - 32, y: Math.random() * 64 - 32, angle: Math.random() * Math.PI * 2 };
  }

  function toggleCenter(): { x: number; y: number } {
    const r = btn!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function setTogglePending(on: boolean): void {
    btn!.classList.toggle('is-pending', !!on);
    if (on) btn!.setAttribute('aria-busy', 'true');
    else btn!.removeAttribute('aria-busy');
  }

  function toggle(point?: { x: number; y: number }): void {
    guardStart();
    stopInk2D();
    /* A leftover CSS cross-fade would keep the live page's colours in
       transition under the bleed, so the snapshot and the page would
       disagree for the whole spread. A real flip supersedes it. */
    if (root.classList.contains('theme-fade')) {
      root.classList.remove('theme-fade');
      window.clearTimeout(cssFadeTimer);
    }
    /* A flip that is already waiting on snapshots owns this tap:
       extra taps must not stack a second flip on top of it (the old
       fall-through cross-faded immediately, then the pending flip
       landed on top and flipped the theme straight back). */
    if (toggleBusy) {
      setTogglePending(true);
      return;
    }
    const to = otherTheme(getTheme());
    const scale = renderScale();
    const key = layoutKey(scale);
    const interrupting = frame !== null;

    /* A certified pair may bleed at ANY scroll position: both
       snapshots render the document in document coordinates and
       the shader re-anchors the sticky-header band, so a pair
       captured at load (or at any other depth) is pixel-true for
       a flip here. The old rule threw the pair away unless it had
       been captured at this exact scroll offset, then recaptured
       both themes pinned at the tap: that recapture is why the
       first flip of a visit stalled for seconds while every later
       flip was instant. Nothing is invalidated or recaptured
       here any more; a missing pair takes the bounded wait path
       below, as before. */
    const canAnimate =
      renderer !== null && !renderer.lost && !reducedMotion.matches && pairUsable(key);

    if (!canAnimate) {
      /* The cross-fade fallback is only for genuinely unsupported cases
         (no WebGL2, reduced motion, context lost, or a capture that
         truly failed). If the snapshots simply are not ready yet -
         first click, fresh view, layout just changed - capture them now
         and run the real bleed as soon as they land. */
      const unsupported = !renderer || renderer.lost || reducedMotion.matches || interrupting;
      if (!unsupported && !toggleBusy) {
        toggleBusy = true;
        setTogglePending(true);
        const startTheme = getTheme();
        let settled = false;
        /* The tap must always answer: if the snapshots are not ready
           within a short wait, run the 2D ink fallback rather than
           leaving the visitor staring at an unresponsive toggle
           (the old wait could run past 7 seconds on a phone). */
        const waitTimer = window.setTimeout(function () {
          if (settled) return;
          settled = true;
          toggleBusy = false;
          setTogglePending(false);
          if (getTheme() === startTheme) inkFallback2D(otherTheme(startTheme), point);
        }, 2800);
        ensureSnapshots().then(function (ok) {
          if (settled) return;
          settled = true;
          window.clearTimeout(waitTimer);
          toggleBusy = false;
          setTogglePending(false);
          /* If the theme already changed while waiting, this tap has
             been served - never flip a second time. */
          if (getTheme() !== startTheme) return;
          if (ok) toggle(point);
          else {
            cancelAnim();
            inkFallback2D(otherTheme(startTheme), point);
          }
        });
        return;
      }
      cancelAnim();
      setTogglePending(false);
      /* No WebGL2 at all: still a visible ink transition (2D blob),
         never a silent instant swap. Reduced motion and a lost context
         keep the gentle cross-fade. */
      if (!renderer && !reducedMotion.matches) inkFallback2D(to, point);
      else crossFade(to);
      if (renderer && !reducedMotion.matches) scheduleCapture(0);
      return;
    }

    let from: string = getTheme();
    if (interrupting) {
      stopRafs();
      renderer.resize(scale);
      const frozen = currentFrame();
      from = frozen && renderer.freeze(frozen) ? 'composite' : getTheme();
    }

    renderer.resize(scale);
    /* Click points and the toggle's rect are visual-viewport coords;
       the shader works in canvas-box coords. On phones the two origins
       differ by the same visual-viewport offset resize() just measured
       - convert, so the ink starts exactly under the visitor's finger
       and stays registered with the page for the whole spread. */
    const rawCenter = point || toggleCenter();
    const center = { x: rawCenter.x - renderer.rectLeft, y: rawCenter.y - renderer.rectTop };
    const maxDist = farthestCorner(center);
    frame = { from, to, center, maxDist, seed: randomSeed() };
    flipStartedAt = performance.now();
    state.progress = 0;
    state.time = 0;

    setTogglePending(false);
    draw();
    canvas.style.opacity = '1';
    canvas.classList.add('is-active');
    /* Handoff parity: the snapshot shows every reveal at its final
       state, so complete any reveal inside the viewport on the live
       page first - when the ink fades, nothing in view can shift,
       appear or vanish. */
    const rvs = document.querySelectorAll(
      '.reveal:not(.in),.reveal-zoom:not(.in),.reveal-look:not(.in),.reveal-pop:not(.in)',
    );
    for (let ri = 0; ri < rvs.length; ri++) {
      const rr = rvs[ri].getBoundingClientRect();
      if (rr.bottom > 0 && rr.top < window.innerHeight && rr.right > 0 && rr.left < window.innerWidth)
        rvs[ri].classList.add('in');
    }
    applyTheme(to);
    pinBleedScroll();
    startSpread();
  }

  function visibleViewHeight(): number {
    const v = visibleViewEl();
    return v ? v.scrollHeight : 0;
  }
  /* A pair may bleed when both textures match the current layout
     key and the visible view still has (nearly) the height it had
     when the pair was certified. The tolerance absorbs rounding
     and small in-view shifts; a rebuilt view drifts far past it
     and recaptures instead. Scroll position is not consulted: the
     pair is true at every scroll position by construction. */
  function pairUsable(key: string): boolean {
    if (!renderer || renderer.lost) return false;
    const cur = getTheme();
    if (!renderer.hasValid(cur, key) || !renderer.hasValid(otherTheme(cur), key)) return false;
    if (pairViewHeight && Math.abs(visibleViewHeight() - pairViewHeight) > 24) return false;
    return true;
  }

  /* One snapshot capture, hard-capped. html2canvas renders the whole
     document on the main thread; on a phone a capture that stalls
     (huge layout, a wedged image, a hung loader) must never be
     allowed to stall the theme with it - after the cap the capture
     counts as failed and the flip falls back instead of waiting. */
  function captureWithTimeout(theme: ThemeName, scale: number, maxTex: number): Promise<Snapshot> {
    return Promise.race([
      capturePage(theme, scale, maxTex),
      new Promise<Snapshot>(function (_, reject) {
        window.setTimeout(function () {
          reject(new Error('snapshot capture timed out'));
        }, 7000);
      }),
    ]);
  }

  /* ---------- Capture scheduling ---------- */
  /* A background capture renders the whole document twice on the
     main thread, so one that starts while the visitor is scrolling
     reads as a hard scroll freeze on a phone. Worse, the old
     background path also pinned the scroll for the whole render:
     the visitor would pause, the capture would start and pin, and
     their next scroll attempt fought the pin and froze. Background
     captures therefore never pin, and they only run while the page
     is visible and the scroll has been idle for a moment (the stamp
     starts at module init, so the first capture after load waits
     for the same idle window instead of firing during the
     visitor's first scroll). A running background capture is
     abandoned only when a fresh interaction lands or the tab
     hides; scrolling alone no longer invalidates its results,
     because the snapshots are true at any scroll position. A
     theme flip never waits on any
     of this: it captures on demand through ensureSnapshots, which
     calls captureAll(true) directly, and only that path may pin. */
  let lastScrollStamp = performance.now();
  let scrollGen = 0;
  /* Taps compete with captures too: a capture that starts right after
     a tap, or keeps rendering through one, makes that tap feel dead.
     The stamp defers new background captures for the same idle window
     scrolling already uses; the generation lets a running background
     capture abandon its results at the next step boundary when an
     interaction lands (an in-flight html2canvas render itself cannot
     be cancelled, but it is never followed by the second render, and
     its output is discarded). Flip captures ignore both: they are the
     interaction, and they take priority. */
  let lastInteractionStamp = 0;
  let interactionGen = 0;
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (type) {
    window.addEventListener(
      type,
      function () {
        lastInteractionStamp = performance.now();
        interactionGen++;
      },
      { passive: true, capture: true },
    );
  });
  /* A finger currently on the glass is a hard gate on top of the
     stamps: a capture that starts mid-touch renders through the
     visitor's gesture, and a pointer held still (reading a rail,
     holding a press) produces no scroll or tap events to defer
     on, so the stamps alone would let a round start under it. */
  let touchingNow = false;
  window.addEventListener(
    'pointerdown',
    function () {
      touchingNow = true;
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    'touchstart',
    function () {
      touchingNow = true;
    },
    { passive: true, capture: true },
  );
  ['pointerup', 'pointercancel', 'touchend', 'touchcancel'].forEach(function (type) {
    window.addEventListener(
      type,
      function () {
        touchingNow = false;
      },
      { passive: true, capture: true },
    );
  });
  window.addEventListener(
    'scroll',
    function () {
      lastScrollStamp = performance.now();
      scrollGen++;
    },
    { passive: true },
  );
  function scheduleCapture(delay: number): void {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      /* A new layout key is a real trigger (view change, width
         change, shop state change): it refills the attempt budget
         and lifts a block. Without one, a layout whose budget is
         spent stays quiet instead of re-rendering forever, and a
         backoff already in force is honoured rather than bypassed
         by an early reschedule. */
      const k = layoutKey(renderScale());
      if (k !== lastCaptureKey) {
        lastCaptureKey = k;
        captureFailStreak = 0;
        captureBlockedKey = '';
        captureNotBefore = 0;
      }
      if (captureBlockedKey && captureBlockedKey === k) return;
      const now = performance.now();
      if (now < captureNotBefore) {
        scheduleCapture(captureNotBefore - now);
        return;
      }
      if (
        document.hidden ||
        touchingNow ||
        now - lastScrollStamp < 1200 ||
        now - lastInteractionStamp < 1200
      ) {
        scheduleCapture(RESIZE_DEBOUNCE_MS);
        return;
      }
      healStuckOverlays();
      captureAll(false);
    }, delay);
  }

  function captureAll(forFlip: boolean): Promise<void> | undefined {
    healStuckOverlays();
    if (!renderer || renderer.lost || reducedMotion.matches) return;
    if (capturing || frame || root.classList.contains('theme-fade')) {
      captureQueued = true;
      return;
    }
    const scale = renderScale();
    const key = layoutKey(scale);
    const current = getTheme();
    let themes = [current, otherTheme(current)].filter(function (t) {
      return !renderer.hasValid(t, key);
    });
    /* If one half is missing, re-capture BOTH so the pair shares
       one session and one layout. A pair that is merely stale
       (document height drifted under it) or whose view was
       rebuilt at a very different height is refreshed the same
       way here, in the background, without ever blocking a flip
       on the refresh. */
    if (themes.length === 1) themes = [current, otherTheme(current)];
    if (
      !themes.length &&
      (pairStale || (pairViewHeight && Math.abs(visibleViewHeight() - pairViewHeight) > 24))
    ) {
      themes = [current, otherTheme(current)];
    }
    captureQueued = false;
    if (!themes.length) return;

    const gen = ++captureGen;
    capturing = true;
    /* A background round gives up only for reasons that would
       make its results wrong or its cost land on a gesture: a
       fresh interaction (checked between renders), or the tab
       hiding mid-round. Scrolling no longer aborts a round: the
       snapshots are document-true at any scroll position now, so
       a round that started in an idle window runs to completion
       and certifies a pair the next flip can use instantly. The
       old scroll abort discarded nearly every round a reading
       visitor ever triggered, and each retry paid another full
       render on the main thread, which is what made scrolling
       feel sticky across every page and section. Flip captures
       ignore all of this: they pin, so nothing can move while
       they render. */
    const startInteractionGen = interactionGen;
    const startFailStreak = captureFailStreak;
    let aborted = false;
    function interrupted(): boolean {
      return !forFlip && (aborted || interactionGen !== startInteractionGen || document.hidden);
    }
    /* Watchdog: whatever happens below, the capture state MUST clear.
       A capture that never finishes would otherwise leave `capturing`
       set, the scroll pin attached and the ink-capturing class on the
       root forever - the page could no longer scroll and no theme
       flip could ever capture again. */
    const watchdog = window.setTimeout(function () {
      if (gen === captureGen && capturing) {
        captureGen++;
        done();
      }
    }, 20000);
    /* Scroll pin, flip captures only: html2canvas is known to shove
       the live page's scroll position while it renders its clone
       (the "page jumps" defect), so a capture taken for a flip
       holds the scroll exactly where the visitor flipped and
       restores it at the end. A background capture must NEVER do
       this: pinning behind the visitor's back is what froze their
       scroll. It renders at whatever position the page sits at,
       and the generation checks below throw its results away if
       that position changes mid-render. */
    const pinX = window.scrollX,
      pinY = window.scrollY;
    root.classList.add('ink-capturing');
    let pinScroll: (() => void) | null = null;
    if (forFlip) {
      pinScroll = function (): void {
        if (window.scrollX !== pinX || window.scrollY !== pinY) window.scrollTo(pinX, pinY);
      };
      window.addEventListener('scroll', pinScroll, { passive: true });
    }
    let chain: Promise<void> = Promise.resolve();
    themes.forEach(function (theme) {
      chain = chain.then(function () {
        if (gen !== captureGen) return;
        if (interrupted()) {
          aborted = true;
          captureQueued = true;
          return;
        }
        return captureWithTimeout(theme, scale, renderer.maxTextureSize).then(
          function (snap) {
            if (gen !== captureGen) return;
            if (interrupted()) {
              aborted = true;
              captureQueued = true;
              return;
            }
            if (snap.key !== layoutKey(renderScale())) {
              captureQueued = true;
              return;
            }
            renderer.upload(snap);
          },
          function (err) {
            /* Keep the other theme's capture going; queue a retry so the
               bleed becomes available instead of staying on the fallback.
               Repeated failures back off (captureFailStreak) so an
               unreachable CDN is not hammered forever - a toggle click
               still forces a fresh attempt via ensureSnapshots. */
            if (window.console) console.warn('[ink] capture failed for ' + theme, err);
            captureFailStreak++;
            captureQueued = true;
          },
        );
      });
    });
    let doneCalled = false;
    function done(): void {
      if (doneCalled) return;
      doneCalled = true;
      window.clearTimeout(watchdog);
      capturing = false;
      if (pinScroll) {
        window.removeEventListener('scroll', pinScroll);
        if (window.scrollX !== pinX || window.scrollY !== pinY) window.scrollTo(pinX, pinY);
      }
      root.classList.remove('ink-capturing');
      /* Both themes on the GPU from this one session: certify the
         pair for this layout at any scroll position, remember the
         heights it was taken at, clear the stale flag and refill
         the attempt budget. */
      if (
        !aborted &&
        renderer!.hasValid(current, key) &&
        renderer!.hasValid(otherTheme(current), key)
      ) {
        pairViewHeight = visibleViewHeight();
        pairDocHeight = documentSize().height;
        pairStale = false;
        captureFailStreak = 0;
        captureNotBefore = 0;
      } else if (!forFlip && captureFailStreak === startFailStreak) {
        /* A round that ended without a pair and without a single
           failed render (its results were discarded, or it was
           interrupted between renders) still spends from the
           budget: aborts count exactly like failures now, so the
           retry loop below is always bounded. */
        captureFailStreak++;
      }
      if (captureQueued) {
        if (captureFailStreak >= 4) {
          /* Budget spent for this layout: stay quiet until a real
             trigger (a new layout key) refills it. An existing
             pair stays fully usable for flips meanwhile. */
          captureBlockedKey = key;
          captureQueued = false;
        } else if (captureFailStreak > 0) {
          /* Progressive backoff between rounds: 2s, then 4s,
             then 8s (the idle gates apply on top when it fires). */
          captureNotBefore = performance.now() + Math.min(15000, 1000 * Math.pow(2, captureFailStreak));
          scheduleCapture(captureNotBefore - performance.now());
        } else {
          scheduleCapture(RESIZE_DEBOUNCE_MS);
        }
      }
    }
    return chain.then(done, done);
  }

  /* Resolves true once BOTH theme snapshots for the current layout are on
     the GPU, capturing (and waiting out any in-flight capture) as needed. */
  function ensureSnapshots(): Promise<boolean> {
    return new Promise<boolean>(function (resolve) {
      let tries = 0;
      (function check(): void {
        if (!renderer || renderer.lost) return resolve(false);
        const key = layoutKey(renderScale());
        if (pairUsable(key)) return resolve(true);
        if (!capturing && !frame && !root.classList.contains('theme-fade')) captureAll(true);
        if (++tries > 50) return resolve(false); /* ~7.5s worst case */
        window.setTimeout(check, 150);
      })();
    });
  }

  /* ---------- Init ---------- */
  syncBtn();
  /* The heal normally rides along with captures, but a stuck overlay
     must clear within a bounded time even if no capture ever runs:
     poll it cheaply, and re-check whenever the tab becomes visible. */
  window.setInterval(healStuckOverlays, 1500);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) healStuckOverlays();
  });
  root.dataset.ink = renderer ? 'webgl' : 'css';
  canvas.style.opacity = '0';
  if (renderer) {
    renderer.resize(renderScale());
    renderer.watchContext(
      function () {
        cancelAnim();
      },
      function () {
        scheduleCapture(0);
      },
    );
    window.addEventListener('resize', function () {
      renderer.resize(renderScale());
      if (frame) draw();
      scheduleCapture(RESIZE_DEBOUNCE_MS);
    });
    /* Phones report URL-bar show/hide and webview chrome changes on
       the visual viewport, sometimes without a window resize: keep
       the canvas origin (the snapshot alignment) current either way. */
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () {
        renderer.resize(renderScale());
        if (frame) draw();
        scheduleCapture(RESIZE_DEBOUNCE_MS);
      });
    }
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        /* Whole-document height drift (a footer accordion opening,
           late-loading media) does not invalidate the pair: it only
           marks it stale, so an idle background refresh follows and
           flips keep using the pair in the meantime. */
        if (pairDocHeight && Math.abs(documentSize().height - pairDocHeight) > 4) pairStale = true;
        scheduleCapture(RESIZE_DEBOUNCE_MS);
      }).observe(document.body);
    }
    /* The bag count lives in the snapshot's header band: when it
       changes, mark the pair stale for the same idle refresh
       instead of letting flips recapture over a badge. */
    const bagCountEl = document.getElementById('bagCount');
    if (bagCountEl && window.MutationObserver) {
      new MutationObserver(function () {
        pairStale = true;
        scheduleCapture(RESIZE_DEBOUNCE_MS);
      }).observe(bagCountEl, { childList: true, characterData: true, attributes: true });
    }
    if (reducedMotion.addEventListener) {
      reducedMotion.addEventListener('change', function () {
        scheduleCapture(0);
      });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        scheduleCapture(0);
      });
    }
    /* Late-loading images/fonts settle the layout after first paint;
       re-capture on full load so both snapshots match the final layout.
       The first capture waits for load + idle: a full-document capture
       during first paint was a real source of early jank on phones,
       and a toggle click can always capture on demand instead. */
    window.addEventListener('load', function () {
      const ric = (
        window as unknown as {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback;
      if (ric)
        ric(
          function () {
            scheduleCapture(0);
          },
          { timeout: 2500 },
        );
      else scheduleCapture(600);
    });
  }
  btn.addEventListener(
    'pointerdown',
    function () {
      setTogglePending(true);
      /* A press that never becomes a click (finger slid off, gesture
         taken over) must not leave the pending state stuck. */
      window.setTimeout(function () {
        if (!toggleBusy) setTogglePending(false);
      }, 4000);
    },
    { passive: true },
  );
  ['pointerup', 'pointercancel'].forEach(function (type) {
    btn!.addEventListener(type, function () {
      if (!toggleBusy) setTogglePending(false);
    });
  });
  btn.addEventListener('click', function (e) {
    /* detail === 0 means a keyboard-activated click: spread from the button. */
    toggle(e.detail === 0 ? undefined : { x: e.clientX, y: e.clientY });
  });
}
