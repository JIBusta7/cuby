import { create } from 'zustand';
import { DEFAULT_RULES, isModeId, type GameRules, type ModeId } from '../core/game/modes';
import { DEFAULT_FACE_AXES, isValidFaceMap, type FaceAxes } from '../core/orientation/faces';
import type { TransportKind } from '../transport/types';
import { loadJson, saveJson } from './persist';

export type MotionPreference = 'system' | 'reduce' | 'full';

/** Brillo máximo del firmware: 76/255 = 30 %. */
export const MAX_BRIGHTNESS = 76;

export interface Settings {
  playerName: string;
  transport: TransportKind;
  motion: MotionPreference;
  brightness: number;
  matchThreshold: number;
  matchHoldMs: number;
  speedThreshold: number;
  speedHoldMs: number;
  faceAxes: FaceAxes;
  faceMapConfirmed: boolean;
  lastMode: ModeId | null;
}

const DEFAULTS: Settings = {
  playerName: '',
  transport: 'mock',
  motion: 'system',
  brightness: 26,
  matchThreshold: DEFAULT_RULES.matchThreshold,
  matchHoldMs: DEFAULT_RULES.matchHoldMs,
  speedThreshold: DEFAULT_RULES.speedThreshold,
  speedHoldMs: DEFAULT_RULES.speedHoldMs,
  faceAxes: DEFAULT_FACE_AXES,
  faceMapConfirmed: false,
  lastMode: null,
};

const KEY = 'rgbcube.settings.v1';

function isSettingsLike(v: unknown): v is Partial<Settings> {
  return typeof v === 'object' && v !== null;
}

function sanitize(raw: Partial<Settings>): Settings {
  const num = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  return {
    playerName: typeof raw.playerName === 'string' ? raw.playerName.slice(0, 16) : DEFAULTS.playerName,
    transport: raw.transport === 'real' ? 'real' : 'mock',
    motion: raw.motion === 'reduce' || raw.motion === 'full' ? raw.motion : 'system',
    brightness: num(raw.brightness, 0, MAX_BRIGHTNESS, DEFAULTS.brightness),
    matchThreshold: num(raw.matchThreshold, 70, 99, DEFAULTS.matchThreshold),
    matchHoldMs: num(raw.matchHoldMs, 0, 2000, DEFAULTS.matchHoldMs),
    speedThreshold: num(raw.speedThreshold, 70, 99, DEFAULTS.speedThreshold),
    speedHoldMs: num(raw.speedHoldMs, 0, 2000, DEFAULTS.speedHoldMs),
    faceAxes: Array.isArray(raw.faceAxes) && isValidFaceMap(raw.faceAxes) ? raw.faceAxes : DEFAULTS.faceAxes,
    faceMapConfirmed: raw.faceMapConfirmed === true,
    lastMode: isModeId(raw.lastMode) ? raw.lastMode : null,
  };
}

interface SettingsStore extends Settings {
  set(patch: Partial<Settings>): void;
  resetRules(): void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...sanitize(loadJson(KEY, {}, isSettingsLike)),
  set(patch) {
    set(sanitize({ ...get(), ...patch }));
    const { set: _s, resetRules: _r, ...data } = get();
    saveJson(KEY, data);
  },
  resetRules() {
    get().set({
      matchThreshold: DEFAULTS.matchThreshold,
      matchHoldMs: DEFAULTS.matchHoldMs,
      speedThreshold: DEFAULTS.speedThreshold,
      speedHoldMs: DEFAULTS.speedHoldMs,
    });
  },
}));

export function rulesFromSettings(s: Settings): GameRules {
  return {
    ...DEFAULT_RULES,
    matchThreshold: s.matchThreshold,
    matchHoldMs: s.matchHoldMs,
    speedThreshold: s.speedThreshold,
    speedHoldMs: s.speedHoldMs,
  };
}
