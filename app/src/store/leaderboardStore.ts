import { create } from 'zustand';
import type { ModeId } from '../core/game/modes';
import { browserStore, LocalLeaderboardRepository } from '../core/leaderboard/localRepository';
import type { LeaderboardEntry, LeaderboardRepository, NewEntry } from '../core/leaderboard/types';

/** Punto único para cambiar la persistencia (p. ej. a Supabase). */
export const leaderboardRepository: LeaderboardRepository = new LocalLeaderboardRepository(browserStore());

interface LeaderboardStore {
  boards: Partial<Record<ModeId, LeaderboardEntry[]>>;
  error: string | null;
  load(board: ModeId): Promise<void>;
  add(entry: NewEntry): Promise<{ entry: LeaderboardEntry; rank: number; total: number } | null>;
  clear(board?: ModeId): Promise<void>;
}

export const useLeaderboard = create<LeaderboardStore>((set, get) => ({
  boards: {},
  error: null,
  async load(board) {
    try {
      const list = await leaderboardRepository.list(board);
      set({ boards: { ...get().boards, [board]: list }, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
  async add(entry) {
    try {
      const r = await leaderboardRepository.add(entry);
      await get().load(entry.board);
      return r;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },
  async clear(board) {
    await leaderboardRepository.clear(board);
    set({ boards: board ? { ...get().boards, [board]: [] } : {} });
  },
}));
