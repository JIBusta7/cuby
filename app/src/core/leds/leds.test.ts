import { describe, expect, it } from 'vitest';
import { COUNTDOWN_MS } from '../game/timing';
import {
  advanceLedState,
  applyLedCommand,
  hasLed,
  INITIAL_LED_STATE,
  LED_COLORS,
  LEDS_PER_FACE,
  pixelColor,
  renderFaces,
  TOTAL_LEDS,
} from './ledModel';

const ctx = { player: [10, 20, 30] as const, topFace: 2 };

describe('espejo de LEDs', () => {
  it('COUNT pasa a PLAY al terminar la cuenta, o a TARGET si hay objetivo', () => {
    const s = applyLedCommand(INITIAL_LED_STATE, { type: 'ANIM', anim: 'COUNT' }, 1000);
    expect(advanceLedState(s, 1000 + COUNTDOWN_MS - 1).anim).toBe('COUNT');
    expect(advanceLedState(s, 1000 + COUNTDOWN_MS).anim).toBe('PLAY');
    const armed = applyLedCommand(s, { type: 'TARGET', rgb: [1, 2, 3] }, 1100);
    expect(armed.anim).toBe('COUNT');
    expect(advanceLedState(armed, 1000 + COUNTDOWN_MS).anim).toBe('TARGET');
  });
  it('muestra el 3 en el primer segundo de la cuenta', () => {
    const s = applyLedCommand(INITIAL_LED_STATE, { type: 'ANIM', anim: 'COUNT' }, 0);
    expect(pixelColor(s, 0, 0, 1, 0, ctx)).toEqual(LED_COLORS.count3); // fila superior del 3
    expect(pixelColor(s, 0, 0, 0, 0, ctx)).not.toEqual(LED_COLORS.count3); // fuera del glifo
  });
  it('TARGET: la cara de arriba muestra el objetivo con marco negro, el resto el jugador', () => {
    const s = applyLedCommand(INITIAL_LED_STATE, { type: 'TARGET', rgb: [200, 100, 50] }, 0);
    expect(s.anim).toBe('TARGET');
    expect(pixelColor(s, 0, 2, 3, 3, ctx)).toEqual([200, 100, 50]);
    expect(pixelColor(s, 0, 2, 0, 3, ctx)).toEqual([0, 0, 0]);
    expect(pixelColor(s, 0, 1, 3, 3, ctx)).toEqual(ctx.player);
    const off = applyLedCommand(s, { type: 'TARGET', rgb: null }, 10);
    expect(off.anim).toBe('PLAY');
  });
  it('LIGHT enciende solo la cara pedida', () => {
    const s = applyLedCommand(INITIAL_LED_STATE, { type: 'LIGHT', face: 4 }, 0);
    expect(pixelColor(s, 0, 3, 3, 3, ctx)).toEqual(LED_COLORS.light);
    expect(pixelColor(s, 0, 0, 3, 3, ctx)).toEqual([0, 0, 0]);
    expect(applyLedCommand(s, { type: 'LIGHT', face: 0 }, 1).anim).toBe('PLAY');
  });
  it('la cara 6 no tiene LED en el centro (sale el cable): 293 en total', () => {
    expect(hasLed(5, 3, 3)).toBe(false);
    expect(hasLed(5, 2, 3)).toBe(true);
    expect(hasLed(0, 3, 3)).toBe(true);
    expect(LEDS_PER_FACE).toEqual([49, 49, 49, 49, 49, 48]);
    expect(TOTAL_LEDS).toBe(293);
    const faces = renderFaces(INITIAL_LED_STATE, 0, ctx);
    expect(faces[5]![(3 * 7 + 3) * 4 + 3]).toBe(0);
    expect(faces[4]![(3 * 7 + 3) * 4 + 3]).toBe(255);
  });
  it('renderFaces devuelve 6 caras RGBA de 7×7', () => {
    const faces = renderFaces(INITIAL_LED_STATE, 0, ctx);
    expect(faces).toHaveLength(6);
    expect(faces[0]).toHaveLength(49 * 4);
    expect(Array.from(faces[5]!.slice(0, 4))).toEqual([10, 20, 30, 255]);
  });
});
