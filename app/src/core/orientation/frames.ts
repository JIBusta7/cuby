/**
 * Conversión entre el marco del sensor (firmware) y el de Three.js, y
 * reconstrucción de la orientación a partir de la gravedad.
 *
 * Firmware: x, y horizontales, z hacia arriba en reposo (mano derecha).
 * Three.js: x a la derecha, y hacia arriba, z hacia la cámara.
 *   three = (fw.x, fw.z, −fw.y)   — rotación propia (det = +1)
 *
 * LÍMITE DEL HARDWARE: el MPU6050 no tiene magnetómetro. Con la gravedad se
 * conoce la inclinación (2 grados de libertad) pero no el giro alrededor del
 * eje vertical. El yaw que manda el firmware sale de integrar el giroscopio y
 * deriva. Por eso la vista 3D del cubo real muestra la inclinación con la
 * rotación mínima (sin yaw), y no inventa un giro que el sensor no mide.
 */
import type { Vec3 } from '../color/types';

/** Cuaternión [x, y, z, w]. */
export type Quat = readonly [number, number, number, number];

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

export function fwToThree(v: Vec3): Vec3 {
  return { x: v.x, y: v.z, z: -v.y };
}

export function threeToFw(v: Vec3): Vec3 {
  return { x: v.x, y: -v.z, z: v.y };
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l, z: v.z / l } : { x: 0, y: 0, z: 1 };
}

/** Rotación mínima que lleva el vector unitario `a` a `b` (misma convención que three.js). */
export function quatFromUnitVectors(a: Vec3, b: Vec3): Quat {
  let r = a.x * b.x + a.y * b.y + a.z * b.z + 1;
  let x: number;
  let y: number;
  let z: number;
  if (r < 1e-8) {
    r = 0;
    if (Math.abs(a.x) > Math.abs(a.z)) {
      x = -a.y; y = a.x; z = 0;
    } else {
      x = 0; y = -a.z; z = a.y;
    }
  } else {
    x = a.y * b.z - a.z * b.y;
    y = a.z * b.x - a.x * b.z;
    z = a.x * b.y - a.y * b.x;
  }
  const l = Math.hypot(x, y, z, r);
  return [x / l, y / l, z / l, r / l];
}

/** Rota un vector por un cuaternión. */
export function rotateByQuat(v: Vec3, [qx, qy, qz, qw]: Quat): Vec3 {
  const tx = 2 * (qy * v.z - qz * v.y);
  const ty = 2 * (qz * v.x - qx * v.z);
  const tz = 2 * (qx * v.y - qy * v.x);
  return {
    x: v.x + qw * tx + (qy * tz - qz * ty),
    y: v.y + qw * ty + (qz * tx - qx * tz),
    z: v.z + qw * tz + (qx * ty - qy * tx),
  };
}

export function conjugate([x, y, z, w]: Quat): Quat {
  return [-x, -y, -z, w];
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

/**
 * Orientación del modelo 3D (marco three) a partir del vector "arriba" del
 * sensor: la rotación mínima que lleva el "arriba" del cubo al "arriba" del mundo.
 */
export function quatFromUp(upFw: Vec3): Quat {
  return quatFromUnitVectors(normalize(fwToThree(upFw)), WORLD_UP);
}

/** Inversa: "arriba" del mundo expresado en el marco del cubo (marco del firmware). */
export function upFromQuat(q: Quat): Vec3 {
  return normalize(threeToFw(rotateByQuat(WORLD_UP, conjugate(q))));
}
