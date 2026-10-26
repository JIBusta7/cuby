/**
 * Navegación entre pantallas como máquina de estados explícita: solo se
 * permiten las transiciones de la tabla. Así no se puede, por ejemplo, saltar
 * de la pantalla de juego al ranking sin pasar por los resultados.
 */
import { create } from 'zustand';
import type { ModeId } from '../core/game/modes';

export type Screen = 'home' | 'modes' | 'setup' | 'play' | 'results' | 'leaderboard' | 'settings' | 'lights';

export const TRANSITIONS: Readonly<Record<Screen, readonly Screen[]>> = {
  home: ['modes', 'leaderboard', 'settings', 'lights'],
  modes: ['home', 'setup', 'leaderboard', 'settings'],
  setup: ['modes', 'play', 'settings', 'home'],
  play: ['results', 'modes', 'home'],
  results: ['play', 'modes', 'leaderboard', 'home'],
  leaderboard: ['home', 'modes', 'results'],
  settings: ['home', 'modes', 'setup', 'lights'],
  lights: ['home', 'settings'],
};

export function canGo(from: Screen, to: Screen): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

interface AppStore {
  screen: Screen;
  /** Pantalla a la que vuelve "atrás" desde ranking o ajustes. */
  back: Screen;
  selectedMode: ModeId | null;
  leaderboardBoard: ModeId;
  go(to: Screen): boolean;
  selectMode(id: ModeId): void;
  showBoard(id: ModeId): void;
}

export const useApp = create<AppStore>((set, get) => ({
  screen: 'home',
  back: 'home',
  selectedMode: null,
  leaderboardBoard: 'precision',
  go(to) {
    const from = get().screen;
    if (!canGo(from, to)) {
      if (import.meta.env.DEV) console.warn(`[nav] transición no permitida: ${from} → ${to}`);
      return false;
    }
    set({ screen: to, back: to === 'leaderboard' || to === 'settings' ? from : get().back });
    return true;
  },
  selectMode(id) {
    set({ selectedMode: id, leaderboardBoard: id });
  },
  showBoard(id) {
    set({ leaderboardBoard: id });
  },
}));
