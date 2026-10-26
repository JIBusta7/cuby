/**
 * Paleta de 4 colores a partir de una imagen (la tapa del disco de Spotify).
 *
 *  1. Agrupa los píxeles en 8 colores con k-means (inicio determinista).
 *  2. Prefiere los grupos grandes y vivos (saturación y brillo).
 *  3. Elige 4 bien distintos entre sí (distancia OKLab).
 *  4. Los adapta a LEDs: brillo al máximo y saturación mínima, porque un LED
 *     con un color apagado o gris se ve sucio. Los casi grises pasan a un
 *     blanco cálido.
 */
import { DEFAULT_PALETTE, type Palette } from '../leds/effects';
import { deltaEOk } from './oklab';
import type { RGB } from './types';

type Vec = [number, number, number];

function rgbToHsv([r, g, b]: Vec): Vec {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

function hsvToRgb([h, s, v]: Vec): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Lleva un color a algo que luzca en un LED. */
export function ledify(c: RGB): RGB {
  const [h, s] = rgbToHsv([c[0], c[1], c[2]]);
  if (s < 0.12) return [255, 220, 170]; // gris → blanco cálido
  return hsvToRgb([h, Math.max(0.6, Math.min(1, s * 1.25)), 1]);
}

export function extractPalette(rgba: ArrayLike<number>, k = 8): Palette {
  const px: Vec[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 255) < 128) continue;
    px.push([rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
  }
  if (px.length < k) return DEFAULT_PALETTE;

  // Inicio determinista: píxeles repartidos a lo largo del orden por luminancia.
  const byLum = [...px].sort((a, b) => a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11 - (b[0] * 0.3 + b[1] * 0.59 + b[2] * 0.11));
  let centers: Vec[] = Array.from({ length: k }, (_, i) => [...byLum[Math.floor(((i + 0.5) * byLum.length) / k)]!] as Vec);
  let counts = new Array<number>(k).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    const sums = centers.map(() => [0, 0, 0] as Vec);
    counts = new Array<number>(k).fill(0);
    for (const p of px) {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      const s = sums[best]!;
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      counts[best]!++;
    }
    centers = centers.map((c, j) => (counts[j]! > 0 ? (sums[j]!.map((v) => v / counts[j]!) as Vec) : c));
  }

  const scored = centers
    .map((c, j) => {
      const [, s, v] = rgbToHsv(c);
      return { c: [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])] as RGB, score: Math.pow(counts[j]!, 0.6) * (0.25 + s) * (0.35 + v) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked: RGB[] = [];
  for (const { c } of scored) {
    const led = ledify(c);
    if (picked.every((p) => deltaEOk(p, led) > 0.12)) picked.push(led);
    if (picked.length === 4) break;
  }
  // Pocos colores distintos (tapa casi monocromática): variaciones de tono del principal.
  const base = picked[0] ?? DEFAULT_PALETTE[0];
  const [h] = rgbToHsv([base[0], base[1], base[2]]);
  for (const shift of [35, -35, 180, 90]) {
    if (picked.length >= 4) break;
    picked.push(hsvToRgb([(h + shift + 360) % 360, 0.85, 1]));
  }
  return [picked[0]!, picked[1]!, picked[2]!, picked[3]!];
}
