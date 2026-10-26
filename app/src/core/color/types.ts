/** Color de 8 bits por canal, tal como lo maneja el firmware (CRGB). */
export type RGB = readonly [r: number, g: number, b: number];

/** Vector en el marco del sensor del firmware (x, y, z). `z` apunta hacia arriba en reposo. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Modos de color del firmware (`MODE n`). Ver color_map.cpp. */
export const ColorMode = {
  Signed: 0,
  Abs: 1,
  Hsv: 2,
} as const;
export type ColorModeId = (typeof ColorMode)[keyof typeof ColorMode];

export function isColorModeId(v: unknown): v is ColorModeId {
  return v === 0 || v === 1 || v === 2;
}

export function rgbToCss([r, g, b]: RGB): string {
  return `rgb(${r} ${g} ${b})`;
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}
