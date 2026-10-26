/** Hash entero de 32 bits, idéntico al del firmware (para destellos pseudoaleatorios). */
export function hash4(a: number, b: number, c: number, d: number): number {
  let h =
    Math.imul(a + 1, 0x9e3779b1) ^
    Math.imul(b + 1, 0x85ebca77) ^
    Math.imul(c + 1, 0xc2b2ae3d) ^
    Math.imul(d + 1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}
