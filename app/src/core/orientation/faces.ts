/**
 * Caras del cubo físico y su relación con los ejes del sensor.
 *
 * Las caras se numeran 1–6 en el orden de la cadena de LEDs (índice 0–5 acá).
 * Qué eje del MPU6050 apunta hacia afuera de cada cara depende de cómo se
 * montó el sensor: se mide con el asistente "Identificar caras" y se guarda en
 * el cubo (FMAP). DEFAULT_FACE_AXES es solo un punto de partida.
 */
import type { Vec3 } from '../color/types';

export type Axis = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';
export const AXES: readonly Axis[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
export type FaceAxes = readonly Axis[];

/** Supuesto inicial (cara 1 arriba en reposo, 2–5 alrededor, 6 abajo). Sin validar en el hardware. */
export const DEFAULT_FACE_AXES: FaceAxes = ['+Z', '+X', '+Y', '-X', '-Y', '-Z'];

export function isAxis(v: unknown): v is Axis {
  return typeof v === 'string' && (AXES as readonly string[]).includes(v);
}

export function axisVector(a: Axis): Vec3 {
  const s = a[0] === '-' ? -1 : 1;
  switch (a[1]) {
    case 'X':
      return { x: s, y: 0, z: 0 };
    case 'Y':
      return { x: 0, y: s, z: 0 };
    default:
      return { x: 0, y: 0, z: s };
  }
}

/** Un mapa válido usa los 6 sentidos de eje exactamente una vez. */
export function isValidFaceMap(axes: readonly unknown[]): axes is FaceAxes {
  return axes.length === 6 && axes.every(isAxis) && new Set(axes).size === 6;
}

/** Eje con mayor componente del vector (la cara que más mira hacia arriba si `v` es "up"). */
export function dominantAxis(v: Vec3): Axis {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  if (ax >= ay && ax >= az) return v.x >= 0 ? '+X' : '-X';
  if (ay >= az) return v.y >= 0 ? '+Y' : '-Y';
  return v.z >= 0 ? '+Z' : '-Z';
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Cara que está arriba, con histéresis: solo cambia si otra cara supera a la
 * actual por `hysteresis` (en coseno). Evita que el objetivo salte de cara
 * cuando el cubo está cerca de 45°.
 */
export function topFace(up: Vec3, axes: FaceAxes, current: number | null, hysteresis = 0.12): number {
  let best = 0;
  let bestDot = -Infinity;
  axes.forEach((a, i) => {
    const d = dot(up, axisVector(a));
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  });
  if (current !== null && current >= 0 && current < axes.length && current !== best) {
    const currentAxis = axes[current];
    if (currentAxis && bestDot - dot(up, axisVector(currentAxis)) < hysteresis) return current;
  }
  return best;
}
