// Run: npx tsx --test src/app/band/_lib/lottieColor.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hexToRgb, recolorLottie, shiftColor } from "./lottieColor";

const BLUE: [number, number, number, number] = [0.2, 0.4, 0.9, 1];
const anim = {
  v: "5.7.0",
  layers: [
    {
      ty: 4,
      shapes: [
        {
          ty: "gr",
          it: [
            { ty: "fl", c: { a: 0, k: BLUE }, o: { a: 0, k: 100 } },
            { ty: "st", c: { a: 1, k: [{ t: 0, s: [0.1, 0.8, 0.3, 1], e: [0.9, 0.9, 0.1, 1] }, { t: 30 }] }, w: { a: 0, k: 4 } },
            { ty: "fl", c: { a: 0, k: [1, 1, 1, 1] } }, // white highlight stays white
          ],
        },
        { ty: "gf", g: { p: 2, k: { a: 0, k: [0, 0.2, 0.4, 0.9, 1, 0.1, 0.2, 0.5] } } },
      ],
    },
    { ty: 1, sc: "#3366ee" },
  ],
};

const hue = (c: number[]) => {
  const [r, g, b] = c;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return null;
  const d = max - min;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h / 6) * 360;
};
const isRed = (c: number[]) => { const h = hue(c); return h != null && (h < 15 || h > 345); };
const isGreen = (c: number[]) => { const h = hue(c); return h != null && h > 100 && h < 160; };

test("recolours fills, animated strokes, gradients and solid layers to red; keeps white and alpha", () => {
  const red = recolorLottie(anim, "#dc2626");
  const it = red.layers[0].shapes![0].it!;
  assert.ok(isRed(it[0].c!.k as number[]), "fill");
  assert.equal((it[0].c!.k as number[])[3], 1, "alpha kept");
  const kf = (it[1].c!.k as { s?: number[]; e?: number[] }[])[0];
  assert.ok(isRed(kf.s!) && isRed(kf.e!), "stroke keyframes");
  assert.deepEqual(it[2].c!.k, [1, 1, 1, 1], "white untouched");
  const g = red.layers[0].shapes![1].g!.k.k as number[];
  assert.ok(isRed(g.slice(1, 4)) && isRed(g.slice(5, 8)), "gradient stops");
  assert.equal(g[0], 0);
  assert.equal(g[4], 1, "gradient offsets kept");
  assert.ok(isRed(hexToRgb(red.layers[1].sc!)), "solid layer");
});

test("green target gives green; the original object is not modified", () => {
  const before = JSON.stringify(anim);
  const green = recolorLottie(anim, "#16a34a");
  assert.ok(isGreen(green.layers[0].shapes![0].it![0].c!.k as number[]));
  assert.equal(JSON.stringify(anim), before);
});

test("shading survives: a darker source stays darker after recolouring", () => {
  const target = hexToRgb("#dc2626");
  const light = shiftColor([0.6, 0.7, 1], target);
  const dark = shiftColor([0.05, 0.1, 0.4], target);
  assert.ok(light[0] > dark[0]);
});
