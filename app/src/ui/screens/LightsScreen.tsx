/**
 * LUCES: el cubo como lámpara y visualizador, fuera del juego.
 * Demo (efectos), Sonido (micrófono / pestaña) y Música (Spotify + beat real).
 */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { AUDIO_EFFECTS, DEMO_EFFECTS, type ShowEffect } from '../../core/leds/effects';
import { useApp } from '../../store/appStore';
import { useCube } from '../../store/cubeStore';
import { EFFECT_LABEL, PALETTES, useShow, type ShowTab } from '../../store/showStore';
import { redirectUri } from '../../spotify/spotify';
import { isWebBluetoothAvailable } from '../../transport/RealCubeTransport';
import { Button, KeyCap } from '../components/Button';
import { ConnectionPill } from '../components/ConnectionPill';
import { AudioMeter, EffectPreview, PaletteSwatch } from '../components/LightsBits';
import { BackButton, Screen } from '../components/Screen';
import { useKeys } from '../hooks/useKeys';
import { CubeView } from '../three/CubeView';

const TABS: { id: ShowTab; label: string; sub: string }[] = [
  { id: 'demo', label: 'Demo', sub: '11 efectos' },
  { id: 'sound', label: 'Sonido', sub: 'al ritmo del bombo' },
  { id: 'music', label: 'Música', sub: 'Spotify + beat' },
];

export function LightsScreen() {
  const go = useApp((s) => s.go);
  const show = useShow();
  const { status, kind, caps, connect } = useCube();
  const connected = status === 'connected';
  const noShowFw = connected && kind === 'real' && !caps.includes('show');

  useEffect(() => {
    show.enter();
    return () => useShow.getState().leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (connected) useShow.getState().enter();
  }, [connected]);

  useKeys({
    Escape: () => go('home'),
    '1': () => show.setTab('demo'),
    '2': () => show.setTab('sound'),
    '3': () => show.setTab('music'),
    ArrowRight: () => show.stepEffect(1),
    ArrowLeft: () => show.stepEffect(-1),
    a: () => show.tab === 'demo' && show.setAuto(!show.auto),
  });

  const palette = show.tab === 'music' && show.trackPalette ? show.trackPalette : show.palette;

  return (
    <Screen className="bg-night">
      <header className="flex items-center justify-between px-10 pt-8">
        <BackButton onClick={() => go('home')} />
        <div className="flex flex-col items-center">
          <h1 className="font-display text-[44px] leading-none font-bold tracking-tight">LUCES</h1>
          <span className="mt-1 text-sm font-semibold text-white/55">el cubo, más allá del juego</span>
        </div>
        <ConnectionPill onClick={() => go('settings')} />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[560px_1fr] gap-8 px-10 pt-4 pb-8">
        <div className="flex min-h-0 flex-col items-center">
          <CubeView className="h-[600px] w-full" glow interactive={kind === 'mock'} distance={3.9} />
          <div className="mt-2 flex items-center gap-3 text-sm font-semibold text-white/60">
            <PaletteSwatch colors={palette} />
            <span>{show.tab === 'music' && show.trackPalette ? 'Colores de la tapa del disco' : 'Paleta'}</span>
            {kind === 'mock' && show.tab === 'demo' && show.demoEffect === 'GRAVITY' && <span>· arrastrá el cubo</span>}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-5">
          <nav className="grid grid-cols-3 gap-3" aria-label="Modos de luces">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={show.tab === t.id}
                onClick={() => show.setTab(t.id)}
                className={`chunk flex cursor-pointer flex-col items-start rounded-3xl px-6 py-4 text-left ${show.tab === t.id ? 'bg-sun text-night' : 'bg-night-3 text-white'}`}
              >
                <span className="flex w-full items-center justify-between font-display text-2xl font-bold">
                  {t.label}
                  <KeyCap className="h-7 min-w-7 text-xs">{i + 1}</KeyCap>
                </span>
                <span className="text-sm font-semibold opacity-70">{t.sub}</span>
              </button>
            ))}
          </nav>

          {!connected && (
            <div className="flex items-center gap-3 rounded-3xl bg-sun/20 px-5 py-4 font-semibold">
              <span className="flex-1">Conectá el cubo o el simulador para ver los efectos.</span>
              <Button tone="white" size="sm" disabled={!isWebBluetoothAvailable()} onClick={() => connect('real')}>
                Conectar cubo
              </Button>
              <Button tone="grape" size="sm" onClick={() => connect('mock')}>
                Simulador
              </Button>
            </div>
          )}
          {noShowFw && (
            <div className="rounded-3xl bg-coral/30 px-5 py-4 font-semibold">
              El firmware del cubo no tiene el modo luces. Cargale el firmware nuevo (entorno esp32dev).
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={show.tab}
              className="flex min-h-0 flex-1 flex-col gap-5"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              {show.tab === 'demo' && <DemoPanel />}
              {show.tab === 'sound' && <SoundPanel />}
              {show.tab === 'music' && <MusicPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Screen>
  );
}

function EffectGrid({ effects, current, cols }: { effects: readonly ShowEffect[]; current: ShowEffect; cols: number }) {
  const { setEffect, palette, trackPalette, tab } = useShow();
  const pal = tab === 'music' && trackPalette ? trackPalette : palette;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {effects.map((e) => (
        <button
          key={e}
          type="button"
          aria-pressed={current === e}
          title={EFFECT_LABEL[e].hint}
          onClick={() => setEffect(e)}
          className={`flex cursor-pointer items-center gap-3 rounded-2xl p-2.5 pr-3 text-left transition-colors ${current === e ? 'bg-white text-night ring-4 ring-sun' : 'bg-night-2 text-white hover:bg-night-3'}`}
        >
          <EffectPreview effect={e} palette={pal} size={52} />
          <span className="min-w-0">
            <span className="block truncate font-display text-lg leading-tight font-bold">{EFFECT_LABEL[e].name}</span>
            <span className={`block truncate text-xs font-semibold ${current === e ? 'text-night/60' : 'text-white/45'}`}>{EFFECT_LABEL[e].hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function PalettePicker() {
  const { paletteId, setPalette } = useShow();
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTES.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={paletteId === p.id}
          onClick={() => setPalette(p.id)}
          className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${paletteId === p.id ? 'bg-white text-night' : 'bg-night-2 text-white/80 hover:bg-night-3'}`}
        >
          <PaletteSwatch colors={p.colors} size={16} />
          {p.name}
        </button>
      ))}
    </div>
  );
}

function DemoPanel() {
  const { demoEffect, auto, setAuto } = useShow();
  return (
    <>
      <EffectGrid effects={DEMO_EFFECTS} current={demoEffect} cols={3} />
      <div className="flex items-center justify-between gap-4">
        <PalettePicker />
        <button
          type="button"
          aria-pressed={auto}
          onClick={() => setAuto(!auto)}
          className={`chunk-sm flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl px-4 py-3 font-display font-bold ${auto ? 'bg-mint text-night' : 'bg-night-3 text-white'}`}
        >
          {auto ? '● Automático' : '○ Automático'}
          <KeyCap className="h-7 min-w-7 text-xs">A</KeyCap>
        </button>
      </div>
      <p className="text-sm font-semibold text-white/45">← → cambian de efecto. En automático pasa al siguiente cada 12 segundos.</p>
    </>
  );
}

function AudioControls({ compact = false }: { compact?: boolean }) {
  const { audioStatus, audioSource, audioError, startAudio, stopAudio, sensitivity, setSensitivity } = useShow();
  const running = audioStatus === 'running';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button tone={running && audioSource === 'mic' ? 'mint' : 'white'} size={compact ? 'sm' : 'md'} onClick={() => void startAudio('mic')}>
          🎙 Micrófono
        </Button>
        <Button tone={running && audioSource === 'tab' ? 'mint' : 'white'} size={compact ? 'sm' : 'md'} onClick={() => void startAudio('tab')}>
          🔊 Audio de una pestaña
        </Button>
        {running && (
          <Button tone="night" size={compact ? 'sm' : 'md'} onClick={() => void stopAudio()}>
            Detener
          </Button>
        )}
        <label className="ml-auto flex items-center gap-3 text-sm font-semibold text-white/70">
          Sensibilidad
          <input
            type="range"
            className="range-chunk w-32"
            min={0.5}
            max={2.5}
            step={0.1}
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            aria-label="Sensibilidad"
          />
        </label>
      </div>
      {audioStatus === 'starting' && <p className="text-sm font-semibold text-sun">Esperando permiso…</p>}
      {audioError && <p className="rounded-2xl bg-coral/25 px-4 py-2 text-sm font-semibold">{audioError}</p>}
      {!running && !audioError && !compact && (
        <p className="text-sm font-semibold text-white/45">
          Micrófono: escucha el ambiente (música, aplausos, voces). Pestaña: elegí la pestaña donde suena la música y tildá
          “Compartir audio”; es más preciso que el micrófono.
        </p>
      )}
    </div>
  );
}

function SoundPanel() {
  const { soundEffect, frame, palette } = useShow();
  return (
    <>
      <AudioControls />
      <AudioMeter frame={frame} palette={palette} />
      <EffectGrid effects={AUDIO_EFFECTS} current={soundEffect} cols={3} />
      <p className="-mt-2 text-sm font-semibold text-white/45">
        El cubo cambia de color en cada golpe del bombo. Si reacciona de más o de menos, ajustá la sensibilidad.
      </p>
      <PalettePicker />
    </>
  );
}

function MusicPanel() {
  const s = useShow();
  const [clientId, setClientId] = useState(s.spotifyClientId);
  const onLocalhost = typeof location !== 'undefined' && location.hostname === 'localhost';
  const connected = s.spotifyStatus === 'connected';
  return (
    <>
      <div className="flex gap-5 rounded-3xl bg-night-2 p-5">
        {connected ? (
          s.track ? (
            <>
              {s.track.imageUrl ? (
                <img src={s.track.imageUrl} alt="" className="h-36 w-36 shrink-0 rounded-2xl object-cover" crossOrigin="anonymous" />
              ) : (
                <div className="h-36 w-36 shrink-0 rounded-2xl bg-night-3" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="font-display text-sm font-bold tracking-[0.2em] text-mint">{s.track.isPlaying ? 'SONANDO EN SPOTIFY' : 'EN PAUSA'}</span>
                <span className="truncate font-display text-3xl leading-tight font-bold">{s.track.name}</span>
                <span className="truncate text-lg font-semibold text-white/70">{s.track.artists}</span>
                <div className="mt-auto flex items-center gap-3">
                  {s.trackPalette && <PaletteSwatch colors={s.trackPalette} size={24} />}
                  <span className="text-sm font-semibold text-white/60">
                    Efecto: <b className="text-white">{EFFECT_LABEL[s.musicEffect].name}</b>
                  </span>
                  <button
                    type="button"
                    onClick={() => s.setMusicEffectLocked(!s.musicEffectLocked)}
                    className="cursor-pointer rounded-lg bg-white/10 px-2 py-1 text-xs font-bold hover:bg-white/20"
                  >
                    {s.musicEffectLocked ? '🔒 fijo' : '🎲 uno por tema'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col gap-2">
              <span className="font-display text-2xl font-bold">Spotify conectado</span>
              <span className="font-semibold text-white/60">Poné algo en Spotify (en cualquier dispositivo) y aparece acá en unos segundos.</span>
            </div>
          )
        ) : (
          <div className="flex flex-1 flex-col gap-3">
            <span className="font-display text-2xl font-bold">Conectá Spotify</span>
            <ol className="list-decimal space-y-1 pl-5 text-sm font-semibold text-white/70">
              <li>
                Entrá a <b>developer.spotify.com/dashboard</b> y creá una app (Web API).
              </li>
              <li>
                En Redirect URIs agregá exactamente <code className="rounded bg-night px-1.5 py-0.5 text-sun">{redirectUri()}</code>
              </li>
              <li>Copiá el Client ID y pegalo acá.</li>
            </ol>
            <div className="flex gap-3">
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                onBlur={() => s.setSpotifyClientId(clientId)}
                placeholder="Client ID"
                aria-label="Client ID de Spotify"
                className="h-12 flex-1 rounded-2xl bg-night px-4 font-mono text-sm text-white outline-none focus:ring-2 focus:ring-sun"
              />
              {onLocalhost ? (
                <Button tone="sun" size="sm" onClick={() => location.assign(location.href.replace('//localhost', '//127.0.0.1'))}>
                  Abrir en 127.0.0.1
                </Button>
              ) : (
                <Button
                  tone="mint"
                  size="sm"
                  disabled={s.spotifyStatus === 'connecting'}
                  onClick={() => {
                    s.setSpotifyClientId(clientId);
                    void s.connectSpotify();
                  }}
                >
                  Conectar Spotify
                </Button>
              )}
            </div>
            {onLocalhost && (
              <p className="text-xs font-semibold text-white/50">
                Spotify no acepta “localhost”: la app tiene que abrirse en 127.0.0.1 (los rankings y ajustes se guardan aparte en cada dirección).
              </p>
            )}
          </div>
        )}
      </div>
      {s.spotifyError && <p className="rounded-2xl bg-coral/25 px-4 py-2 text-sm font-semibold">{s.spotifyError}</p>}
      <div className="flex flex-col gap-3 rounded-3xl bg-night-2 p-5">
        <span className="font-display text-lg font-bold">
          Beat {s.audioStatus === 'running' ? <span className="text-mint">· escuchando</span> : <span className="text-white/50">· sin audio, efecto tranquilo</span>}
        </span>
        <p className="-mt-2 text-sm font-semibold text-white/50">
          Spotify no comparte los beats de las canciones con apps nuevas: el cubo los detecta escuchando la música.
        </p>
        <AudioControls compact />
        <AudioMeter frame={s.frame} palette={s.trackPalette ?? s.palette} />
      </div>
      {connected && (
        <button type="button" onClick={s.disconnectSpotify} className="w-fit cursor-pointer text-sm font-semibold text-white/50 underline-offset-4 hover:underline">
          Desconectar Spotify
        </button>
      )}
    </>
  );
}
