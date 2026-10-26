/**
 * Comandos de texto PC → cubo. Una línea por comando, terminada en '\n'.
 *
 * Firmware v1 (el original): CAL, MODE, BRI, STATE, COLOR, AUTO, PING.
 * Firmware v2 (agregados para el juego, ver docs/firmware.md): INFO, ANIM,
 * TARGET, LIGHT, FMAP. La web consulta INFO al conectar y solo usa lo que el
 * cubo declara soportar.
 */
import type { ColorModeId, RGB } from '../color/types';
import type { Palette, ShowEffect } from '../leds/effects';
import type { Axis } from '../orientation/faces';

/** Animaciones que corre el ESP32 localmente. */
export type AnimName = 'PLAY' | 'IDLE' | 'COUNT' | 'WIN' | 'FAIL';

export type CubeCommand =
  | { type: 'CAL' }
  | { type: 'MODE'; mode: ColorModeId }
  | { type: 'BRI'; value: number }
  | { type: 'STATE'; value: number }
  | { type: 'COLOR'; rgb: RGB }
  | { type: 'AUTO' }
  | { type: 'PING' }
  | { type: 'INFO' }
  | { type: 'ANIM'; anim: AnimName }
  | { type: 'TARGET'; rgb: RGB | null }
  | { type: 'LIGHT'; face: number }
  | { type: 'FMAP'; axes: readonly Axis[] }
  | { type: 'SHOW'; effect: ShowEffect }
  | { type: 'PAL'; palette: Palette }
  /** Cuadro de audio: 7 bandas 0–255 y si hubo beat. ~30 por segundo, sin respuesta. */
  | { type: 'AUDIO'; bands: readonly number[]; beat: boolean }
  /** Empieza una actualización de firmware por Bluetooth (después van los bytes en crudo). */
  | { type: 'OTA'; size: number; md5: string };

/** Comandos que requieren capacidades del firmware v2. */
export const CAPABILITY_OF: Partial<Record<CubeCommand['type'], Capability>> = {
  ANIM: 'anim',
  TARGET: 'target',
  LIGHT: 'fmap',
  FMAP: 'fmap',
  SHOW: 'show',
  PAL: 'show',
  AUDIO: 'show',
  OTA: 'ota',
};
export type Capability = 'anim' | 'target' | 'fmap' | 'show' | 'ota';

const byte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const hex2 = (v: number): string => byte(v).toString(16).toUpperCase().padStart(2, '0');

export function encodeCommand(cmd: CubeCommand): string {
  switch (cmd.type) {
    case 'CAL':
    case 'AUTO':
    case 'PING':
    case 'INFO':
      return cmd.type;
    case 'MODE':
      return `MODE ${cmd.mode}`;
    case 'BRI':
      return `BRI ${byte(cmd.value)}`;
    case 'STATE':
      return `STATE ${Math.trunc(cmd.value)}`;
    case 'COLOR':
      return `COLOR ${byte(cmd.rgb[0])} ${byte(cmd.rgb[1])} ${byte(cmd.rgb[2])}`;
    case 'ANIM':
      return `ANIM ${cmd.anim}`;
    case 'TARGET':
      return cmd.rgb ? `TARGET ${byte(cmd.rgb[0])} ${byte(cmd.rgb[1])} ${byte(cmd.rgb[2])}` : 'TARGET OFF';
    case 'LIGHT':
      return `LIGHT ${Math.max(0, Math.min(6, Math.trunc(cmd.face)))}`;
    case 'FMAP':
      if (cmd.axes.length !== 6) throw new Error('FMAP necesita 6 ejes');
      return `FMAP ${cmd.axes.join(' ')}`;
    case 'SHOW':
      return `SHOW ${cmd.effect}`;
    case 'PAL':
      return `PAL ${cmd.palette.map((c) => c.map(hex2).join('')).join(' ')}`;
    case 'AUDIO':
      // 'A' + 7 × 2 hex + beat: 16 caracteres, entra en una escritura BLE mínima (20 bytes).
      if (cmd.bands.length !== 7) throw new Error('AUDIO necesita 7 bandas');
      return `A${cmd.bands.map(hex2).join('')}${cmd.beat ? '1' : '0'}`;
    case 'OTA':
      return `OTA ${Math.trunc(cmd.size)} ${cmd.md5}`;
  }
}
