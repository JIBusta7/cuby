/**
 * Precisión de un color respecto del objetivo, en porcentaje.
 *
 *   ΔE      = distancia OKLab entre los dos colores (ver oklab.ts)
 *   exceso  = max(0, ΔE − tolerancia)
 *   accuracy = 100 · max(0, 1 − exceso / rango)
 *
 * - 100 % cuando los valores RGB coinciden (o la diferencia está dentro de la
 *   tolerancia, que absorbe el ruido del sensor y el redondeo a 8 bits).
 * - Lineal en ΔE: cada paso perceptual vale lo mismo, sin saltos.
 * - 0 % a partir de ΔE = tolerancia + rango.
 * - Determinista: mismos colores y parámetros → mismo resultado.
 *
 * Con los valores por defecto (tolerancia 0,005, rango 0,35), 95 % equivale a
 * ΔE ≈ 0,0225 (unos 5° de error de inclinación del cubo): apenas por encima del
 * umbral de diferencia visible en OKLab (≈ 0,02). Un objetivo típico arranca
 * cerca del 14 % (ΔE mediano al color de reposo ≈ 0,31).
 */
import { deltaEOk } from './oklab';
import type { RGB } from './types';

export interface AccuracyParams {
  /** ΔE por debajo del cual se considera coincidencia exacta. */
  readonly tolerance: number;
  /** ΔE (por encima de la tolerancia) en el que la precisión llega a 0 %. */
  readonly range: number;
}

export const DEFAULT_ACCURACY: AccuracyParams = { tolerance: 0.005, range: 0.35 };

export function accuracyFromDistance(deltaE: number, p: AccuracyParams = DEFAULT_ACCURACY): number {
  if (!Number.isFinite(deltaE) || deltaE < 0) return 0;
  if (p.range <= 0) return deltaE <= p.tolerance ? 100 : 0;
  const excess = Math.max(0, deltaE - Math.max(0, p.tolerance));
  return 100 * Math.max(0, 1 - excess / p.range);
}

export function colorAccuracy(color: RGB, target: RGB, p: AccuracyParams = DEFAULT_ACCURACY): number {
  return accuracyFromDistance(deltaEOk(color, target), p);
}

/** Inversa: ΔE máximo que da al menos `accuracy` %. Útil para tests y ayudas. */
export function distanceForAccuracy(accuracy: number, p: AccuracyParams = DEFAULT_ACCURACY): number {
  const a = Math.min(100, Math.max(0, accuracy));
  return p.tolerance + (1 - a / 100) * p.range;
}

/** Formato de precisión para mostrar: una decimal, sin redondear hacia arriba a 100. */
export function formatAccuracy(acc: number): string {
  const floored = Math.floor(acc * 10) / 10;
  return floored.toFixed(1);
}
