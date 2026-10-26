/**
 * Máquina de estados de una partida. Funciones puras: (estado, evento) → estado.
 * No conoce React, el Bluetooth ni el reloj: el tiempo llega en cada evento.
 *
 *   countdown ──(t ≥ inicio)──▶ playing ──▶ finished
 *        │                        │
 *        └──────── ABORT ─────────┘──▶ finished (outcome: aborted)
 *
 * Victoria, derrota y límites:
 *  - capture:  CAPTURE con una lectura fresca → `captured`. Si se acaba el
 *              tiempo se captura la última lectura válida (`captured`, timeUp).
 *  - hold:     precisión ≥ umbral sostenida `holdMs` → `win`. Tiempo = momento
 *              en que se completa la estabilidad. Tiempo agotado → `timeout`.
 *  - sequence: igual que hold por cada objetivo; al completar el último → `win`.
 *  - Sin datos del cubo durante `signalLostMs` o desconexión → `aborted`.
 *  Solo `win` y `captured` entran al ranking.
 */
import { colorAccuracy } from '../color/accuracy';
import { createRng } from '../color/rng';
import { generateSequence } from '../color/targets';
import type { ColorModeId, RGB } from '../color/types';
import { TARGET_MIN_DISTANCE, rulesSignature, thresholdFor, type GameRules, type ModeDef } from './modes';
import { scoreFor } from './scoring';
import { COUNTDOWN_MS } from './timing';

export type Phase = 'countdown' | 'playing' | 'finished';
export type Outcome = 'win' | 'captured' | 'timeout' | 'aborted';
export type AbortReason = 'disconnected' | 'signal' | 'quit';

export interface Reading {
  readonly rgb: RGB;
  /** Precisión respecto del objetivo actual. */
  readonly accuracy: number;
  readonly at: number;
}

export interface Split {
  readonly index: number;
  /** ms desde el inicio de la partida. */
  readonly atMs: number;
  readonly accuracy: number;
  readonly rgb: RGB;
}

export interface GameResult {
  readonly outcome: Outcome;
  readonly reason: AbortReason | null;
  readonly timeUp: boolean;
  readonly elapsedMs: number;
  readonly accuracy: number;
  readonly completed: number;
  readonly total: number;
  readonly finalColor: RGB | null;
  readonly ranked: boolean;
  readonly score: number;
  readonly rules: string;
}

export interface Session {
  readonly mode: ModeDef;
  readonly rules: GameRules;
  readonly player: string;
  readonly seed: number;
  readonly colorMode: ColorModeId;
  readonly targets: readonly RGB[];
  readonly phase: Phase;
  readonly countdownStart: number;
  readonly playStart: number;
  readonly now: number;
  readonly index: number;
  readonly holdSince: number | null;
  readonly current: Reading | null;
  readonly bestAccuracy: number;
  readonly splits: readonly Split[];
  readonly result: GameResult | null;
}

export type GameEvent =
  | { readonly type: 'TICK'; readonly at: number }
  | { readonly type: 'SAMPLE'; readonly at: number; readonly rgb: RGB }
  | { readonly type: 'CAPTURE'; readonly at: number }
  | { readonly type: 'ABORT'; readonly at: number; readonly reason: AbortReason };

export interface NewSession {
  readonly mode: ModeDef;
  readonly rules: GameRules;
  readonly player: string;
  readonly seed: number;
  readonly colorMode: ColorModeId;
  readonly now: number;
}

export function createSession(p: NewSession): Session {
  const targets = generateSequence(createRng(p.seed), p.colorMode, p.mode.targets, {
    minDistance: TARGET_MIN_DISTANCE,
    minUpZ: Math.cos((p.rules.maxTiltDeg * Math.PI) / 180),
  }).map((t) => t.rgb);
  return {
    mode: p.mode,
    rules: p.rules,
    player: p.player,
    seed: p.seed,
    colorMode: p.colorMode,
    targets,
    phase: 'countdown',
    countdownStart: p.now,
    playStart: p.now + COUNTDOWN_MS,
    now: p.now,
    index: 0,
    holdSince: null,
    current: null,
    bestAccuracy: 0,
    splits: [],
    result: null,
  };
}

export function currentTarget(s: Session): RGB | null {
  return s.targets[Math.min(s.index, s.targets.length - 1)] ?? null;
}

/** ms de juego transcurridos (0 durante la cuenta regresiva). */
export function elapsedMs(s: Session): number {
  if (s.result) return s.result.elapsedMs;
  return Math.max(0, Math.min(s.now, s.playStart + s.mode.timeLimitMs) - s.playStart);
}

export function remainingMs(s: Session): number {
  return Math.max(0, s.mode.timeLimitMs - elapsedMs(s));
}

export function isFresh(s: Session, at: number): boolean {
  return s.current !== null && at - s.current.at <= s.rules.staleMs;
}

/** 0..1: cuánto falta para completar la estabilidad (para la UI). */
export function holdProgress(s: Session): number {
  if (s.holdSince === null || s.mode.kind === 'capture') return 0;
  const { holdMs } = thresholdFor(s.mode, s.rules);
  return Math.min(1, Math.max(0, (s.now - s.holdSince) / holdMs));
}

function finish(
  s: Session,
  at: number,
  outcome: Outcome,
  opts: { reason?: AbortReason; elapsed?: number; accuracy?: number; timeUp?: boolean; splits?: readonly Split[] } = {},
): Session {
  const elapsed = Math.max(0, Math.min(opts.elapsed ?? at - s.playStart, s.mode.timeLimitMs));
  const splits = opts.splits ?? s.splits;
  const completed = outcome === 'win' ? s.targets.length : splits.length;
  const accuracy =
    opts.accuracy ??
    (splits.length > 0 ? splits.reduce((m, x) => m + x.accuracy, 0) / splits.length : (s.current?.accuracy ?? 0));
  const ranked = outcome === 'win' || outcome === 'captured';
  const result: GameResult = {
    outcome,
    reason: opts.reason ?? null,
    timeUp: opts.timeUp ?? false,
    elapsedMs: elapsed,
    accuracy,
    completed,
    total: s.targets.length,
    finalColor: s.current?.rgb ?? null,
    ranked,
    score: ranked ? scoreFor(s.mode, { elapsedMs: elapsed, accuracy }) : 0,
    rules: rulesSignature(s.mode, s.rules),
  };
  return { ...s, now: at, phase: 'finished', splits, holdSince: null, result };
}

/** Avanza el reloj: inicio de la partida, tiempo límite, pérdida de señal. */
function tick(s: Session, at: number): Session {
  let next: Session = { ...s, now: Math.max(s.now, at) };
  if (next.phase === 'countdown' && at >= next.playStart) next = { ...next, phase: 'playing' };
  if (next.phase !== 'playing') return next;

  const limitAt = next.playStart + next.mode.timeLimitMs;
  if (at >= limitAt) {
    if (next.mode.kind === 'capture') {
      return next.current
        ? finish(next, at, 'captured', { elapsed: next.mode.timeLimitMs, accuracy: next.current.accuracy, timeUp: true })
        : finish(next, at, 'aborted', { reason: 'signal', elapsed: next.mode.timeLimitMs });
    }
    return finish(next, at, 'timeout', { elapsed: next.mode.timeLimitMs });
  }

  // La señal se mide desde el inicio del juego: la cuenta regresiva no cuenta.
  const lastData = Math.max(next.current?.at ?? -Infinity, next.playStart);
  if (at - lastData > next.rules.signalLostMs) return finish(next, at, 'aborted', { reason: 'signal' });
  if (next.holdSince !== null && !isFresh(next, at)) next = { ...next, holdSince: null };
  return next;
}

function sample(s: Session, at: number, rgb: RGB): Session {
  const target = currentTarget(s);
  if (!target) return s;
  const accuracy = colorAccuracy(rgb, target, s.rules.accuracy);
  let next: Session = { ...s, current: { rgb, accuracy, at } };
  if (next.phase !== 'playing') return next;
  next = { ...next, bestAccuracy: Math.max(next.bestAccuracy, accuracy) };
  if (next.mode.kind === 'capture') return next;

  const { threshold, holdMs } = thresholdFor(next.mode, next.rules);
  if (accuracy < threshold) return { ...next, holdSince: null };
  const holdSince = next.holdSince ?? at;
  if (at - holdSince < holdMs) return { ...next, holdSince };

  // Objetivo completado.
  const split: Split = { index: next.index, atMs: at - next.playStart, accuracy, rgb };
  const splits = [...next.splits, split];
  if (next.mode.kind === 'hold' || next.index + 1 >= next.targets.length) {
    return finish({ ...next, splits }, at, 'win', { splits });
  }
  const advanced: Session = { ...next, splits, index: next.index + 1, holdSince: null };
  const nextTarget = currentTarget(advanced);
  // La lectura actual se re-evalúa contra el objetivo nuevo.
  return nextTarget
    ? { ...advanced, current: { rgb, accuracy: colorAccuracy(rgb, nextTarget, s.rules.accuracy), at } }
    : advanced;
}

export function step(s: Session, e: GameEvent): Session {
  if (s.phase === 'finished') return s;
  // Todo evento hace correr el reloj primero (puede terminar la partida).
  const t = tick(s, e.at);
  if (t.phase === 'finished') return t;
  switch (e.type) {
    case 'TICK':
      return t;
    case 'SAMPLE':
      return sample(t, e.at, e.rgb);
    case 'CAPTURE':
      if (t.phase !== 'playing' || t.mode.kind !== 'capture' || !t.current || !isFresh(t, e.at)) return t;
      return finish(t, e.at, 'captured', { accuracy: t.current.accuracy });
    case 'ABORT':
      return finish(t, e.at, 'aborted', { reason: e.reason, elapsed: t.phase === 'playing' ? e.at - t.playStart : 0 });
  }
}
