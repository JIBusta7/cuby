/**
 * Puntaje y orden de los rankings.
 *
 *  Precision Challenge (gana la precisión):
 *    puntos = round(precisión × 100)          → 97,32 % = 9732 pts
 *    orden: precisión ↓, tiempo ↑, fecha ↑
 *
 *  Timed Match, Physical Target y Speed Challenge (gana el tiempo):
 *    puntos = round(10 000 × (1 − tiempo / tiempo límite))
 *    orden: tiempo ↑, precisión ↓, fecha ↑
 *
 * Los puntos son una lectura amigable del mismo criterio que ordena el
 * ranking: nunca contradicen el orden.
 */
import type { ModeDef } from './modes';

export function scoreFor(mode: ModeDef, r: { elapsedMs: number; accuracy: number }): number {
  if (mode.ranking === 'accuracy-desc') return Math.round(Math.max(0, Math.min(100, r.accuracy)) * 100);
  const frac = Math.max(0, Math.min(1, r.elapsedMs / mode.timeLimitMs));
  return Math.round(10_000 * (1 - frac));
}

export interface Rankable {
  readonly accuracy: number;
  readonly elapsedMs: number;
  readonly date: string;
}

export function compareEntries(ranking: ModeDef['ranking'], a: Rankable, b: Rankable): number {
  const byAcc = b.accuracy - a.accuracy;
  const byTime = a.elapsedMs - b.elapsedMs;
  const byDate = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  if (ranking === 'accuracy-desc') return byAcc || byTime || byDate;
  return byTime || byAcc || byDate;
}

export function formatTime(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const d = Math.floor((total % 1000) / 100);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}.${d}` : `${s}.${d}`;
}
