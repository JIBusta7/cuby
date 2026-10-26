import { describe, expect, it } from 'vitest';
import { AudioAnalyzer, BAND_EDGES_HZ } from './analyzer';

const SR = 48000;
const FFT = 2048;
const BINS = FFT / 2;
const binOf = (hz: number) => Math.round(hz / (SR / FFT));

/** Espectro sintético: ruido bajo + picos en las frecuencias dadas. */
function spectrum(peaks: Record<number, number | undefined>, noise = 20): Uint8Array {
  const s = new Uint8Array(BINS).fill(noise);
  for (const [hz, v] of Object.entries(peaks)) {
    if (v === undefined) continue;
    const b = binOf(Number(hz));
    for (let k = b - 3; k <= b + 3; k++) if (k >= 0 && k < BINS) s[k] = v;
  }
  return s;
}

function run(a: AudioAnalyzer, frames: number, at: (i: number) => Uint8Array, dt = 1000 / 60) {
  const out = [];
  for (let i = 0; i < frames; i++) out.push({ t: i * dt, ...a.process(at(i), i * dt) });
  return out;
}

describe('AudioAnalyzer', () => {
  it('ubica un tono en la banda que corresponde', () => {
    const a = new AudioAnalyzer({ sampleRate: SR, fftSize: FFT });
    run(a, 30, () => spectrum({}, 20));
    const f = run(a, 60, () => spectrum({ 1500: 200 })).at(-1)!;
    const max = f.bands.indexOf(Math.max(...f.bands));
    expect(BAND_EDGES_HZ[max]).toBeLessThanOrEqual(1500);
    expect(BAND_EDGES_HZ[max + 1]).toBeGreaterThan(1500);
    expect(f.bands[max]).toBeGreaterThan(150);
  });

  it('en silencio las bandas caen a cero y no hay beats', () => {
    const a = new AudioAnalyzer({ sampleRate: SR, fftSize: FFT });
    run(a, 60, () => spectrum({ 60: 180, 3000: 150 }));
    const frames = run(a, 240, () => spectrum({}, 0));
    expect(frames.at(-1)!.level).toBeLessThan(10);
    expect(frames.slice(30).some((f) => f.beat)).toBe(false);
  });

  it('detecta un bombo a 120 BPM y estima el tempo', () => {
    const a = new AudioAnalyzer({ sampleRate: SR, fftSize: FFT });
    const kick = (i: number) => {
      const t = (i * 1000) / 60;
      const inKick = t % 500 < 70; // golpe de graves cada 500 ms
      return spectrum(inKick ? { 60: 230, 120: 200, 2500: 90 } : { 2500: 90 }, 25);
    };
    const frames = run(a, 60 * 8, kick);
    const beats = frames.filter((f) => f.beat).map((f) => f.t);
    expect(beats.length).toBeGreaterThanOrEqual(13);
    expect(beats.length).toBeLessThanOrEqual(17);
    expect(frames.at(-1)!.bpm).toBeGreaterThanOrEqual(115);
    expect(frames.at(-1)!.bpm).toBeLessThanOrEqual(125);
  });

  it('reacciona al bombo y no a los hi-hats ni a un bajo sostenido', () => {
    const a = new AudioAnalyzer({ sampleRate: SR, fftSize: FFT });
    // 128 BPM: bombo cada ~469 ms, hi-hat cada ~117 ms, bajo sostenido de fondo.
    const song = (i: number) => {
      const t = (i * 1000) / 60;
      const kick = t % 469 < 60;
      const hat = t % 117 < 25;
      return spectrum({ 55: kick ? 240 : 0, 110: kick ? 210 : 140, 180: 150, ...(hat ? { 9000: 220 } : {}), 1200: 120 }, 25);
    };
    const frames = run(a, 60 * 10, song);
    const beats = frames.filter((f) => f.beat).map((f) => f.t);
    const kicks = Math.floor((10 * 1000) / 469);
    expect(beats.length).toBeGreaterThanOrEqual(kicks - 3); // casi todos los bombos
    expect(beats.length).toBeLessThanOrEqual(kicks + 1); // y no los hi-hats (serían ~85)
    expect(frames.at(-1)!.bpm).toBeGreaterThanOrEqual(124);
    expect(frames.at(-1)!.bpm).toBeLessThanOrEqual(132);
  });

  it('solo hi-hats: no hay beats', () => {
    const a = new AudioAnalyzer({ sampleRate: SR, fftSize: FFT });
    const frames = run(a, 60 * 4, (i) => spectrum({ 110: 140, ...((i * 1000) / 60 % 117 < 25 ? { 9000: 230 } : {}) }, 25));
    expect(frames.filter((f) => f.beat)).toHaveLength(0);
  });

  it('el graves sube con el golpe y cae rápido', () => {
    const a = new AudioAnalyzer({ sampleRate: SR, fftSize: FFT });
    const frames = run(a, 60 * 3, (i) => spectrum((i * 1000) / 60 % 500 < 60 ? { 60: 240 } : {}, 25));
    const last = frames.slice(-30).map((f) => f.bands[0]!);
    expect(Math.max(...last)).toBeGreaterThan(180);
    expect(Math.min(...last)).toBeLessThan(40);
  });

  it('un nivel parejo sin golpes no dispara beats', () => {
    const a = new AudioAnalyzer({ sampleRate: SR, fftSize: FFT });
    const frames = run(a, 60 * 4, () => spectrum({ 60: 180, 500: 160 }, 30));
    expect(frames.filter((f) => f.beat)).toHaveLength(0);
  });

  it('la sensibilidad escala la respuesta', () => {
    const lo = new AudioAnalyzer({ sampleRate: SR, fftSize: FFT, sensitivity: 0.5 });
    const hi = new AudioAnalyzer({ sampleRate: SR, fftSize: FFT, sensitivity: 2 });
    const sig = (i: number) => spectrum(i % 20 < 10 ? { 800: 120 } : {}, 20);
    const a = run(lo, 120, sig).at(-1)!.level;
    const b = run(hi, 120, sig).at(-1)!.level;
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
