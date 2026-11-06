// Runtime recolouring of a Lottie animation (the Talk button: red normally, green while help is coming).
// Works on a deep clone; the JSON file is never edited. Every fill / stroke / gradient colour that has a
// hue is moved to the target hue + saturation, keeping its own lightness and alpha, so the designer's
// light and dark shades survive. Greys, black and white are left alone.

type Rgb = [number, number, number]; // 0–1, Lottie's colour format

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`bad colour ${hex}`);
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

const MIN_SATURATION = 0.15; // below this a colour counts as grey/white/black and is kept

/** Move one colour to the target hue/saturation, keeping its lightness. */
export function shiftColor(c: Rgb, target: Rgb): Rgb {
  const [, s, l] = rgbToHsl(c);
  if (s < MIN_SATURATION) return c;
  const [th, ts, tl] = rgbToHsl(target);
  // Keep the original's shading relative to its own lightness, centred on the target's lightness.
  const lightness = Math.min(0.95, Math.max(0.05, tl + (l - 0.5) * 0.6));
  return hslToRgb(th, ts, lightness);
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** [r,g,b] or [r,g,b,a] with 0–1 components. */
function isColorArray(v: unknown): v is number[] {
  return Array.isArray(v) && (v.length === 3 || v.length === 4) && v.every((n) => isNum(n) && n >= 0 && n <= 1);
}

function recolorArray(arr: number[], target: Rgb): number[] {
  const [r, g, b] = shiftColor([arr[0], arr[1], arr[2]], target);
  return arr.length === 4 ? [r, g, b, arr[3]] : [r, g, b];
}

/** Animated or static property: { a: 0, k: [r,g,b,a] } or { a: 1, k: [{ s: [...], e: [...] }, ...] }. */
function recolorProp(prop: Record<string, unknown>, target: Rgb) {
  const k = prop.k;
  if (isColorArray(k)) prop.k = recolorArray(k, target);
  else if (Array.isArray(k)) {
    for (const kf of k) {
      if (kf && typeof kf === "object") {
        const f = kf as Record<string, unknown>;
        if (isColorArray(f.s)) f.s = recolorArray(f.s, target);
        if (isColorArray(f.e)) f.e = recolorArray(f.e, target);
      }
    }
  }
}

/** Gradient stops: flat [offset, r, g, b, offset, r, g, b, …(, offset, alpha …)]; `p` = number of colour stops. */
function recolorGradient(g: Record<string, unknown>, target: Rgb) {
  const p = isNum(g.p) ? g.p : 0;
  const k = g.k as Record<string, unknown> | undefined;
  if (!p || !k) return;
  const fix = (arr: unknown) => {
    if (!Array.isArray(arr)) return arr;
    const out = arr.slice();
    for (let i = 0; i < p; i++) {
      const j = i * 4;
      if ([1, 2, 3].every((o) => isNum(out[j + o]))) {
        const [r, gg, b] = shiftColor([out[j + 1], out[j + 2], out[j + 3]], target);
        out[j + 1] = r;
        out[j + 2] = gg;
        out[j + 3] = b;
      }
    }
    return out;
  };
  if (Array.isArray(k.k) && k.k.every(isNum)) k.k = fix(k.k);
  else if (Array.isArray(k.k)) {
    for (const kf of k.k as Record<string, unknown>[]) {
      if (kf && typeof kf === "object") {
        kf.s = fix(kf.s);
        if (kf.e) kf.e = fix(kf.e);
      }
    }
  }
}

/** Deep-clone `animation` and recolour every fill (fl), stroke (st) and gradient (gf/gs) to `hex`. */
export function recolorLottie<T>(animation: T, hex: string): T {
  const target = hexToRgb(hex);
  const clone = structuredClone(animation);
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if ((o.ty === "fl" || o.ty === "st") && o.c && typeof o.c === "object") recolorProp(o.c as Record<string, unknown>, target);
    if ((o.ty === "gf" || o.ty === "gs") && o.g && typeof o.g === "object") recolorGradient(o.g as Record<string, unknown>, target);
    // Solid layers carry their colour as a hex string.
    if (o.ty === 1 && typeof o.sc === "string" && /^#[0-9a-f]{6}$/i.test(o.sc)) {
      const [r, g, b] = shiftColor(hexToRgb(o.sc), target);
      o.sc = "#" + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  walk(clone);
  return clone;
}
