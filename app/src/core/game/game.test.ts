import { describe, expect, it } from 'vitest';
import { colorAccuracy } from '../color/accuracy';
import { DEFAULT_RULES, MODES, rulesSignature } from './modes';
import { compareEntries, formatTime, scoreFor } from './scoring';
import { createSession, currentTarget, holdProgress, step, type Session } from './session';
import { COUNTDOWN_MS } from './timing';

const T0 = 10_000;
const PLAY = T0 + COUNTDOWN_MS;

function start(modeId: keyof typeof MODES, seed = 42): Session {
  return createSession({ mode: MODES[modeId], rules: DEFAULT_RULES, player: 'Ana', seed, colorMode: 0, now: T0 });
}

/** Alimenta muestras cada 50 ms (20 Hz, como el firmware) entre `from` y `to`. */
function feed(s: Session, from: number, to: number, rgb: (s: Session) => readonly [number, number, number]): Session {
  let cur = s;
  for (let t = from; t <= to && cur.phase !== 'finished'; t += 50) cur = step(cur, { type: 'SAMPLE', at: t, rgb: rgb(cur) });
  return cur;
}

const exact = (s: Session) => currentTarget(s)!;
const far = (s: Session): readonly [number, number, number] => {
  const t = currentTarget(s)!;
  return [255 - t[0], 255 - t[1], 255 - t[2]];
};

describe('ciclo de una partida', () => {
  it('empieza en cuenta regresiva y pasa a jugando al terminarla', () => {
    let s = start('precision');
    expect(s.phase).toBe('countdown');
    s = step(s, { type: 'TICK', at: PLAY - 1 });
    expect(s.phase).toBe('countdown');
    s = step(s, { type: 'TICK', at: PLAY });
    expect(s.phase).toBe('playing');
  });
  it('genera la cantidad de objetivos del modo', () => {
    expect(start('speed-hard').targets).toHaveLength(10);
    expect(start('precision').targets).toHaveLength(1);
  });
  it('ignora eventos después de terminar', () => {
    let s = feed(start('timed'), PLAY, PLAY + 2000, exact);
    expect(s.phase).toBe('finished');
    const again = step(s, { type: 'SAMPLE', at: PLAY + 3000, rgb: [0, 0, 0] });
    expect(again).toBe(s);
    s = step(s, { type: 'ABORT', at: PLAY + 4000, reason: 'quit' });
    expect(s.result?.outcome).toBe('win');
  });
});

describe('Precision Challenge', () => {
  it('captura la precisión de la última lectura válida', () => {
    let s = feed(start('precision'), PLAY, PLAY + 1000, exact);
    s = step(s, { type: 'CAPTURE', at: PLAY + 1010 });
    expect(s.result).toMatchObject({ outcome: 'captured', accuracy: 100, ranked: true, score: 10000 });
    expect(s.result?.elapsedMs).toBe(1010);
  });
  it('no captura durante la cuenta regresiva ni con datos viejos', () => {
    let s = feed(start('precision'), T0, T0 + 500, exact);
    s = step(s, { type: 'CAPTURE', at: T0 + 600 });
    expect(s.phase).toBe('countdown');
    s = feed(s, PLAY, PLAY + 100, exact);
    s = step(s, { type: 'CAPTURE', at: PLAY + 100 + DEFAULT_RULES.staleMs + 1 });
    expect(s.result).toBeNull();
  });
  it('si se acaba el tiempo, captura la última lectura', () => {
    const limit = MODES.precision.timeLimitMs;
    let s = feed(start('precision'), PLAY, PLAY + limit - 50, far);
    s = step(s, { type: 'TICK', at: PLAY + limit });
    expect(s.result).toMatchObject({ outcome: 'captured', timeUp: true, elapsedMs: limit, ranked: true });
  });
});

describe('Timed Match', () => {
  it('exige sostener el umbral; una caída reinicia la estabilidad', () => {
    let s = feed(start('timed'), PLAY, PLAY + 300, exact); // 300 ms < 500 ms
    expect(s.result).toBeNull();
    expect(holdProgress(s)).toBeGreaterThan(0.5);
    s = step(s, { type: 'SAMPLE', at: PLAY + 350, rgb: far(s) });
    expect(s.holdSince).toBeNull();
    s = feed(s, PLAY + 400, PLAY + 2000, exact);
    expect(s.result).toMatchObject({ outcome: 'win', ranked: true });
    expect(s.result?.elapsedMs).toBe(900); // 400 + 500 ms de estabilidad
  });
  it('tiempo agotado = derrota, no entra al ranking', () => {
    const limit = MODES.timed.timeLimitMs;
    let s = feed(start('timed'), PLAY, PLAY + limit - 50, far);
    s = step(s, { type: 'TICK', at: PLAY + limit });
    expect(s.result).toMatchObject({ outcome: 'timeout', ranked: false, score: 0 });
  });
  it('se anula si el cubo deja de mandar datos', () => {
    let s = feed(start('timed'), PLAY, PLAY + 500, far);
    s = step(s, { type: 'TICK', at: PLAY + 500 + DEFAULT_RULES.signalLostMs + 1 });
    expect(s.result).toMatchObject({ outcome: 'aborted', reason: 'signal', ranked: false });
  });
  it('se anula al desconectarse', () => {
    const s = step(feed(start('timed'), PLAY, PLAY + 200, far), { type: 'ABORT', at: PLAY + 250, reason: 'disconnected' });
    expect(s.result).toMatchObject({ outcome: 'aborted', reason: 'disconnected' });
  });
});

describe('Speed Challenge', () => {
  it('avanza solo por la secuencia y registra los parciales', () => {
    let s = start('speed-medium');
    s = feed(s, PLAY, PLAY + 10_000, exact);
    expect(s.result).toMatchObject({ outcome: 'win', completed: 5, total: 5, accuracy: 100 });
    expect(s.splits.map((x) => x.index)).toEqual([0, 1, 2, 3, 4]);
    // 300 ms de estabilidad por objetivo, muestras cada 50 ms
    expect(s.result!.elapsedMs).toBeLessThan(5 * 400);
  });
  it('la lectura se re-evalúa contra el objetivo nuevo al avanzar', () => {
    let s = start('speed-easy');
    s = feed(s, PLAY, PLAY + 300, exact);
    expect(s.index).toBe(1);
    expect(s.current!.accuracy).toBeCloseTo(colorAccuracy(s.current!.rgb, currentTarget(s)!), 9);
    expect(s.current!.accuracy).toBeLessThan(100);
  });
});

describe('puntaje y ranking', () => {
  it('los puntos respetan el criterio del ranking', () => {
    expect(scoreFor(MODES.precision, { elapsedMs: 5000, accuracy: 97.32 })).toBe(9732);
    expect(scoreFor(MODES.timed, { elapsedMs: 6000, accuracy: 96 })).toBe(9000);
    expect(scoreFor(MODES.timed, { elapsedMs: 99_000, accuracy: 96 })).toBe(0);
  });
  it('ordena por precisión con desempate por tiempo, o por tiempo', () => {
    const a = { accuracy: 98, elapsedMs: 9000, date: '2026-01-01' };
    const b = { accuracy: 98, elapsedMs: 4000, date: '2026-01-02' };
    const c = { accuracy: 99, elapsedMs: 20000, date: '2026-01-03' };
    expect([a, b, c].sort((x, y) => compareEntries('accuracy-desc', x, y))).toEqual([c, b, a]);
    expect([a, b, c].sort((x, y) => compareEntries('time-asc', x, y))).toEqual([b, a, c]);
  });
  it('la firma de reglas distingue umbrales', () => {
    expect(rulesSignature(MODES.timed, DEFAULT_RULES)).not.toBe(
      rulesSignature(MODES.timed, { ...DEFAULT_RULES, matchThreshold: 90 }),
    );
    expect(rulesSignature(MODES.precision, DEFAULT_RULES)).toBe(
      rulesSignature(MODES.precision, { ...DEFAULT_RULES, matchThreshold: 90 }),
    );
  });
  it('formatTime', () => {
    expect(formatTime(12_345)).toBe('12.3');
    expect(formatTime(75_000)).toBe('1:15.0');
  });
});
