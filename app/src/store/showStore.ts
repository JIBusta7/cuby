/**
 * Modo LUCES: el cubo como objeto de luz, más allá del juego.
 *  - Demo:   efectos animados que corren en el ESP32 (con ciclo automático).
 *  - Sonido: reacciona al micrófono o al audio de una pestaña.
 *  - Música: Spotify da la canción; la tapa del disco da los colores y cada
 *            tema elige su efecto. El beat sale del audio real.
 * Este store decide qué mandar al cubo; los efectos están en core/leds/effects.
 */
import { create } from 'zustand';
import type { AudioFrame } from '../core/audio/analyzer';
import { extractPalette } from '../core/color/palette';
import { AUDIO_EFFECTS, DEFAULT_PALETTE, DEMO_EFFECTS, type Palette, type ShowEffect } from '../core/leds/effects';
import { hash4 } from '../core/leds/hash';
import { AudioEngine, type AudioSource, type AudioStatus } from '../audio/AudioEngine';
import {
  beginLogin,
  completeLogin,
  fetchCurrentlyPlaying,
  loadImagePixels,
  loadSaved,
  refreshTokens,
  save,
  SpotifyError,
  type SpotifyTokens,
  type Track,
} from '../spotify/spotify';
import { cubeLink } from './cubeStore';

export type ShowTab = 'demo' | 'sound' | 'music';

export const PALETTES: readonly { id: string; name: string; colors: Palette }[] = [
  { id: 'marca', name: 'CUBY', colors: DEFAULT_PALETTE },
  { id: 'fuego', name: 'Fuego', colors: [[255, 40, 0], [255, 140, 0], [255, 220, 40], [190, 0, 30]] },
  { id: 'oceano', name: 'Océano', colors: [[0, 80, 255], [0, 200, 255], [0, 255, 170], [40, 0, 200]] },
  { id: 'neon', name: 'Neón', colors: [[255, 0, 180], [0, 255, 255], [180, 0, 255], [255, 255, 0]] },
  { id: 'atardecer', name: 'Atardecer', colors: [[255, 80, 40], [255, 0, 120], [120, 0, 255], [255, 170, 60]] },
  { id: 'bosque', name: 'Bosque', colors: [[0, 255, 80], [120, 255, 0], [0, 160, 90], [200, 255, 120]] },
];

export const EFFECT_LABEL: Record<ShowEffect, { name: string; hint: string }> = {
  RAINBOW: { name: 'Arcoíris', hint: 'Ondas de color que recorren el cubo' },
  PLASMA: { name: 'Plasma', hint: 'Color líquido que se mezcla' },
  FIRE: { name: 'Fuego', hint: 'Llamas que suben por cada cara' },
  TWINKLE: { name: 'Estrellas', hint: 'Destellos que aparecen y se apagan' },
  BREATHE: { name: 'Respiración', hint: 'Todo el cubo late despacio' },
  RIPPLE: { name: 'Ondas', hint: 'Anillos desde el centro de cada cara' },
  SPIRAL: { name: 'Espiral', hint: 'Color que gira alrededor del centro' },
  RAIN: { name: 'Lluvia', hint: 'Gotas que caen por columnas' },
  CHASE: { name: 'Cometas', hint: 'Una estela que recorre los LEDs' },
  PARTY: { name: 'Fiesta', hint: 'Caras que se encienden al azar' },
  GRAVITY: { name: 'Gravedad', hint: 'El color sigue a la cara de arriba: girá el cubo' },
  SPECTRUM: { name: 'Espectro', hint: 'Una barra por frecuencia; el color cambia en cada bombo' },
  PULSE: { name: 'Pulso', hint: 'Late con los graves y destella en cada bombo' },
  RINGS: { name: 'Anillos', hint: 'Cada bombo lanza un anillo desde el centro' },
  KICK: { name: 'Bombo', hint: 'Todo el cubo cambia de color en cada golpe del bombo' },
  BURST: { name: 'Explosión', hint: 'Los graves inflan el color desde el centro' },
};

const AUTO_MS = 12_000;
const SEND_EVERY_MS = 33; // ~30 cuadros de audio por segundo hacia el cubo
const POLL_MS = 3_000;

/** Efecto para una canción: siempre el mismo para el mismo tema. */
export function effectForTrack(id: string, withAudio: boolean): ShowEffect {
  const pool: readonly ShowEffect[] = withAudio ? ['KICK', 'BURST', 'PULSE', 'RINGS', 'SPECTRUM'] : ['PLASMA', 'SPIRAL', 'RIPPLE', 'BREATHE', 'TWINKLE'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = hash4(h, id.charCodeAt(i), i, 7);
  return pool[h % pool.length]!;
}

interface ShowState {
  active: boolean;
  tab: ShowTab;
  demoEffect: ShowEffect;
  soundEffect: ShowEffect;
  musicEffect: ShowEffect;
  musicEffectLocked: boolean;
  auto: boolean;
  paletteId: string;
  palette: Palette;
  audioStatus: AudioStatus;
  audioSource: AudioSource | null;
  audioError: string | null;
  sensitivity: number;
  frame: AudioFrame | null;
  spotifyClientId: string;
  spotifyStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  spotifyError: string | null;
  track: Track | null;
  trackPalette: Palette | null;

  enter(): void;
  leave(): void;
  setTab(t: ShowTab): void;
  setEffect(e: ShowEffect): void;
  stepEffect(d: number): void;
  setAuto(on: boolean): void;
  setPalette(id: string): void;
  startAudio(src: AudioSource): Promise<void>;
  stopAudio(): Promise<void>;
  setSensitivity(v: number): void;
  setSpotifyClientId(id: string): void;
  connectSpotify(): Promise<void>;
  disconnectSpotify(): void;
  setMusicEffectLocked(on: boolean): void;
}

const engine = new AudioEngine();
let autoTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastSend = 0;
let pendingBeat = false;
let lastUiFrame = 0;
let lastPoll = 0;
let tokens: SpotifyTokens | null = loadSaved().tokens;

const currentEffect = (s: ShowState): ShowEffect =>
  s.tab === 'demo' ? s.demoEffect : s.tab === 'sound' ? s.soundEffect : s.musicEffect;
const currentPalette = (s: ShowState): Palette => (s.tab === 'music' && s.trackPalette ? s.trackPalette : s.palette);

function pushToCube(): void {
  const s = useShow.getState();
  if (!s.active) return;
  void cubeLink.send({ type: 'PAL', palette: currentPalette(s) }).catch(() => false);
  void cubeLink.send({ type: 'SHOW', effect: currentEffect(s) }).catch(() => false);
}

function restartAuto(): void {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
  const s = useShow.getState();
  if (!s.active || !s.auto || s.tab !== 'demo') return;
  autoTimer = setInterval(() => useShow.getState().stepEffect(1), AUTO_MS);
}

// Audio → UI (vúmetro) y → cubo (30 cuadros por segundo, el beat no se pierde entre cuadros).
engine.subscribe((frame, now) => {
  if (frame.beat) pendingBeat = true;
  if (now - lastUiFrame > 33) {
    lastUiFrame = now;
    useShow.setState({ frame });
  }
  if (now - lastSend >= SEND_EVERY_MS && useShow.getState().active) {
    if (cubeLink.sendLatest({ type: 'AUDIO', bands: frame.bands, beat: pendingBeat })) {
      lastSend = now;
      pendingBeat = false;
    }
  }
  // Con la pestaña en segundo plano los temporizadores se frenan; el audio no.
  if (useShow.getState().tab === 'music' && now - lastPoll > POLL_MS) void pollSpotify();
});
engine.onStatus = (e) => useShow.setState({ audioStatus: e.status, audioSource: e.source, audioError: e.error });

// Si el cubo se reconecta en medio del modo luces, se vuelve a mandar el efecto.
cubeLink.onChange((snap) => {
  if (snap.status === 'connected' && useShow.getState().active) setTimeout(pushToCube, 1500);
});

async function validTokens(): Promise<SpotifyTokens | null> {
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens;
  const { spotifyClientId } = useShow.getState();
  tokens = await refreshTokens(spotifyClientId, tokens);
  save({ clientId: spotifyClientId, tokens });
  return tokens;
}

async function applyTrack(track: Track | null): Promise<void> {
  const prev = useShow.getState().track;
  useShow.setState({ track });
  if (!track || track.id === prev?.id) return;
  let palette: Palette | null = null;
  if (track.imageUrl) {
    const px = await loadImagePixels(track.imageUrl);
    if (px) palette = extractPalette(px);
  }
  const s = useShow.getState();
  const musicEffect = s.musicEffectLocked ? s.musicEffect : effectForTrack(track.id, s.audioStatus === 'running');
  useShow.setState({ trackPalette: palette ?? s.trackPalette ?? DEFAULT_PALETTE, musicEffect });
  if (useShow.getState().tab === 'music') pushToCube();
}

async function pollSpotify(): Promise<void> {
  lastPoll = performance.now();
  if (useShow.getState().spotifyStatus !== 'connected') return;
  try {
    const t = await validTokens();
    if (!t) return;
    await applyTrack(await fetchCurrentlyPlaying(t.accessToken));
    if (useShow.getState().spotifyError) useShow.setState({ spotifyError: null });
  } catch (e) {
    const err = e as SpotifyError;
    if (err.code === 'expired' || err.code === 'auth') {
      tokens = null;
      save({ clientId: useShow.getState().spotifyClientId, tokens: null });
      useShow.setState({ spotifyStatus: 'error', spotifyError: 'La sesión de Spotify venció: conectá de nuevo' });
    } else {
      useShow.setState({ spotifyError: err.message });
    }
  }
}

function restartPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  const s = useShow.getState();
  if (!s.active || s.tab !== 'music' || s.spotifyStatus !== 'connected') return;
  void pollSpotify();
  pollTimer = setInterval(() => void pollSpotify(), POLL_MS);
}

const saved = loadSaved();

export const useShow = create<ShowState>((set, get) => ({
  active: false,
  tab: 'demo',
  demoEffect: 'RAINBOW',
  soundEffect: 'KICK',
  musicEffect: 'PLASMA',
  musicEffectLocked: false,
  auto: true,
  paletteId: 'marca',
  palette: DEFAULT_PALETTE,
  audioStatus: 'idle',
  audioSource: null,
  audioError: null,
  sensitivity: 1,
  frame: null,
  spotifyClientId: saved.clientId,
  spotifyStatus: saved.tokens ? 'connected' : 'disconnected',
  spotifyError: null,
  track: null,
  trackPalette: null,

  enter() {
    set({ active: true });
    pushToCube();
    restartAuto();
    restartPolling();
  },
  leave() {
    set({ active: false, frame: null });
    if (autoTimer) clearInterval(autoTimer);
    if (pollTimer) clearInterval(pollTimer);
    autoTimer = pollTimer = null;
    void engine.stop();
    void cubeLink.send({ type: 'ANIM', anim: 'IDLE' }).catch(() => false);
  },
  setTab(tab) {
    set({ tab });
    pushToCube();
    restartAuto();
    restartPolling();
  },
  setEffect(e) {
    const s = get();
    if (s.tab === 'demo') set({ demoEffect: e });
    else if (s.tab === 'sound') set({ soundEffect: e });
    else set({ musicEffect: e, musicEffectLocked: true });
    pushToCube();
    restartAuto();
  },
  stepEffect(d) {
    const s = get();
    const list: readonly ShowEffect[] = s.tab === 'sound' ? AUDIO_EFFECTS : s.tab === 'music' ? [...AUDIO_EFFECTS, ...DEMO_EFFECTS] : DEMO_EFFECTS;
    const i = list.indexOf(currentEffect(s));
    const next = list[(i + d + list.length) % list.length]!;
    if (s.tab === 'demo') set({ demoEffect: next });
    else if (s.tab === 'sound') set({ soundEffect: next });
    else set({ musicEffect: next, musicEffectLocked: true });
    pushToCube();
  },
  setAuto(auto) {
    set({ auto });
    restartAuto();
  },
  setPalette(id) {
    const p = PALETTES.find((x) => x.id === id);
    if (!p) return;
    set({ paletteId: id, palette: p.colors });
    pushToCube();
  },
  async startAudio(src) {
    engine.setSensitivity(get().sensitivity);
    await engine.start(src);
  },
  async stopAudio() {
    await engine.stop();
    set({ frame: null });
  },
  setSensitivity(v) {
    set({ sensitivity: v });
    engine.setSensitivity(v);
  },
  setSpotifyClientId(id) {
    const clientId = id.trim();
    set({ spotifyClientId: clientId });
    save({ clientId, tokens });
  },
  async connectSpotify() {
    set({ spotifyStatus: 'connecting', spotifyError: null });
    try {
      await beginLogin(get().spotifyClientId); // la página se va a Spotify y vuelve
    } catch (e) {
      set({ spotifyStatus: 'error', spotifyError: (e as Error).message });
    }
  },
  disconnectSpotify() {
    tokens = null;
    save({ clientId: get().spotifyClientId, tokens: null });
    set({ spotifyStatus: 'disconnected', track: null, trackPalette: null });
    restartPolling();
  },
  setMusicEffectLocked(on) {
    set({ musicEffectLocked: on });
    const s = get();
    if (!on && s.track) {
      set({ musicEffect: effectForTrack(s.track.id, s.audioStatus === 'running') });
      pushToCube();
    }
  },
}));

/** Al cargar la página: si volvemos del login de Spotify, termina el proceso. */
export async function handleSpotifyRedirect(): Promise<boolean> {
  try {
    const t = await completeLogin();
    if (!t) return false;
    tokens = t;
    useShow.setState({ spotifyStatus: 'connected', spotifyError: null, tab: 'music', spotifyClientId: loadSaved().clientId });
    return true;
  } catch (e) {
    useShow.setState({ spotifyStatus: 'error', spotifyError: (e as Error).message, tab: 'music' });
    return true;
  }
}
