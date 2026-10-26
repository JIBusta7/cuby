/**
 * Generación de colores objetivo que el cubo PUEDE mostrar.
 *
 * El cubo no produce cualquier RGB: el color sale de una dirección (el vector
 * "arriba", de largo 1). En el modo SIGNED, por ejemplo, los colores posibles
 * forman la superficie de una esfera dentro del cubo RGB, centrada en
 * (127,127,127). Por eso no se sortean valores RGB: se sortea una orientación
 * uniforme sobre la esfera y se la pasa por la MISMA función que usa el
 * firmware. Todo objetivo es alcanzable al 100 % girando el cubo.
 */
import { orientationToColor, restColor } from './colorMap';
import { deltaEOk } from './oklab';
import type { Rng } from './rng';
import type { ColorModeId, RGB, Vec3 } from './types';

/** Dirección uniforme sobre la esfera unitaria. */
export function randomUnitVector(rng: Rng): Vec3 {
  const z = 2 * rng() - 1;
  const phi = 2 * Math.PI * rng();
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return { x: r * Math.cos(phi), y: r * Math.sin(phi), z };
}

export interface TargetOptions {
  /** Distancia OKLab mínima a cada color de `avoid` (p. ej. el de reposo, el anterior). */
  readonly minDistance: number;
  readonly avoid: readonly RGB[];
  /**
   * Componente z mínima de la orientación pedida (z = 1 es la posición de
   * reposo). Limita cuánto hay que inclinar el cubo: cos(110°) ≈ −0,34.
   */
  readonly minUpZ?: number;
  readonly maxTries?: number;
}

export interface SequenceOptions {
  readonly minDistance: number;
  readonly minUpZ?: number;
}

export interface GeneratedTarget {
  readonly rgb: RGB;
  /** Orientación que produce ese color (útil para tests y para el simulador). */
  readonly up: Vec3;
}

export function generateTarget(rng: Rng, mode: ColorModeId, opts: TargetOptions): GeneratedTarget {
  const tries = opts.maxTries ?? 200;
  let best: GeneratedTarget | null = null;
  let bestScore = -1;
  const minUpZ = opts.minUpZ ?? -1;
  for (let i = 0; i < tries; i++) {
    const up = randomUnitVector(rng);
    if (up.z < minUpZ) continue;
    const rgb = orientationToColor(up, mode);
    const score = opts.avoid.reduce((m, c) => Math.min(m, deltaEOk(rgb, c)), Infinity);
    if (score >= opts.minDistance) return { rgb, up };
    if (score > bestScore) {
      bestScore = score;
      best = { rgb, up };
    }
  }
  // Nunca debería pasar con distancias razonables; devolvemos el más lejano.
  return best ?? { rgb: orientationToColor({ x: 1, y: 0, z: 0 }, mode), up: { x: 1, y: 0, z: 0 } };
}

/** Secuencia de objetivos: cada uno distinto del reposo y del anterior. */
export function generateSequence(
  rng: Rng,
  mode: ColorModeId,
  count: number,
  opts: SequenceOptions,
): GeneratedTarget[] {
  const rest = restColor(mode);
  const out: GeneratedTarget[] = [];
  for (let i = 0; i < count; i++) {
    const prev = out[out.length - 1];
    const avoid = prev ? [rest, prev.rgb] : [rest];
    out.push(generateTarget(rng, mode, { ...opts, avoid, maxTries: 400 }));
  }
  return out;
}
