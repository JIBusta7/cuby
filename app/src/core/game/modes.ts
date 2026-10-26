/**
 * Catálogo de modos de juego y reglas configurables.
 *
 * Tres mecánicas base:
 *  - capture:  el jugador decide cuándo confirmar (SPACE o toque). Gana la precisión.
 *  - hold:     hay que llegar a un umbral y sostenerlo un instante. Gana el tiempo.
 *  - sequence: varios objetivos seguidos con la regla `hold`. Gana el tiempo total.
 */
import { DEFAULT_ACCURACY, type AccuracyParams } from '../color/accuracy';
import type { Capability } from '../protocol/commands';

export type ModeId = 'precision' | 'timed' | 'physical' | 'speed-easy' | 'speed-medium' | 'speed-hard';
export type ModeKind = 'capture' | 'hold' | 'sequence';
export type Category = 'color-match' | 'speed';

export interface ModeDef {
  readonly id: ModeId;
  readonly category: Category;
  readonly kind: ModeKind;
  readonly title: string;
  readonly tagline: string;
  /** Reglas en una línea para la pantalla de preparación. */
  readonly rules: readonly string[];
  readonly targets: number;
  /** false = el objetivo se muestra solo en el cubo (Physical Target). */
  readonly targetOnScreen: boolean;
  /** Capacidades del firmware necesarias con el cubo real. */
  readonly requires: readonly Capability[];
  readonly timeLimitMs: number;
  readonly ranking: 'accuracy-desc' | 'time-asc';
}

export interface GameRules {
  readonly accuracy: AccuracyParams;
  /** Umbral y estabilidad para Timed Match y Physical Target. */
  readonly matchThreshold: number;
  readonly matchHoldMs: number;
  /** Umbral y estabilidad para Speed Challenge (más corto para mantener el ritmo). */
  readonly speedThreshold: number;
  readonly speedHoldMs: number;
  /** Una lectura más vieja que esto no se puede capturar ni cuenta para sostener. */
  readonly staleMs: number;
  /** Sin datos del cubo durante este tiempo, el intento se anula. */
  readonly signalLostMs: number;
  /**
   * Inclinación máxima (respecto de la posición de reposo) que puede pedir un
   * objetivo. La cara 6 es la inferior y por ahí sale el cable de
   * alimentación: dar vuelta el cubo del todo es incómodo, así que los
   * objetivos no lo exigen.
   */
  readonly maxTiltDeg: number;
}

export const DEFAULT_RULES: GameRules = {
  accuracy: DEFAULT_ACCURACY,
  matchThreshold: 95,
  matchHoldMs: 500,
  speedThreshold: 90,
  speedHoldMs: 300,
  staleMs: 600,
  signalLostMs: 2500,
  maxTiltDeg: 110,
};

/** Distancia OKLab mínima entre objetivos consecutivos y respecto del color de reposo. */
export const TARGET_MIN_DISTANCE = 0.15;

export const MODES: Readonly<Record<ModeId, ModeDef>> = {
  precision: {
    id: 'precision',
    category: 'color-match',
    kind: 'capture',
    title: 'Precision Challenge',
    tagline: 'Sin apuro. Clavá el color.',
    rules: ['Girá el cubo hasta igualar el color', 'Cuando estés conforme, presioná SPACE', 'Gana la precisión; el tiempo desempata'],
    targets: 1,
    targetOnScreen: true,
    requires: [],
    timeLimitMs: 45_000,
    ranking: 'accuracy-desc',
  },
  timed: {
    id: 'timed',
    category: 'color-match',
    kind: 'hold',
    title: 'Timed Match',
    tagline: 'Llegá al 95 % antes que nadie.',
    rules: ['Girá el cubo hasta igualar el color', 'Sostené la precisión un instante', 'Gana el menor tiempo'],
    targets: 1,
    targetOnScreen: true,
    requires: [],
    timeLimitMs: 60_000,
    ranking: 'time-asc',
  },
  physical: {
    id: 'physical',
    category: 'color-match',
    kind: 'hold',
    title: 'Physical Target',
    tagline: 'El objetivo vive en el cubo.',
    rules: ['La cara de arriba del cubo muestra el objetivo', 'Las demás caras muestran tu color', 'Igualalas y sostené: gana el menor tiempo'],
    targets: 1,
    targetOnScreen: false,
    requires: ['anim', 'target'],
    timeLimitMs: 60_000,
    ranking: 'time-asc',
  },
  'speed-easy': {
    id: 'speed-easy',
    category: 'speed',
    kind: 'sequence',
    title: 'Easy',
    tagline: '3 colores',
    rules: ['Igualá cada color de la secuencia', 'Al llegar, pasa solo al siguiente', 'Gana el menor tiempo total'],
    targets: 3,
    targetOnScreen: true,
    requires: [],
    timeLimitMs: 60_000,
    ranking: 'time-asc',
  },
  'speed-medium': {
    id: 'speed-medium',
    category: 'speed',
    kind: 'sequence',
    title: 'Medium',
    tagline: '5 colores',
    rules: ['Igualá cada color de la secuencia', 'Al llegar, pasa solo al siguiente', 'Gana el menor tiempo total'],
    targets: 5,
    targetOnScreen: true,
    requires: [],
    timeLimitMs: 100_000,
    ranking: 'time-asc',
  },
  'speed-hard': {
    id: 'speed-hard',
    category: 'speed',
    kind: 'sequence',
    title: 'Hard',
    tagline: '10 colores',
    rules: ['Igualá cada color de la secuencia', 'Al llegar, pasa solo al siguiente', 'Gana el menor tiempo total'],
    targets: 10,
    targetOnScreen: true,
    requires: [],
    timeLimitMs: 180_000,
    ranking: 'time-asc',
  },
};

export const MODE_ORDER: readonly ModeId[] = ['precision', 'timed', 'physical', 'speed-easy', 'speed-medium', 'speed-hard'];

export function isModeId(v: unknown): v is ModeId {
  return typeof v === 'string' && v in MODES;
}

export function thresholdFor(mode: ModeDef, rules: GameRules): { threshold: number; holdMs: number } {
  return mode.kind === 'sequence'
    ? { threshold: rules.speedThreshold, holdMs: rules.speedHoldMs }
    : { threshold: rules.matchThreshold, holdMs: rules.matchHoldMs };
}

/**
 * Firma de las reglas que afectan el resultado. Se guarda con cada puntaje: si
 * alguien cambia el umbral, el ranking lo marca en vez de mezclar partidas
 * jugadas con reglas distintas sin avisar.
 */
export function rulesSignature(mode: ModeDef, rules: GameRules): string {
  const a = `ok${rules.accuracy.tolerance}/${rules.accuracy.range}`;
  if (mode.kind === 'capture') return a;
  const { threshold, holdMs } = thresholdFor(mode, rules);
  return `${a}·${threshold}%/${holdMs}ms`;
}
