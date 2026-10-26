import { motion } from 'motion/react';
import { useState } from 'react';
import { MODES, thresholdFor } from '../../core/game/modes';
import { formatTime } from '../../core/game/scoring';
import { useApp } from '../../store/appStore';
import { useCube } from '../../store/cubeStore';
import { modeAvailability, useGame } from '../../store/gameStore';
import { rulesFromSettings, useSettings } from '../../store/settingsStore';
import { isWebBluetoothAvailable } from '../../transport/RealCubeTransport';
import { Button } from '../components/Button';
import { ConnectionPill } from '../components/ConnectionPill';
import { IconPlay } from '../components/Icons';
import { BackButton, Screen } from '../components/Screen';
import { FloatingShapes } from '../components/Shapes';
import { useKeys } from '../hooks/useKeys';
import { PALETTE } from '../theme/palette';

const SHAPES = [
  { kind: 'triangle', color: PALETTE.sun, size: 180, x: '6%', y: '58%', rotate: 12 },
  { kind: 'circle', color: PALETTE.coral, size: 140, x: '86%', y: '12%' },
  { kind: 'diamond', color: PALETTE.mint, size: 120, x: '84%', y: '70%' },
  { kind: 'square', color: PALETTE.grape, size: 110, x: '9%', y: '12%', rotate: -10 },
] as const;

export function PlayerSetupScreen() {
  const go = useApp((s) => s.go);
  const modeId = useApp((s) => s.selectedMode) ?? 'precision';
  const mode = MODES[modeId];
  const settings = useSettings();
  const { status, connect, kind } = useCube();
  const { start, starting, error } = useGame();
  const [name, setName] = useState(settings.playerName);
  const connected = status === 'connected';
  const avail = modeAvailability(mode);
  const clean = name.trim();
  const canStart = connected && avail.ok && clean.length > 0 && !starting;
  const rules = rulesFromSettings(settings);
  const { threshold, holdMs } = thresholdFor(mode, rules);

  const begin = () => {
    if (canStart) void start(modeId, clean);
  };
  useKeys({ Enter: begin, Escape: () => go('modes') });

  return (
    <Screen className="bg-ocean">
      <FloatingShapes shapes={SHAPES} />
      <header className="relative z-10 flex items-center justify-between px-10 pt-8">
        <BackButton onClick={() => go('modes')} />
        <ConnectionPill onClick={() => go('settings')} />
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center">
        <motion.div
          className="chunk flex w-[760px] flex-col gap-7 rounded-[44px] bg-white p-12 text-night"
          initial={{ scale: 0.9, opacity: 0, rotate: -1.5 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-4 py-1.5 font-display text-sm font-bold tracking-wide ${mode.category === 'speed' ? 'bg-coral' : 'bg-grape text-white'}`}>
              {mode.category === 'speed' ? 'SPEED CHALLENGE' : 'COLOR MATCH'}
            </span>
            <span className="font-display text-3xl font-bold tracking-tight">{mode.title}</span>
          </div>

          <label className="flex flex-col gap-3">
            <span className="font-display text-[44px] leading-none font-bold tracking-tight">¿Quién juega?</span>
            <input
              autoFocus
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              aria-label="Nombre del jugador"
              className="h-24 rounded-3xl border-4 border-night/10 bg-mist px-7 font-display text-[44px] font-bold text-night outline-none placeholder:text-night/30 focus:border-grape"
            />
          </label>

          <ul className="grid grid-cols-3 gap-3">
            {mode.rules.map((r, i) => (
              <li key={i} className="flex gap-3 rounded-2xl bg-night/5 p-4 text-[15px] leading-snug font-semibold">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-night font-display text-sm font-bold text-white">{i + 1}</span>
                {r}
              </li>
            ))}
          </ul>
          <p className="-mt-3 text-sm font-semibold text-night/60">
            Tiempo máximo {formatTime(mode.timeLimitMs)} s
            {mode.kind !== 'capture' && ` · objetivo ${threshold} % sostenido ${holdMs} ms`}
            {mode.kind === 'sequence' && ` · ${mode.targets} colores`}
          </p>

          {!connected ? (
            <div className="flex items-center gap-4 rounded-3xl bg-sun/30 p-5">
              <span className="flex-1 font-semibold">Conectá el cubo para jugar, o probá con el simulador.</span>
              <Button tone="night" size="sm" disabled={!isWebBluetoothAvailable()} onClick={() => connect('real')}>
                Conectar cubo
              </Button>
              <Button tone="grape" size="sm" onClick={() => connect('mock')}>
                Simulador
              </Button>
            </div>
          ) : !avail.ok ? (
            <div className="rounded-3xl bg-coral/30 p-5 font-semibold">{avail.reason}</div>
          ) : null}
          {error && <div className="rounded-2xl bg-coral/25 p-4 font-semibold">{error}</div>}

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-night/50">
              {connected ? (kind === 'mock' ? 'Jugás con el simulador' : 'Jugás con el cubo físico') : ''}
            </span>
            <Button tone="sun" size="lg" hotkey="Enter" icon={<IconPlay size={28} />} disabled={!canStart} onClick={begin}>
              ¡A jugar!
            </Button>
          </div>
        </motion.div>
      </div>
    </Screen>
  );
}
