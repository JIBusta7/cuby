import { MODES, isModeId, type ModeId } from '../game/modes';
import { compareEntries } from '../game/scoring';
import type { LeaderboardEntry, LeaderboardRepository, NewEntry } from './types';

/** Almacenamiento mínimo (localStorage o un doble en memoria para tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'rgbcube.leaderboard.v1';
const MAX_PER_BOARD = 100;

function isEntry(v: unknown): v is LeaderboardEntry {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    isModeId(o.board) &&
    typeof o.player === 'string' &&
    typeof o.score === 'number' &&
    typeof o.elapsedMs === 'number' &&
    typeof o.accuracy === 'number' &&
    typeof o.date === 'string' &&
    typeof o.rules === 'string' &&
    (o.source === 'real' || o.source === 'mock')
  );
}

export function sortBoard(board: ModeId, entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return entries
    .filter((e) => e.board === board)
    .sort((a, b) => compareEntries(MODES[board].ranking, a, b));
}

export class LocalLeaderboardRepository implements LeaderboardRepository {
  constructor(private readonly store: KeyValueStore | null) {}

  private readAll(): LeaderboardEntry[] {
    if (!this.store) return [];
    try {
      const raw = this.store.getItem(KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch {
      return [];
    }
  }

  private writeAll(entries: readonly LeaderboardEntry[]): void {
    if (!this.store) throw new Error('El almacenamiento local no está disponible');
    this.store.setItem(KEY, JSON.stringify(entries));
  }

  async list(board: ModeId, limit = MAX_PER_BOARD): Promise<LeaderboardEntry[]> {
    return sortBoard(board, this.readAll()).slice(0, limit);
  }

  async add(input: NewEntry): Promise<{ entry: LeaderboardEntry; rank: number; total: number }> {
    const entry: LeaderboardEntry = {
      ...input,
      player: input.player.trim().slice(0, 16) || 'Jugador',
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      date: input.date ?? new Date().toISOString(),
    };
    const all = this.readAll();
    const board = sortBoard(entry.board, [...all, entry]);
    const rank = board.findIndex((e) => e.id === entry.id) + 1;
    const kept = board.slice(0, MAX_PER_BOARD);
    this.writeAll([...all.filter((e) => e.board !== entry.board), ...kept]);
    return { entry, rank, total: board.length };
  }

  async clear(board?: ModeId): Promise<void> {
    if (!this.store) return;
    if (!board) {
      this.store.removeItem(KEY);
      return;
    }
    this.writeAll(this.readAll().filter((e) => e.board !== board));
  }
}

export function browserStore(): KeyValueStore | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__rgbcube_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
