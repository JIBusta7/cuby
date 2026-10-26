/**
 * Controlador de partidas: conecta la máquina de estados (core/game/session)
 * con el cubo, el reloj y el ranking. La lógica de juego vive en el core; acá
 * solo se alimentan eventos y se reacciona a los resultados.
 */
import { create } from 'zustand';
import { randomSeed } from '../core/color/rng';
import { MODES, type ModeDef, type ModeId } from '../core/game/modes';
import { createSession, step, type GameEvent, type Session } from '../core/game/session';
import { COUNTDOWN_MS } from '../core/game/timing';
import { GAME_COLOR_MODE } from '../transport/cubeLink';
import { useApp } from './appStore';
import { cubeLink } from './cubeStore';
import { useLeaderboard } from './leaderboardStore';
import { rulesFromSettings, useSettings } from './settingsStore';

export interface SaveInfo {
  readonly rank: number;
  readonly total: number;
  readonly record: boolean;
}

export interface Availability {
  readonly ok: boolean;
  readonly reason?: string;
}

/** ¿Se puede jugar este modo con el cubo conectado ahora? */
export function modeAvailability(mode: ModeDef): Availability {
  const st = cubeLink.state;
  if (mode.requires.length === 0 || st.kind === 'mock') return { ok: true };
  if (st.status !== 'connected') return { ok: true }; // se verifica al conectar
  const missing = mode.requires.filter((c) => !st.caps.includes(c));
  if (missing.length > 0) return { ok: false, reason: 'Necesita el firmware v2 del cubo' };
  if (mode.id === 'physical' && !useSettings.getState().faceMapConfirmed) {
    return { ok: false, reason: 'Primero identificá las caras en Ajustes' };
  }
  return { ok: true };
}

interface GameStore {
  session: Session | null;
  /** Esperando que el cubo confirme la cuenta regresiva. */
  starting: boolean;
  saved: SaveInfo | null;
  error: string | null;
  start(modeId: ModeId, player: string): Promise<void>;
  capture(): void;
  quit(): void;
  replay(): Promise<void>;
}

let raf = 0;
let finishHandled = false;

function dispatch(e: GameEvent): void {
  const s = useGame.getState().session;
  if (!s || s.phase === 'finished') return;
  const next = step(s, e);
  if (next !== s) useGame.setState({ session: next });
  if (next.phase === 'finished' && !finishHandled) {
    finishHandled = true;
    void onFinished(next);
  }
}

function loop(): void {
  dispatch({ type: 'TICK', at: performance.now() });
  const s = useGame.getState().session;
  raf = s && s.phase !== 'finished' ? requestAnimationFrame(loop) : 0;
}

async function onFinished(s: Session): Promise<void> {
  cancelAnimationFrame(raf);
  raf = 0;
  const r = s.result;
  if (!r) return;
  const celebrate = r.outcome === 'win' || (r.outcome === 'captured' && r.accuracy >= 85);
  if (s.mode.id === 'physical') await cubeLink.send({ type: 'TARGET', rgb: null }).catch(() => false);
  await cubeLink.send({ type: 'ANIM', anim: celebrate ? 'WIN' : 'FAIL' }).catch(() => false);

  let saved: SaveInfo | null = null;
  if (r.ranked) {
    const res = await useLeaderboard.getState().add({
      board: s.mode.id,
      player: s.player,
      score: r.score,
      elapsedMs: r.elapsedMs,
      accuracy: r.accuracy,
      rules: r.rules,
      source: cubeLink.state.kind,
    });
    // Récord: primer puesto superando al menos a otra partida.
    if (res) saved = { rank: res.rank, total: res.total, record: res.rank === 1 && res.total > 1 };
  }
  useGame.setState({ saved });
  if (r.reason === 'quit') return; // salir no muestra resultados
  // Un instante para ver el final en pantalla antes de los resultados.
  setTimeout(() => {
    if (useGame.getState().session === s || useGame.getState().session?.result === r) useApp.getState().go('results');
  }, r.outcome === 'captured' ? 350 : 900);
}

// El cubo alimenta la partida.
cubeLink.onSample((sample) => dispatch({ type: 'SAMPLE', at: sample.at, rgb: sample.playerRgb }));
cubeLink.onButton((ev) => {
  if (ev === 'short') useGame.getState().capture();
});
cubeLink.onChange((snap) => {
  if (snap.status !== 'connected') dispatch({ type: 'ABORT', at: performance.now(), reason: 'disconnected' });
});

export const useGame = create<GameStore>((set, get) => ({
  session: null,
  starting: false,
  saved: null,
  error: null,

  async start(modeId, player) {
    if (get().starting) return;
    const mode = MODES[modeId];
    const avail = modeAvailability(mode);
    if (!cubeLink.connected) {
      set({ error: 'Conectá el cubo (o el simulador) para jugar' });
      return;
    }
    if (!avail.ok) {
      set({ error: avail.reason ?? 'Modo no disponible' });
      return;
    }
    cancelAnimationFrame(raf);
    finishHandled = false;
    const settings = useSettings.getState();
    settings.set({ playerName: player, lastMode: modeId });
    const draft = createSession({
      mode,
      rules: rulesFromSettings(settings),
      player,
      seed: randomSeed(),
      colorMode: GAME_COLOR_MODE,
      now: performance.now(),
    });
    set({ starting: true, session: null, saved: null, error: null });
    useApp.getState().go('play');
    try {
      if (mode.id === 'physical') await cubeLink.send({ type: 'TARGET', rgb: draft.targets[0] ?? null });
      else await cubeLink.send({ type: 'TARGET', rgb: null });
      // La cuenta regresiva arranca cuando el cubo confirmó el comando: así
      // pantalla y LEDs cuentan juntos (el desfase es la latencia de un paquete BLE).
      await cubeLink.send({ type: 'ANIM', anim: 'COUNT' });
    } catch (e) {
      set({ starting: false, error: (e as Error).message });
      useApp.getState().go('modes');
      return;
    }
    const t = performance.now();
    set({ starting: false, session: { ...draft, countdownStart: t, playStart: t + COUNTDOWN_MS, now: t } });
    raf = requestAnimationFrame(loop);
  },

  capture() {
    dispatch({ type: 'CAPTURE', at: performance.now() });
  },

  quit() {
    const s = get().session;
    if (s && s.phase !== 'finished') dispatch({ type: 'ABORT', at: performance.now(), reason: 'quit' });
    cancelAnimationFrame(raf);
    raf = 0;
    void cubeLink.send({ type: 'TARGET', rgb: null }).catch(() => false);
    void cubeLink.send({ type: 'ANIM', anim: 'IDLE' }).catch(() => false);
    set({ session: null, starting: false });
  },

  async replay() {
    const s = get().session;
    const modeId = s?.mode.id ?? useApp.getState().selectedMode;
    if (!modeId) return;
    await get().start(modeId, s?.player ?? useSettings.getState().playerName);
  },
}));

/** Al salir de resultados, el cubo vuelve a su animación de espera. */
export function backToIdle(): void {
  useGame.setState({ session: null, saved: null });
  void cubeLink.send({ type: 'ANIM', anim: 'IDLE' }).catch(() => false);
}
