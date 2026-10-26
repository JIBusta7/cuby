/**
 * Mensajes cubo → PC. Se validan campo por campo; una línea mal formada se
 * descarta en vez de romper el juego.
 *
 *  - Lecturas por BLE (firmware v2): formato compacto de una sola notificación,
 *      d<seq><x>,<y>,<z>,<flags>     ej. "d7-707,12,707,0"
 *    seq 0–9 cíclico, x/y/z = "arriba" × 999, flags = botón + 2 × modo.
 *  - Todo lo demás (y las lecturas por USB o del firmware v1): JSON.
 */
import { orientationToColor } from '../color/colorMap';
import { isColorModeId, type ColorModeId, type RGB, type Vec3 } from '../color/types';
import type { Capability } from './commands';

export interface DataMessage {
  readonly t: 'd';
  readonly up: Vec3;
  readonly roll: number;
  readonly pitch: number;
  /** Solo giroscopio: deriva con el tiempo (el MPU6050 no tiene magnetómetro). */
  readonly yaw: number;
  /** Color que el cubo está mostrando (incluye animaciones y colores forzados). */
  readonly rgb: RGB;
  readonly btn: boolean;
  readonly state: number;
  readonly mode: ColorModeId;
  /** Número de secuencia 0–9 de la lectura compacta (firmware v2): mide pérdidas. */
  readonly seq: number | null;
  /** Veces que el firmware reinicializó el MPU6050 (v2). null en el v1. */
  readonly imuResets: number | null;
}

export type CubeMessage =
  | DataMessage
  | { readonly t: 'btn'; readonly ev: 'short' | 'long' }
  | { readonly t: 'ack'; readonly cmd: string }
  | { readonly t: 'err'; readonly cmd: string }
  | { readonly t: 'pong' }
  | { readonly t: 'cal' }
  | { readonly t: 'info'; readonly fw: number; readonly caps: readonly Capability[] }
  | { readonly t: 's'; readonly imuResets: number; readonly fw: number }
  | { readonly t: 'ota'; readonly ready: boolean; readonly written: number | null; readonly done: boolean; readonly error: string | null };

const COMPACT = /^d(\d)(-?\d{1,3}),(-?\d{1,3}),(-?\d{1,3}),(\d)$/;

function parseCompact(text: string): DataMessage | null {
  const m = COMPACT.exec(text);
  if (!m) return null;
  const x = Number(m[2]) / 999;
  const y = Number(m[3]) / 999;
  const z = Number(m[4]) / 999;
  const flags = Number(m[5]);
  const len = Math.hypot(x, y, z);
  if (len < 0.5 || len > 1.5) return null;
  const mode = flags >> 1;
  if (!isColorModeId(mode)) return null;
  const up = { x: x / len, y: y / len, z: z / len };
  return {
    t: 'd',
    up,
    roll: 0,
    pitch: 0,
    yaw: 0,
    rgb: orientationToColor(up, mode),
    btn: (flags & 1) === 1,
    state: 0,
    mode,
    seq: Number(m[1]),
    imuResets: null,
  };
}

/** Codifica una lectura en el formato compacto del firmware v2 (lo usa el simulador). */
export function encodeCompact(up: Vec3, seq: number, btn: boolean, mode: ColorModeId): string {
  const q = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 999);
  return `d${seq % 10}${q(up.x)},${q(up.y)},${q(up.z)},${(btn ? 1 : 0) + 2 * mode}`;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isByte = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 255;
const CAPS: readonly Capability[] = ['anim', 'target', 'fmap', 'show', 'ota'];

export function parseMessage(line: string): CubeMessage | null {
  const text = line.trim();
  if (text.startsWith('d')) return parseCompact(text);
  if (!text.startsWith('{')) return null;
  let o: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(text);
    if (typeof v !== 'object' || v === null) return null;
    o = v as Record<string, unknown>;
  } catch {
    return null;
  }

  switch (o.t) {
    case 'd': {
      const { x, y, z, roll, pitch, yaw, rgb, btn, state, mode, ie } = o;
      if (!isNum(x) || !isNum(y) || !isNum(z)) return null;
      if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every(isByte)) return null;
      const len = Math.hypot(x, y, z);
      if (len < 0.5 || len > 1.5) return null; // el firmware manda un vector unitario (redondeado a 2 decimales)
      return {
        t: 'd',
        up: { x: x / len, y: y / len, z: z / len },
        roll: isNum(roll) ? roll : 0,
        pitch: isNum(pitch) ? pitch : 0,
        yaw: isNum(yaw) ? yaw : 0,
        rgb: [rgb[0], rgb[1], rgb[2]] as RGB,
        btn: btn === 1 || btn === true,
        state: isNum(state) ? state : 0,
        mode: isColorModeId(mode) ? mode : 0,
        seq: null,
        imuResets: isNum(ie) ? ie : null,
      };
    }
    case 'btn':
      return o.ev === 'short' || o.ev === 'long' ? { t: 'btn', ev: o.ev } : null;
    case 'ack':
    case 'err':
      return { t: o.t, cmd: typeof o.cmd === 'string' ? o.cmd : '' };
    case 'pong':
      return { t: 'pong' };
    case 'cal':
      return { t: 'cal' };
    case 's':
      return isNum(o.ie) ? { t: 's', imuResets: o.ie, fw: isNum(o.fw) ? o.fw : 2 } : null;
    case 'ota':
      return {
        t: 'ota',
        ready: o.ready === 1 || o.ready === true,
        written: isNum(o.n) ? o.n : null,
        done: o.done === 1 || o.done === true,
        error: typeof o.err === 'string' ? o.err : null,
      };
    case 'info': {
      const caps = Array.isArray(o.caps) ? o.caps.filter((c): c is Capability => CAPS.includes(c as Capability)) : [];
      return { t: 'info', fw: isNum(o.fw) ? o.fw : 1, caps };
    }
    default:
      return null;
  }
}

/** Serializa un DataMessage con el mismo formato que el firmware (lo usa el simulador). */
export function encodeData(m: Omit<DataMessage, 't' | 'seq' | 'imuResets'> & { imuResets?: number }): string {
  const r = (v: number, d: number) => Number(v.toFixed(d));
  return JSON.stringify({
    t: 'd',
    x: r(m.up.x, 3),
    y: r(m.up.y, 3),
    z: r(m.up.z, 3),
    roll: r(m.roll, 1),
    pitch: r(m.pitch, 1),
    yaw: r(m.yaw, 1),
    rgb: [...m.rgb],
    btn: m.btn ? 1 : 0,
    state: m.state,
    mode: m.mode,
    ...(m.imuResets !== undefined ? { ie: m.imuResets } : {}),
  });
}
