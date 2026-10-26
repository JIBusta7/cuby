import { describe, expect, it } from 'vitest';
import { accuracyFromDistance, colorAccuracy, DEFAULT_ACCURACY, distanceForAccuracy, formatAccuracy } from './accuracy';
import { hsv2rgbRainbow, orientationToColor, restColor } from './colorMap';
import { deltaEOk, rgbToOklab } from './oklab';
import { createRng } from './rng';
import { generateSequence, randomUnitVector } from './targets';
import { ColorMode } from './types';

describe('orientationToColor (port del firmware)', () => {
  it('SIGNED mapea cada eje de -1..1 a 0..255 truncando como el C', () => {
    expect(orientationToColor({ x: 0, y: 0, z: 1 }, ColorMode.Signed)).toEqual([127, 127, 255]);
    expect(orientationToColor({ x: 1, y: 0, z: 0 }, ColorMode.Signed)).toEqual([255, 127, 127]);
    expect(orientationToColor({ x: -1, y: 0, z: 0 }, ColorMode.Signed)).toEqual([0, 127, 127]);
  });
  it('ABS usa el valor absoluto', () => {
    expect(orientationToColor({ x: 0, y: 0, z: -1 }, ColorMode.Abs)).toEqual([0, 0, 255]);
    expect(orientationToColor({ x: -0.6, y: 0.8, z: 0 }, ColorMode.Abs)).toEqual([153, 204, 0]);
  });
  it('HSV en reposo es blanco (sin inclinación = sin saturación)', () => {
    expect(orientationToColor({ x: 0, y: 0, z: 1 }, ColorMode.Hsv)).toEqual([255, 255, 255]);
    expect(restColor(ColorMode.Hsv)).toEqual([255, 255, 255]);
  });
  it('hsv2rgb_rainbow coincide con FastLED en los puntos de referencia', () => {
    expect(hsv2rgbRainbow(0, 255, 255)).toEqual([255, 0, 0]);
    expect(hsv2rgbRainbow(96, 255, 255)).toEqual([0, 255, 0]);
    expect(hsv2rgbRainbow(160, 255, 255)).toEqual([0, 0, 255]);
    expect(hsv2rgbRainbow(64, 255, 255)).toEqual([171, 170, 0]);
    expect(hsv2rgbRainbow(123, 0, 255)).toEqual([255, 255, 255]);
    expect(hsv2rgbRainbow(50, 255, 0)).toEqual([0, 0, 0]);
  });
});

describe('OKLab', () => {
  it('blanco y negro en los extremos de L', () => {
    expect(rgbToOklab([255, 255, 255]).L).toBeCloseTo(1, 3);
    expect(rgbToOklab([0, 0, 0]).L).toBeCloseTo(0, 6);
    expect(deltaEOk([0, 0, 0], [255, 255, 255])).toBeCloseTo(1, 3);
  });
  it('es simétrica y cero para colores iguales', () => {
    expect(deltaEOk([10, 200, 30], [10, 200, 30])).toBe(0);
    expect(deltaEOk([10, 200, 30], [90, 20, 230])).toBeCloseTo(deltaEOk([90, 20, 230], [10, 200, 30]), 12);
  });
});

describe('accuracy', () => {
  const p = DEFAULT_ACCURACY;
  it('100 % con coincidencia exacta y dentro de la tolerancia', () => {
    expect(colorAccuracy([127, 127, 255], [127, 127, 255])).toBe(100);
    expect(accuracyFromDistance(p.tolerance)).toBe(100);
  });
  it('0 % desde tolerancia + rango', () => {
    expect(accuracyFromDistance(p.tolerance + p.range)).toBe(0);
    expect(accuracyFromDistance(2)).toBe(0);
  });
  it('es continua y monótona decreciente', () => {
    let prev = 101;
    for (let d = 0; d <= 0.5; d += 0.001) {
      const a = accuracyFromDistance(d);
      expect(a).toBeLessThanOrEqual(prev);
      if (prev <= 100) expect(prev - a).toBeLessThan(0.3); // sin saltos
      prev = a;
    }
  });
  it('distanceForAccuracy es la inversa', () => {
    for (const a of [50, 90, 95, 99]) expect(accuracyFromDistance(distanceForAccuracy(a))).toBeCloseTo(a, 9);
  });
  it('rechaza valores inválidos', () => {
    expect(accuracyFromDistance(Number.NaN)).toBe(0);
    expect(accuracyFromDistance(-1)).toBe(0);
  });
  it('formatAccuracy nunca redondea a 100 algo que no lo es', () => {
    expect(formatAccuracy(99.96)).toBe('99.9');
    expect(formatAccuracy(100)).toBe('100.0');
  });
});

describe('objetivos alcanzables', () => {
  it('cada objetivo sale de una orientación real (alcanzable al 100 %)', () => {
    const rng = createRng(7);
    for (const mode of [ColorMode.Signed, ColorMode.Abs, ColorMode.Hsv]) {
      for (const t of generateSequence(rng, mode, 20, { minDistance: 0.15 })) {
        expect(orientationToColor(t.up, mode)).toEqual(t.rgb);
        expect(colorAccuracy(orientationToColor(t.up, mode), t.rgb)).toBe(100);
      }
    }
  });
  it('respeta la distancia mínima al reposo y al anterior', () => {
    const seq = generateSequence(createRng(99), ColorMode.Signed, 10, { minDistance: 0.15 });
    const rest = restColor(ColorMode.Signed);
    seq.forEach((t, i) => {
      expect(deltaEOk(t.rgb, rest)).toBeGreaterThanOrEqual(0.15);
      const prev = seq[i - 1];
      if (prev) expect(deltaEOk(t.rgb, prev.rgb)).toBeGreaterThanOrEqual(0.15);
    });
  });
  it('es determinista con la misma semilla', () => {
    const a = generateSequence(createRng(1234), ColorMode.Signed, 5, { minDistance: 0.15 }).map((t) => t.rgb);
    const b = generateSequence(createRng(1234), ColorMode.Signed, 5, { minDistance: 0.15 }).map((t) => t.rgb);
    expect(a).toEqual(b);
  });
  it('respeta la inclinación máxima (cable por la cara inferior)', () => {
    const minUpZ = Math.cos((110 * Math.PI) / 180);
    for (const t of generateSequence(createRng(21), ColorMode.Signed, 200, { minDistance: 0.15, minUpZ })) {
      expect(t.up.z).toBeGreaterThanOrEqual(minUpZ);
    }
  });
  it('las direcciones son unitarias', () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) {
      const v = randomUnitVector(rng);
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 9);
    }
  });
});
