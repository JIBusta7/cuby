/**
 * Efectos del modo LUCES. Mismo código que el firmware (anim.cpp), con
 * aritmética entera para que el cubo 3D y el cubo físico coincidan exacto
 * (lo verifica `npm run parity`).
 *
 * Cada efecto es una función pura (cara, x, y, tiempo, parámetros) → color.
 * Los efectos de audio usan las 7 bandas y los beats que manda la web.
 */
import { hsv2rgbRainbow } from '../color/colorMap';
import type { RGB } from '../color/types';
import { hash4 } from './hash';

export const DEMO_EFFECTS = [
  'RAINBOW', 'PLASMA', 'FIRE', 'TWINKLE', 'BREATHE', 'RIPPLE', 'SPIRAL', 'RAIN', 'CHASE', 'PARTY', 'GRAVITY',
] as const;
export const AUDIO_EFFECTS = ['SPECTRUM', 'PULSE', 'RINGS', 'KICK', 'BURST'] as const;
export const SHOW_EFFECTS = [...DEMO_EFFECTS, ...AUDIO_EFFECTS] as const;
export type ShowEffect = (typeof SHOW_EFFECTS)[number];

export function isShowEffect(v: unknown): v is ShowEffect {
  return typeof v === 'string' && (SHOW_EFFECTS as readonly string[]).includes(v);
}

export type Palette = readonly [RGB, RGB, RGB, RGB];

/** Paleta por defecto (identidad CUBY, en valores que lucen en LEDs). */
export const DEFAULT_PALETTE: Palette = [
  [110, 60, 255],
  [255, 60, 40],
  [255, 170, 0],
  [0, 220, 90],
];

export const BAND_COUNT = 7;

export interface ShowParams {
  readonly palette: Palette;
  /** 7 bandas de frecuencia 0–255 (graves → agudos). */
  readonly bands: readonly number[];
  /** ms desde el último beat (muy grande si no hubo). */
  readonly beatAge: number;
  readonly beatCount: number;
  /** Cuánto mira hacia arriba cada cara: producto escalar × 255 (−255…255). */
  readonly faceUp: readonly number[];
}

// ---- Aritmética de 8 bits (idéntica a lib8tion de FastLED) ----
const M16 = [0, 49, 49, 41, 90, 27, 117, 10];

/** sin8 de FastLED: seno aproximado, 0–255 → 0–255 (128 = cero). */
export function sin8(theta: number): number {
  theta &= 0xff;
  let offset = theta;
  if (theta & 0x40) offset = 255 - offset;
  offset &= 0x3f;
  let secoffset = offset & 0x0f;
  if (theta & 0x40) secoffset++;
  const section = offset >> 4;
  const b = M16[section * 2]!;
  const m16 = M16[section * 2 + 1]!;
  const mx = (m16 * secoffset) >> 4;
  let y = mx + b;
  if (theta & 0x80) y = -y;
  return (y + 128) & 0xff;
}

export const scale8 = (i: number, s: number): number => ((i * (1 + s)) >> 8) & 0xff;
const scaleRGB = ([r, g, b]: RGB, v: number): RGB => [scale8(r, v), scale8(g, v), scale8(b, v)];

/** Color de la paleta en la posición i (0–255), interpolando entre los 4 colores (cíclico). */
export function palAt(p: Palette, i: number): RGB {
  i &= 0xff;
  const seg = i >> 6;
  const f = (i & 63) << 2;
  const a = p[seg]!;
  const b = p[(seg + 1) & 3]!;
  return [a[0] + (((b[0] - a[0]) * f) >> 8), a[1] + (((b[1] - a[1]) * f) >> 8), a[2] + (((b[2] - a[2]) * f) >> 8)];
}

function heat(h: number): RGB {
  if (h < 85) return [h * 3, 0, 0];
  if (h < 170) return [255, (h - 85) * 3, 0];
  return [255, 255, Math.min(255, (h - 170) * 3)];
}

/** Ángulo (0–255) de cada LED alrededor del centro de la cara. Tabla fija, igual en el firmware. */
export const ANGLE: readonly (readonly number[])[] = [
  [160, 168, 179, 192, 205, 216, 224],
  [152, 160, 173, 192, 211, 224, 232],
  [141, 147, 160, 192, 224, 237, 243],
  [128, 128, 128, 0, 0, 0, 0],
  [115, 109, 96, 64, 32, 19, 13],
  [104, 96, 83, 64, 45, 32, 24],
  [96, 88, 77, 64, 51, 40, 32]
];

const div = (a: number, b: number): number => Math.floor(a / b);

/**
 * Color del LED (x, y) de la cara `face` para el efecto `e`, `t` ms después de empezar.
 *
 * Efectos de audio: cada bombo (beat) avanza un color entero de la paleta
 * (beatCount × 64), así el cambio de color cae justo en el golpe; el brillo
 * sigue a los graves (la mayor de las dos bandas más bajas).
 */
export function showPixel(e: ShowEffect, t: number, face: number, x: number, y: number, p: ShowParams): RGB {
  const pal = p.palette;
  const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
  const bass = Math.max(p.bands[0]!, p.bands[1]!);
  const beatHue = (p.beatCount * 64) & 0xff;
  switch (e) {
    case 'RAINBOW':
      return hsv2rgbRainbow((div(t, 16) + (x + y) * 10 + face * 43) & 0xff, 240, 255);
    case 'PLASMA': {
      const a = sin8((x * 24 + div(t, 6)) & 0xff);
      const b = sin8((y * 32 + div(t, 9) + face * 40) & 0xff);
      const c = sin8(((x + y) * 16 + div(t, 13)) & 0xff);
      return palAt(pal, (div(a + b + c, 3) + div(t, 40)) & 0xff);
    }
    case 'FIRE': {
      const base = 255 - (6 - y) * 38;
      const h = Math.max(0, base - (hash4(face, x, y, div(t, 70)) & 95));
      return heat(h);
    }
    case 'TWINKLE': {
      const base = scaleRGB(palAt(pal, face * 64 + x * 4), 18);
      const off = hash4(face, x, y, 1) % 900;
      const slot = div(t + off, 900);
      const r = hash4(face, x, y, slot + 7);
      if (r % 6 !== 0) return base;
      const ph = (t + off) % 900;
      const v = ph < 450 ? div(ph * 255, 450) : div((900 - ph) * 255, 450);
      return v > 18 ? scaleRGB(palAt(pal, (r >>> 8) & 0xff), v) : base;
    }
    case 'BREATHE': {
      const v = sin8(div(t, 10) & 0xff);
      return scaleRGB(palAt(pal, (div(t, 60) + face * 8) & 0xff), 40 + ((v * 215) >> 8));
    }
    case 'RIPPLE': {
      const phase = (div(t, 5) - d * 48 + face * 24) & 0xff;
      return scaleRGB(palAt(pal, phase), sin8(phase));
    }
    case 'SPIRAL': {
      const hue = (ANGLE[y]![x]! + div(t, 8) + d * 20 + face * 40) & 0xff;
      return scaleRGB(palAt(pal, hue), 255 - d * 30);
    }
    case 'RAIN': {
      const speed = 50 + (hash4(face, x, 9, 3) % 4) * 25;
      const off = hash4(face, x, 7, 5) % 11;
      const head = (div(t, speed) + off) % 11;
      const dist = head - y;
      const v = dist === 0 ? 255 : dist === 1 ? 120 : dist === 2 ? 45 : 0;
      return v ? scaleRGB(palAt(pal, face * 40 + x * 12), v) : [0, 0, 0];
    }
    case 'CHASE': {
      const idx = y * 7 + (y & 1 ? 6 - x : x);
      const pos = (div(t, 30) + face * 8) % 49;
      const dist = (pos - idx + 49) % 49;
      const v = dist < 8 ? 255 - dist * 32 : 0;
      return v ? scaleRGB(palAt(pal, (face * 40 + div(t, 40)) & 0xff), v) : [0, 0, 0];
    }
    case 'PARTY': {
      const r = hash4(face, 0, 0, div(t, 220));
      const c = palAt(pal, (r >>> 8) & 0xff);
      if (r % 3 !== 0) return scaleRGB(c, 14);
      return hash4(face, x, y, div(t, 60)) % 11 === 0 ? [255, 255, 255] : c;
    }
    case 'GRAVITY': {
      const u = (p.faceUp[face]! + 255) >> 1;
      const v = 170 + ((sin8((x * 20 + y * 20 + div(t, 6)) & 0xff) * 85) >> 8);
      return scaleRGB(palAt(pal, u), v);
    }
    case 'SPECTRUM': {
      const height = (p.bands[x]! * 8) >> 8;
      const row = 6 - y;
      if (row < height) {
        if (p.beatAge < 100 && row === height - 1) return [255, 255, 255];
        return palAt(pal, (beatHue + row * 24 + face * 4) & 0xff);
      }
      // El fondo brilla con los graves, en el color opuesto de la paleta.
      return scaleRGB(palAt(pal, (beatHue + 128) & 0xff), (bass >> 3) + 6);
    }
    case 'PULSE': {
      const flash = p.beatAge < 300 ? 255 - div(p.beatAge * 255, 300) : 0;
      const v = Math.max(bass, flash, 28);
      return scaleRGB(palAt(pal, (beatHue + face * 8) & 0xff), v);
    }
    case 'RINGS': {
      const r = div(p.beatAge, 70);
      if (p.beatAge < 350 && d === r) return scaleRGB(palAt(pal, beatHue), 255 - r * 45);
      return scaleRGB(palAt(pal, (beatHue + 128 + face * 16) & 0xff), (bass >> 2) + 8);
    }
    case 'KICK': {
      // Todo el cubo salta al color siguiente en cada bombo, con un destello.
      let c = palAt(pal, beatHue);
      if (p.beatAge < 60) c = [(c[0] + 255) >> 1, (c[1] + 255) >> 1, (c[2] + 255) >> 1];
      const env = p.beatAge < 250 ? 255 - div(p.beatAge * 255, 250) : 0;
      return scaleRGB(c, Math.max(env, (bass * 3) >> 2, 20));
    }
    case 'BURST': {
      // Los graves inflan el color desde el centro de cada cara.
      const radius = (bass * 5) >> 8;
      if (d < radius) return scaleRGB(palAt(pal, (beatHue + d * 12) & 0xff), 255 - d * 30);
      if (p.beatAge < 120 && d === radius) return [255, 255, 255];
      return scaleRGB(palAt(pal, (beatHue + 128) & 0xff), 12);
    }
  }
}
