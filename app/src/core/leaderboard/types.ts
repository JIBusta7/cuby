import type { ModeId } from '../game/modes';

export interface LeaderboardEntry {
  readonly id: string;
  readonly board: ModeId;
  readonly player: string;
  readonly score: number;
  readonly elapsedMs: number;
  readonly accuracy: number;
  /** ISO 8601. */
  readonly date: string;
  /** Firma de las reglas con que se jugó (ver rulesSignature). */
  readonly rules: string;
  /** 'real' o 'mock': las partidas simuladas se identifican en el ranking. */
  readonly source: 'real' | 'mock';
}

export type NewEntry = Omit<LeaderboardEntry, 'id' | 'date'> & { readonly date?: string };

/**
 * Persistencia de rankings. Hoy: localStorage del navegador. La interfaz es
 * asíncrona para poder cambiarla por un backend compartido (p. ej. Supabase)
 * sin tocar la UI ni el juego.
 */
export interface LeaderboardRepository {
  list(board: ModeId, limit?: number): Promise<LeaderboardEntry[]>;
  add(entry: NewEntry): Promise<{ entry: LeaderboardEntry; rank: number; total: number }>;
  clear(board?: ModeId): Promise<void>;
}
