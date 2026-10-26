import { describe, expect, it } from 'vitest';
import { createRng } from '../color/rng';
import { randomUnitVector } from '../color/targets';
import { DEFAULT_FACE_AXES, dominantAxis, isValidFaceMap, topFace } from './faces';
import { fwToThree, quatFromUp, threeToFw, upFromQuat } from './frames';
import { applyMat3, neutralRotation } from './neutral';

const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, d = 6) => {
  expect(a.x).toBeCloseTo(b.x, d);
  expect(a.y).toBeCloseTo(b.y, d);
  expect(a.z).toBeCloseTo(b.z, d);
};

describe('marcos', () => {
  it('fwToThree y threeToFw son inversas', () => {
    const v = { x: 0.1, y: -0.7, z: 0.3 };
    close(threeToFw(fwToThree(v)), v);
  });
  it('en reposo la orientación es la identidad', () => {
    const q = quatFromUp({ x: 0, y: 0, z: 1 });
    expect(q[3]).toBeCloseTo(1, 9);
  });
  it('upFromQuat(quatFromUp(u)) = u para cualquier inclinación', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const u = randomUnitVector(rng);
      close(upFromQuat(quatFromUp(u)), u, 5);
    }
  });
});

describe('caras', () => {
  it('el mapa por defecto es válido y detecta mapas inválidos', () => {
    expect(isValidFaceMap(DEFAULT_FACE_AXES)).toBe(true);
    expect(isValidFaceMap(['+Z', '+Z', '+Y', '-X', '-Y', '-Z'])).toBe(false);
    expect(isValidFaceMap(['+Z'])).toBe(false);
  });
  it('detecta la cara de arriba', () => {
    expect(topFace({ x: 0, y: 0, z: 1 }, DEFAULT_FACE_AXES, null)).toBe(0);
    expect(topFace({ x: 0, y: 0, z: -1 }, DEFAULT_FACE_AXES, null)).toBe(5);
    expect(dominantAxis({ x: -0.9, y: 0.1, z: 0.3 })).toBe('-X');
  });
  it('la histéresis evita saltos cerca de 45°', () => {
    const near45 = { x: 0.72, y: 0, z: 0.69 }; // +X apenas por encima de +Z
    expect(topFace(near45, DEFAULT_FACE_AXES, 0)).toBe(0);
    expect(topFace(near45, DEFAULT_FACE_AXES, null)).toBe(1);
    expect(topFace({ x: 0.85, y: 0, z: 0.52 }, DEFAULT_FACE_AXES, 0)).toBe(1);
  });
});

describe('calibración neutral (port del firmware)', () => {
  it('lleva el vector neutral a +Z', () => {
    const rng = createRng(11);
    for (let i = 0; i < 100; i++) {
      const n = randomUnitVector(rng);
      close(applyMat3(neutralRotation(n), n), { x: 0, y: 0, z: 1 }, 5);
    }
  });
  it('maneja los casos alineado e invertido', () => {
    close(applyMat3(neutralRotation({ x: 0, y: 0, z: 1 }), { x: 0, y: 0, z: 1 }), { x: 0, y: 0, z: 1 });
    close(applyMat3(neutralRotation({ x: 0, y: 0, z: -1 }), { x: 0, y: 0, z: -1 }), { x: 0, y: 0, z: 1 });
  });
});
