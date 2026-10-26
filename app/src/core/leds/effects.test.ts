import { describe, expect, it } from 'vitest';
import { encodeCommand } from '../protocol/commands';
import { DEFAULT_PALETTE, palAt, sin8, SHOW_EFFECTS, showPixel, type ShowParams } from './effects';
import { applyLedCommand, INITIAL_LED_STATE, pixelColor } from './ledModel';

const params: ShowParams = {
  palette: DEFAULT_PALETTE,
  bands: [200, 150, 100, 80, 60, 40, 20],
  beatAge: 1e9,
  beatCount: 0,
  faceUp: [255, 0, 0, 0, 0, -255],
};

describe('efectos del modo luces', () => {
  it('sin8 coincide con FastLED en los puntos clave', () => {
    expect(sin8(0)).toBe(128);
    expect(sin8(64)).toBe(255);
    expect(sin8(128)).toBe(128);
    expect(sin8(192)).toBe(1);
  });
  it('palAt recorre los 4 colores de la paleta', () => {
    expect(palAt(DEFAULT_PALETTE, 0)).toEqual(DEFAULT_PALETTE[0]);
    expect(palAt(DEFAULT_PALETTE, 64)).toEqual(DEFAULT_PALETTE[1]);
    expect(palAt(DEFAULT_PALETTE, 192)).toEqual(DEFAULT_PALETTE[3]);
  });
  it('todos los efectos dan colores válidos y son deterministas', () => {
    for (const e of SHOW_EFFECTS)
      for (const t of [0, 777, 12345])
        for (let f = 0; f < 6; f++)
          for (let y = 0; y < 7; y++)
            for (let x = 0; x < 7; x++) {
              const c = showPixel(e, t, f, x, y, params);
              expect(c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255), `${e} ${t} ${f} ${x},${y}`).toBe(true);
              expect(showPixel(e, t, f, x, y, params)).toEqual(c);
            }
  });
  it('SPECTRUM: la columna de cada banda sube según su nivel', () => {
    const lit = (x: number) => [0, 1, 2, 3, 4, 5, 6].filter((y) => Math.max(...showPixel('SPECTRUM', 0, 0, x, y, params)) > 60).length;
    expect(lit(0)).toBeGreaterThan(lit(6));
    expect(lit(0)).toBe((200 * 8) >> 8);
  });
  it('PULSE: el beat ilumina y se apaga en 300 ms', () => {
    const quiet = { ...params, bands: [0, 0, 0, 0, 0, 0, 0] };
    const on = Math.max(...showPixel('PULSE', 0, 0, 3, 3, { ...quiet, beatAge: 0 }));
    const off = Math.max(...showPixel('PULSE', 0, 0, 3, 3, { ...quiet, beatAge: 400 }));
    expect(on).toBeGreaterThan(off * 3);
  });
  it('cada bombo cambia el color de los efectos de sonido', () => {
    const at = (e: 'KICK' | 'PULSE' | 'SPECTRUM' | 'RINGS' | 'BURST', beatCount: number) =>
      showPixel(e, 0, 0, 3, 6, { ...params, beatAge: 150, beatCount });
    for (const e of ['KICK', 'PULSE', 'BURST'] as const) expect(at(e, 1), e).not.toEqual(at(e, 2));
  });
  it('KICK: destello en el golpe, después sigue a los graves', () => {
    const silent = { ...params, bands: [0, 0, 0, 0, 0, 0, 0] };
    const hit = Math.max(...showPixel('KICK', 0, 0, 3, 3, { ...silent, beatAge: 0, beatCount: 1 }));
    const later = Math.max(...showPixel('KICK', 0, 0, 3, 3, { ...silent, beatAge: 400, beatCount: 1 }));
    const bassy = Math.max(...showPixel('KICK', 0, 0, 3, 3, { ...silent, bands: [255, 0, 0, 0, 0, 0, 0], beatAge: 400, beatCount: 1 }));
    expect(hit).toBe(255);
    expect(later).toBeLessThan(40);
    expect(bassy).toBeGreaterThan(150);
  });
  it('BURST: más graves = círculo más grande', () => {
    const lit = (b: number) =>
      [0, 1, 2, 3, 4, 5, 6].filter((x) => Math.max(...showPixel('BURST', 0, 0, x, 3, { ...params, bands: [b, 0, 0, 0, 0, 0, 0], beatAge: 1e9 })) > 100).length;
    expect(lit(250)).toBeGreaterThan(lit(100));
    expect(lit(0)).toBe(0);
  });
  it('el modelo de LEDs aplica SHOW, PAL y los cuadros de audio', () => {
    let s = applyLedCommand(INITIAL_LED_STATE, { type: 'SHOW', effect: 'PULSE' }, 1000);
    s = applyLedCommand(s, { type: 'PAL', palette: [[255, 0, 0], [255, 0, 0], [255, 0, 0], [255, 0, 0]] }, 1000);
    s = applyLedCommand(s, { type: 'AUDIO', bands: [0, 0, 0, 0, 0, 0, 0], beat: true }, 1100);
    expect(s).toMatchObject({ anim: 'SHOW', effect: 'PULSE', beatCount: 1, beatAt: 1100 });
    expect(pixelColor(s, 1100, 0, 3, 3, { player: [0, 0, 0], topFace: 0 })).toEqual([255, 0, 0]);
  });
  it('los comandos entran en una escritura BLE mínima cuando hace falta', () => {
    expect(encodeCommand({ type: 'AUDIO', bands: [255, 128, 0, 1, 2, 3, 4], beat: true })).toBe('AFF8000010203041');
    expect(encodeCommand({ type: 'AUDIO', bands: [0, 0, 0, 0, 0, 0, 0], beat: false }).length + 1).toBeLessThanOrEqual(20);
    expect(encodeCommand({ type: 'SHOW', effect: 'RINGS' })).toBe('SHOW RINGS');
    expect(encodeCommand({ type: 'PAL', palette: DEFAULT_PALETTE })).toBe('PAL 6E3CFF FF3C28 FFAA00 00DC5A');
  });
});
