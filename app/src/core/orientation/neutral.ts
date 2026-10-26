/**
 * Port de la calibración de posición neutral del firmware (Imu::buildNeutralRotation).
 * Construye la rotación mínima (Rodrigues) que lleva `neutral` a +Z. El
 * simulador la usa para que el comando CAL se comporte como en el cubo real.
 */
import type { Vec3 } from '../color/types';
import { normalize } from './frames';

export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export const IDENTITY_MAT3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function neutralRotation(neutralRaw: Vec3): Mat3 {
  const n = normalize(neutralRaw);
  let kx = n.y;
  let ky = -n.x;
  const s = Math.hypot(kx, ky);
  const c = n.z;
  if (s < 1e-6) {
    const sign = c > 0 ? 1 : -1;
    return [1, 0, 0, 0, sign, 0, 0, 0, sign];
  }
  kx /= s;
  ky /= s;
  const t = 1 - c;
  return [
    c + kx * kx * t, kx * ky * t, ky * s,
    kx * ky * t, c + ky * ky * t, -kx * s,
    -ky * s, kx * s, c,
  ];
}

export function applyMat3(m: Mat3, v: Vec3): Vec3 {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}
