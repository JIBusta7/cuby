/**
 * Espejo de lo que muestran los LEDs del cubo (firmware v2, src/anim.cpp).
 *
 * Mismo modelo y mismos tiempos que el ESP32: recibe los mismos comandos y,
 * con la orientación, calcula los 6 × 49 píxeles. Lo usan:
 *  - el simulador, como si fueran los LEDs físicos;
 *  - la vista 3D con el cubo real, para mostrar lo que el cubo está mostrando.
 * Las animaciones corren localmente en el ESP32; esto solo las reproduce.
 */
import { hsv2rgbRainbow } from '../color/colorMap';
import type { RGB } from '../color/types';
import { BEAT_MS, COUNTDOWN_MS, GO_MS } from '../game/timing';
import type { CubeCommand } from '../protocol/commands';
import { DEFAULT_PALETTE, showPixel, type Palette, type ShowEffect } from './effects';
import { glyphOn } from './glyphs';

export const FACE_COUNT = 6;
export const FACE_SIZE = 7;
export const PIXELS_PER_FACE = FACE_SIZE * FACE_SIZE;

/**
 * Posiciones de la grilla 7×7 sin LED, por cara (índice 0–5). La cara 6 es la
 * inferior: por su centro (fila 4, columna 4) sale el cable de alimentación,
 * así que tiene 48 LEDs. Igual que FACE_HOLE en el firmware (config.h).
 */
export const FACE_HOLES: readonly (readonly (readonly [x: number, y: number])[])[] = [[], [], [], [], [], [[3, 3]]];

export function hasLed(face: number, x: number, y: number): boolean {
  return !(FACE_HOLES[face] ?? []).some(([hx, hy]) => hx === x && hy === y);
}

export const LEDS_PER_FACE: readonly number[] = FACE_HOLES.map((h) => PIXELS_PER_FACE - h.length);
/** 293: seis caras de 7×7 menos el agujero del cable. */
export const TOTAL_LEDS = LEDS_PER_FACE.reduce((a, b) => a + b, 0);

export type LedAnim =
  | 'PLAY'      // color según orientación en todo el cubo
  | 'TARGET'    // cara superior = objetivo; resto = color del jugador
  | 'IDLE'      // ondas de arco iris
  | 'COUNT'     // 3, 2, 1, GO y después PLAY/TARGET
  | 'WIN'       // celebración
  | 'FAIL'      // pulsos rojos
  | 'SOLID'     // color fijo (COLOR r g b)
  | 'LIGHT'     // una cara blanca (asistente de caras)
  | 'LINK_LOST' // se cortó el BLE: pulsos ámbar y vuelve a PLAY
  | 'SHOW';     // modo LUCES: un efecto de effects.ts

export interface LedState {
  readonly anim: LedAnim;
  readonly since: number;
  readonly target: RGB | null;
  readonly solid: RGB;
  readonly light: number; // cara 1–6 para LIGHT
  readonly effect: ShowEffect;
  readonly palette: Palette;
  /** 7 bandas de audio 0–255 recibidas por última vez. */
  readonly bands: readonly number[];
  readonly beatAt: number | null;
  readonly beatCount: number;
}

export const INITIAL_LED_STATE: LedState = {
  anim: 'PLAY',
  since: 0,
  target: null,
  solid: [0, 0, 0],
  light: 0,
  effect: 'RAINBOW',
  palette: DEFAULT_PALETTE,
  bands: [0, 0, 0, 0, 0, 0, 0],
  beatAt: null,
  beatCount: 0,
};

export const LED_COLORS = {
  count3: [255, 60, 40] as RGB,
  count2: [255, 170, 0] as RGB,
  count1: [0, 220, 90] as RGB,
  go: [110, 60, 255] as RGB,
  fail: [255, 40, 30] as RGB,
  linkLost: [255, 120, 0] as RGB,
  light: [180, 180, 180] as RGB,
};

const LINK_LOST_MS = 1200;

const playOrTarget = (s: LedState): LedAnim => (s.target ? 'TARGET' : 'PLAY');

/** Aplica un comando PC → cubo al estado de los LEDs (igual que handleCommand del firmware). */
export function applyLedCommand(s: LedState, cmd: CubeCommand, now: number): LedState {
  switch (cmd.type) {
    case 'ANIM':
      if (cmd.anim === 'PLAY') return { ...s, anim: playOrTarget(s), since: now };
      return { ...s, anim: cmd.anim, since: now };
    case 'COLOR':
      return { ...s, anim: 'SOLID', solid: cmd.rgb, since: now };
    case 'AUTO':
      return { ...s, anim: playOrTarget(s), since: now };
    case 'TARGET': {
      const next = { ...s, target: cmd.rgb };
      if (s.anim === 'PLAY' || s.anim === 'TARGET') return { ...next, anim: playOrTarget(next), since: now };
      return next;
    }
    case 'LIGHT':
      return cmd.face >= 1 && cmd.face <= FACE_COUNT
        ? { ...s, anim: 'LIGHT', light: cmd.face, since: now }
        : { ...s, anim: playOrTarget(s), since: now };
    case 'SHOW':
      return { ...s, anim: 'SHOW', effect: cmd.effect, since: now };
    case 'PAL':
      return { ...s, palette: cmd.palette };
    case 'AUDIO':
      return {
        ...s,
        bands: cmd.bands.map((b) => Math.max(0, Math.min(255, Math.round(b)))),
        ...(cmd.beat ? { beatAt: now, beatCount: (s.beatCount + 1) & 0xffff } : {}),
      };
    default:
      return s;
  }
}

/** Evento de enlace (solo el firmware lo dispara solo: al desconectarse el BLE). */
export function ledLinkLost(s: LedState, now: number): LedState {
  return { ...s, anim: 'LINK_LOST', target: null, since: now };
}

/** Transiciones por tiempo: COUNT → PLAY/TARGET, LINK_LOST → PLAY. */
export function advanceLedState(s: LedState, now: number): LedState {
  if (s.anim === 'COUNT' && now - s.since >= COUNTDOWN_MS) {
    return { ...s, anim: playOrTarget(s), since: s.since + COUNTDOWN_MS };
  }
  if (s.anim === 'LINK_LOST' && now - s.since >= LINK_LOST_MS) {
    return { ...s, anim: 'PLAY', since: s.since + LINK_LOST_MS };
  }
  return s;
}

export { hash4 } from './hash';
import { hash4 } from './hash';

const scale = ([r, g, b]: RGB, k: number): RGB => [Math.round(r * k), Math.round(g * k), Math.round(b * k)];

export interface RenderContext {
  /** Color del jugador (ya suavizado como en el firmware). */
  readonly player: RGB;
  /** Índice 0–5 de la cara que está arriba (para TARGET). */
  readonly topFace: number;
  /** Cuánto mira hacia arriba cada cara (−255…255), para el efecto GRAVITY. */
  readonly faceUp?: readonly number[];
}

const FLAT: readonly number[] = [255, 0, 0, 0, 0, -255];

/** Color del píxel (x, y) de la cara `face` (0–5) en el instante `now`. */
export function pixelColor(s: LedState, now: number, face: number, x: number, y: number, ctx: RenderContext): RGB {
  const t = Math.max(0, now - s.since);
  switch (s.anim) {
    case 'PLAY':
      return ctx.player;
    case 'TARGET': {
      if (face !== ctx.topFace || !s.target) return ctx.player;
      const border = x === 0 || y === 0 || x === FACE_SIZE - 1 || y === FACE_SIZE - 1;
      return border ? [0, 0, 0] : s.target;
    }
    case 'SOLID':
      return s.solid;
    case 'LIGHT':
      return face === s.light - 1 ? LED_COLORS.light : [0, 0, 0];
    case 'IDLE': {
      const hue = (Math.floor(t / 16) + (x + y) * 10 + face * 43) & 0xff;
      return hsv2rgbRainbow(hue, 240, 255);
    }
    case 'COUNT': {
      if (t < 3 * BEAT_MS) {
        const beat = Math.floor(t / BEAT_MS);
        const digit = (3 - beat) as 1 | 2 | 3;
        const color = digit === 3 ? LED_COLORS.count3 : digit === 2 ? LED_COLORS.count2 : LED_COLORS.count1;
        const env = 1 - 0.45 * ((t - beat * BEAT_MS) / BEAT_MS);
        return glyphOn(digit, x, y) ? scale(color, env) : scale(color, 0.08);
      }
      // GO: anillo cuadrado que se expande desde el centro
      const p = Math.min(1, (t - 3 * BEAT_MS) / GO_MS);
      const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      const r = p * 4.5;
      if (Math.abs(d - r) < 1) return [255, 255, 255];
      if (d < r) return scale(LED_COLORS.go, 1 - p * 0.6);
      return [0, 0, 0];
    }
    case 'WIN': {
      const slot = Math.floor(t / 90);
      if (hash4(face, x, y, slot) % 9 === 0) return [255, 255, 255];
      const hue = (Math.floor(t / 6) + face * 43 + y * 20) & 0xff;
      return hsv2rgbRainbow(hue, 255, 255);
    }
    case 'FAIL': {
      const k = t < 1500 ? 0.25 + 0.75 * Math.abs(Math.sin((Math.PI * t) / 500)) : 0.25;
      return scale(LED_COLORS.fail, k);
    }
    case 'LINK_LOST': {
      const on = Math.floor(t / 200) % 2 === 0;
      return on ? LED_COLORS.linkLost : [0, 0, 0];
    }
    case 'SHOW':
      return showPixel(s.effect, Math.floor(t), face, x, y, {
        palette: s.palette,
        bands: s.bands,
        beatAge: s.beatAt === null ? 1e9 : Math.max(0, Math.floor(now - s.beatAt)),
        beatCount: s.beatCount,
        faceUp: ctx.faceUp ?? FLAT,
      });
  }
}

/**
 * Las 6 caras como buffers RGBA (7×7, fila 0 arriba) listos para una textura.
 * Donde no hay LED (agujero del cable) el alfa es 0.
 */
export function renderFaces(s: LedState, now: number, ctx: RenderContext, out?: Uint8Array[]): Uint8Array[] {
  const faces = out ?? Array.from({ length: FACE_COUNT }, () => new Uint8Array(PIXELS_PER_FACE * 4));
  for (let f = 0; f < FACE_COUNT; f++) {
    const buf = faces[f]!;
    for (let y = 0; y < FACE_SIZE; y++) {
      for (let x = 0; x < FACE_SIZE; x++) {
        const i = (y * FACE_SIZE + x) * 4;
        if (!hasLed(f, x, y)) {
          buf[i] = 0;
          buf[i + 1] = 0;
          buf[i + 2] = 0;
          buf[i + 3] = 0;
          continue;
        }
        const [r, g, b] = pixelColor(s, now, f, x, y, ctx);
        buf[i] = r;
        buf[i + 1] = g;
        buf[i + 2] = b;
        buf[i + 3] = 255;
      }
    }
  }
  return faces;
}

/** Suavizado del color del jugador igual al firmware (0,25 por cuadro de 16 ms). */
export function smoothColor(prev: readonly number[], target: RGB, dtMs: number): [number, number, number] {
  const k = 1 - Math.pow(0.75, Math.max(0, dtMs) / 16);
  return [
    (prev[0] ?? 0) + k * (target[0] - (prev[0] ?? 0)),
    (prev[1] ?? 0) + k * (target[1] - (prev[1] ?? 0)),
    (prev[2] ?? 0) + k * (target[2] - (prev[2] ?? 0)),
  ];
}
