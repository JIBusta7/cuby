/**
 * Port exacto de `orientationToColor()` del firmware (src/color_map.cpp) y de
 * `hsv2rgb_rainbow()` de FastLED 3.9 (FASTLED_SCALE8_FIXED = 1).
 *
 * Es la fuente de verdad del color del jugador: la web calcula el color a
 * partir del vector `up` que manda el cubo, con la misma aritmética que usa el
 * ESP32 para pintar los LEDs. Así el color en pantalla y el del cubo coinciden
 * aunque el cubo esté mostrando otra cosa (cuenta regresiva, animaciones).
 */
import { ColorMode, type ColorModeId, type RGB, type Vec3 } from './types';

const f = Math.fround;
const PI = f(Math.PI);
const HALF_PI = f(Math.PI / 2);

/** `(uint8_t)` de C: trunca hacia cero y se queda con 8 bits. */
const u8 = (v: number): number => Math.trunc(v) & 0xff;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** -1..1 → 0..255 (unitTo8 del firmware). */
function unitTo8(v: number): number {
  return u8(clamp(f(f(v + 1) * 127.5), 0, 255));
}

/** |v| 0..1 → 0..255 (absTo8 del firmware). */
function absTo8(v: number): number {
  return u8(clamp(f(Math.abs(v) * 255), 0, 255));
}

// ---- lib8tion (FastLED) con FASTLED_SCALE8_FIXED = 1 ----
const scale8 = (i: number, scale: number): number => ((i * (1 + scale)) >> 8) & 0xff;
const scale8Video = (i: number, scale: number): number =>
  (((i * scale) >> 8) + (i && scale ? 1 : 0)) & 0xff;

/** hsv2rgb_rainbow de FastLED (Y1 = 1, Y2 = 0, G2 = 0, Gscale = 0). */
export function hsv2rgbRainbow(hue: number, sat: number, val: number): RGB {
  hue &= 0xff;
  sat &= 0xff;
  val &= 0xff;
  const offset8 = ((hue & 0x1f) << 3) & 0xff;
  const third = scale8(offset8, 85);
  let r: number;
  let g: number;
  let b: number;

  if (!(hue & 0x80)) {
    if (!(hue & 0x40)) {
      if (!(hue & 0x20)) {
        r = 255 - third; g = third; b = 0;            // R -> O
      } else {
        r = 171; g = 85 + third; b = 0;               // O -> Y
      }
    } else if (!(hue & 0x20)) {
      const twothirds = scale8(offset8, 170);
      r = 171 - twothirds; g = 170 + third; b = 0;    // Y -> G
    } else {
      r = 0; g = 255 - third; b = third;              // G -> A
    }
  } else if (!(hue & 0x40)) {
    if (!(hue & 0x20)) {
      const twothirds = scale8(offset8, 170);
      r = 0; g = 171 - twothirds; b = 85 + twothirds; // A -> B
    } else {
      r = third; g = 0; b = 255 - third;              // B -> P
    }
  } else if (!(hue & 0x20)) {
    r = 85 + third; g = 0; b = 171 - third;           // P -> K
  } else {
    r = 170 + third; g = 0; b = 85 - third;           // K -> R
  }

  if (sat !== 255) {
    if (sat === 0) {
      r = 255; g = 255; b = 255;
    } else {
      let desat = 255 - sat;
      desat = scale8Video(desat, desat);
      const satscale = 255 - desat;
      r = (scale8(r, satscale) + desat) & 0xff;
      g = (scale8(g, satscale) + desat) & 0xff;
      b = (scale8(b, satscale) + desat) & 0xff;
    }
  }

  if (val !== 255) {
    const v = scale8Video(val, val);
    if (v === 0) {
      r = 0; g = 0; b = 0;
    } else {
      r = scale8(r, v);
      g = scale8(g, v);
      b = scale8(b, v);
    }
  }
  return [r & 0xff, g & 0xff, b & 0xff];
}

/** Orientación (vector "arriba" ya calibrado) → color, igual que el firmware. */
export function orientationToColor(u: Vec3, mode: ColorModeId): RGB {
  switch (mode) {
    case ColorMode.Abs:
      return [absTo8(u.x), absTo8(u.y), absTo8(u.z)];
    case ColorMode.Hsv: {
      const hue = f(Math.atan2(u.y, u.x));
      const theta = f(Math.acos(clamp(u.z, -1, 1)));
      const h = u8(f(f(f(hue + PI) / f(2 * PI)) * 255));
      const s = u8(f(clamp(f(theta / HALF_PI), 0, 1) * 255));
      const vF = theta <= HALF_PI ? 1 : f(1 - f(f(0.6 * f(theta - HALF_PI)) / HALF_PI));
      return hsv2rgbRainbow(h, s, u8(f(vF * 255)));
    }
    case ColorMode.Signed:
    default:
      return [unitTo8(u.x), unitTo8(u.y), unitTo8(u.z)];
  }
}

/** Color que muestra el cubo en reposo, recién calibrado (up = 0,0,1). */
export function restColor(mode: ColorModeId): RGB {
  return orientationToColor({ x: 0, y: 0, z: 1 }, mode);
}
