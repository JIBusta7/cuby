import { describe, expect, it } from 'vitest';
import { deltaEOk } from './oklab';
import { extractPalette, ledify } from './palette';

/** Imagen RGBA de w×h con bloques de color. */
function image(blocks: [number, number, number, number][]): Uint8ClampedArray {
  const out: number[] = [];
  for (const [r, g, b, n] of blocks) for (let i = 0; i < n; i++) out.push(r, g, b, 255);
  return new Uint8ClampedArray(out);
}

describe('extractPalette', () => {
  it('encuentra los colores principales de una tapa', () => {
    const pal = extractPalette(image([[200, 20, 30, 900], [20, 40, 180, 700], [240, 200, 20, 500], [15, 15, 15, 1500]]));
    expect(pal).toHaveLength(4);
    const has = (c: [number, number, number]) => pal.some((p) => deltaEOk(p, c) < 0.15);
    expect(has([255, 25, 38])).toBe(true); // rojo, llevado a brillo máximo
    expect(has([28, 57, 255])).toBe(true); // azul
  });
  it('los colores son distintos entre sí y aptos para LED (brillo máximo)', () => {
    const pal = extractPalette(image([[120, 60, 50, 1000], [130, 70, 60, 1000], [40, 90, 120, 600]]));
    for (let i = 0; i < 4; i++) {
      expect(Math.max(...pal[i]!)).toBeGreaterThanOrEqual(250);
      for (let j = i + 1; j < 4; j++) expect(deltaEOk(pal[i]!, pal[j]!)).toBeGreaterThan(0.05);
    }
  });
  it('es determinista y tolera imágenes vacías o grises', () => {
    const img = image([[10, 200, 90, 300], [250, 100, 0, 300]]);
    expect(extractPalette(img)).toEqual(extractPalette(img));
    expect(extractPalette(new Uint8ClampedArray(0))).toHaveLength(4);
    expect(extractPalette(image([[128, 128, 128, 500]]))).toHaveLength(4);
  });
  it('ledify: gris → blanco cálido, color apagado → vivo', () => {
    expect(ledify([120, 120, 120])).toEqual([255, 220, 170]);
    const c = ledify([60, 30, 30]);
    expect(Math.max(...c)).toBe(255);
  });
});
