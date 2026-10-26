import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FACE_AXES } from '../core/orientation/faces';
import { CubeLink } from './cubeLink';

// El simulador usa setInterval y performance.now: alcanza con el reloj real.
describe('CubeLink', () => {
  let link: CubeLink;
  afterEach(async () => {
    await link?.disconnect();
    vi.useRealTimers();
  });

  it('dos connect() superpuestos dejan un solo transporte emitiendo', async () => {
    link = new CubeLink({ brightness: 26, faceAxes: DEFAULT_FACE_AXES, faceMapConfirmed: false });
    const samples: number[] = [];
    link.onSample((s) => samples.push(s.at));
    await Promise.all([link.connect('mock'), link.connect('mock')]);
    expect(link.connected).toBe(true);
    samples.length = 0;
    await new Promise((r) => setTimeout(r, 520));
    // 30 Hz durante ~0,5 s: unas 15 muestras. Con dos transportes serían ~30.
    expect(samples.length).toBeGreaterThanOrEqual(12);
    expect(samples.length).toBeLessThanOrEqual(19);
  });

  it('hace el handshake: lee las capacidades del firmware', async () => {
    link = new CubeLink({ brightness: 26, faceAxes: DEFAULT_FACE_AXES, faceMapConfirmed: false });
    await link.connect('mock');
    await vi.waitFor(() => expect(link.state.caps).toEqual(['anim', 'target', 'fmap', 'show', 'ota']), { timeout: 2000 });
    expect(link.supports('anim')).toBe(true);
    // El espejo de LEDs quedó en IDLE tras el handshake.
    await vi.waitFor(() => expect(link.ledState().anim).toBe('IDLE'), { timeout: 2000 });
  });

  it('no manda comandos que el firmware no declara', async () => {
    link = new CubeLink({ brightness: 26, faceAxes: DEFAULT_FACE_AXES, faceMapConfirmed: false });
    expect(await link.send({ type: 'ANIM', anim: 'WIN' })).toBe(false); // sin conexión
  });
});
