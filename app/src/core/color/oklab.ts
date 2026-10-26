/**
 * sRGB (8 bits) → OKLab (Björn Ottosson, 2020).
 *
 * Los valores RGB del cubo se interpretan como sRGB, que es como se muestran en
 * el monitor. OKLab es aproximadamente uniforme en percepción: la distancia
 * euclídea entre dos colores sigue bastante bien cuán distintos se ven.
 * No es una medición colorimétrica de los LEDs: compara los valores numéricos
 * que el juego conoce.
 */
import type { RGB } from './types';

export interface Lab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

function srgbToLinear(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToOklab([r8, g8, b8]: RGB): Lab {
  const r = srgbToLinear(r8);
  const g = srgbToLinear(g8);
  const b = srgbToLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Distancia euclídea en OKLab (ΔE_ok). 0 = idénticos; negro↔blanco ≈ 1. */
export function deltaEOk(c1: RGB, c2: RGB): number {
  const p = rgbToOklab(c1);
  const q = rgbToOklab(c2);
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}
