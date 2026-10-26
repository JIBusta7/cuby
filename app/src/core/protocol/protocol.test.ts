import { describe, expect, it } from 'vitest';
import { encodeCommand } from './commands';
import { LineAssembler } from './lineAssembler';
import { encodeCompact, encodeData, parseMessage } from './messages';

describe('encodeCommand', () => {
  it('codifica los comandos del firmware v1', () => {
    expect(encodeCommand({ type: 'CAL' })).toBe('CAL');
    expect(encodeCommand({ type: 'MODE', mode: 2 })).toBe('MODE 2');
    expect(encodeCommand({ type: 'BRI', value: 300 })).toBe('BRI 255');
    expect(encodeCommand({ type: 'COLOR', rgb: [1.4, 256, -3] })).toBe('COLOR 1 255 0');
  });
  it('codifica los comandos del firmware v2', () => {
    expect(encodeCommand({ type: 'ANIM', anim: 'COUNT' })).toBe('ANIM COUNT');
    expect(encodeCommand({ type: 'TARGET', rgb: [10, 20, 30] })).toBe('TARGET 10 20 30');
    expect(encodeCommand({ type: 'TARGET', rgb: null })).toBe('TARGET OFF');
    expect(encodeCommand({ type: 'LIGHT', face: 9 })).toBe('LIGHT 6');
    expect(encodeCommand({ type: 'FMAP', axes: ['+Z', '+X', '+Y', '-X', '-Y', '-Z'] })).toBe('FMAP +Z +X +Y -X -Y -Z');
    expect(() => encodeCommand({ type: 'FMAP', axes: ['+Z'] })).toThrow();
  });
});

describe('parseMessage', () => {
  it('lee un paquete de datos real del firmware', () => {
    const m = parseMessage(
      '{"t":"d","x":0.00,"y":-0.00,"z":1.00,"roll":-0.4,"pitch":0.1,"yaw":0.0,"rgb":[127,127,254],"btn":0,"state":0,"mode":0}',
    );
    expect(m).toMatchObject({ t: 'd', rgb: [127, 127, 254], btn: false, mode: 0 });
    if (m?.t === 'd') expect(m.up.z).toBeCloseTo(1);
  });
  it('normaliza el vector redondeado a 2 decimales', () => {
    const m = parseMessage('{"t":"d","x":0.58,"y":0.58,"z":0.58,"rgb":[1,2,3],"mode":0}');
    expect(m?.t).toBe('d');
    if (m?.t === 'd') expect(Math.hypot(m.up.x, m.up.y, m.up.z)).toBeCloseTo(1, 9);
  });
  it('descarta líneas inválidas', () => {
    expect(parseMessage('basura')).toBeNull();
    expect(parseMessage('{"t":"d","x":0,"y":0,"z":0,"rgb":[1,2,3]}')).toBeNull();
    expect(parseMessage('{"t":"d","x":0,"y":0,"z":1,"rgb":[1,2]}')).toBeNull();
    expect(parseMessage('{"t":"d","x":0,"y":0,"z":1,"rgb":[1,2,300]}')).toBeNull();
    expect(parseMessage('{"t":"zzz"}')).toBeNull();
    expect(parseMessage('{"t":"d",')).toBeNull();
  });
  it('lee eventos, acks e info (filtrando capacidades desconocidas)', () => {
    expect(parseMessage('{"t":"btn","ev":"short","rgb":[1,2,3]}')).toEqual({ t: 'btn', ev: 'short' });
    expect(parseMessage('{"t":"err","cmd":"ANIM"}')).toEqual({ t: 'err', cmd: 'ANIM' });
    expect(parseMessage('{"t":"info","fw":2,"caps":["anim","laser","target"]}')).toEqual({
      t: 'info',
      fw: 2,
      caps: ['anim', 'target'],
    });
  });
  it('lee la lectura compacta del firmware v2 (una notificación BLE)', () => {
    const m = parseMessage('d7-707,12,707,1');
    expect(m).toMatchObject({ t: 'd', seq: 7, btn: true, mode: 0 });
    if (m?.t === 'd') {
      expect(m.up.x).toBeCloseTo(-0.7071, 3);
      expect(m.up.z).toBeCloseTo(0.7071, 3);
      expect(m.rgb).toEqual([37, 129, 217]); // y = 12/999 → (0,012 + 1) · 127,5 = 129
    }
    expect('d9-999,-999,-999,5\n'.length).toBeLessThanOrEqual(20); // peor caso entra en MTU 23
    expect(parseMessage('d1999,0,0,4')).toMatchObject({ mode: 2 });
  });
  it('descarta lecturas compactas inválidas', () => {
    for (const bad of ['d', 'd1', 'd10,0,999,0x', 'dx0,0,999,0', 'd10,0,0,0', 'd10,0,999,6', 'd11000,0,0,0']) {
      expect(parseMessage(bad)).toBeNull();
    }
  });
  it('encodeCompact y parseMessage son inversas', () => {
    const line = encodeCompact({ x: 0.6, y: 0, z: 0.8 }, 13, false, 0);
    expect(line).toBe('d3599,0,799,0');
    expect(parseMessage(line)).toMatchObject({ t: 'd', seq: 3, btn: false });
  });
  it('lee la línea de estado (reinicios del sensor) y el JSON del v1', () => {
    expect(parseMessage('{"t":"s","ie":3,"fw":2}')).toEqual({ t: 's', imuResets: 3, fw: 2 });
    expect(parseMessage('{"t":"d","x":0,"y":0,"z":1,"rgb":[1,2,3],"mode":0}')).toMatchObject({ seq: null, imuResets: null });
  });
  it('encodeData y parseMessage son inversas', () => {
    const line = encodeData({
      up: { x: 0.6, y: 0, z: 0.8 },
      roll: 1,
      pitch: 2,
      yaw: 3,
      rgb: [204, 127, 229],
      btn: true,
      state: 4,
      mode: 0,
    });
    expect(parseMessage(line)).toMatchObject({ t: 'd', rgb: [204, 127, 229], btn: true, state: 4 });
  });
});

describe('LineAssembler', () => {
  it('reensambla líneas partidas en varios paquetes', () => {
    const a = new LineAssembler();
    expect(a.push('{"t":"po')).toEqual([]);
    expect(a.push('ng"}\n{"t":"cal"}\n{"t"')).toEqual(['{"t":"pong"}', '{"t":"cal"}']);
    expect(a.push(':"pong"}\r\n')).toEqual(['{"t":"pong"}']);
  });
  it('descarta basura sin fin de línea', () => {
    const a = new LineAssembler(16);
    a.push('x'.repeat(40));
    expect(a.push('ok\n')).toEqual(['ok']);
  });
});
