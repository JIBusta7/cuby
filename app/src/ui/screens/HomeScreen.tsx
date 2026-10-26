import { motion } from 'motion/react';
import { TOTAL_LEDS } from '../../core/leds/ledModel';
import { useApp } from '../../store/appStore';
import { useCube } from '../../store/cubeStore';
import { isWebBluetoothAvailable } from '../../transport/RealCubeTransport';
import { Button } from '../components/Button';
import { ConnectionPill } from '../components/ConnectionPill';
import { IconGear, IconPlay, IconTrophy } from '../components/Icons';
import { Logo, Screen } from '../components/Screen';
import { FloatingShapes } from '../components/Shapes';
import { useKeys } from '../hooks/useKeys';
import { PALETTE } from '../theme/palette';
import { CubeView } from '../three/CubeView';

const SHAPES = [
  { kind: 'circle', color: PALETTE.sun, size: 420, x: '68%', y: '-14%', opacity: 0.95 },
  { kind: 'triangle', color: PALETTE.coral, size: 220, x: '-4%', y: '74%', rotate: -18 },
  { kind: 'square', color: PALETTE.ocean, size: 150, x: '47%', y: '80%', rotate: 16 },
  { kind: 'diamond', color: PALETTE.mint, size: 110, x: '40%', y: '6%', rotate: 0 },
  { kind: 'circle', color: PALETTE.grapeDeep, size: 520, x: '58%', y: '40%', opacity: 0.55 },
] as const;

export function HomeScreen() {
  const go = useApp((s) => s.go);
  const { status, kind, connect, detail } = useCube();
  const connected = status === 'connected';
  const busy = status === 'connecting' || status === 'reconnecting';
  const bt = isWebBluetoothAvailable();

  useKeys({ Enter: () => go('modes'), m: () => go('lights'), l: () => go('leaderboard'), s: () => go('settings') });

  return (
    <Screen className="bg-grape">
      <FloatingShapes shapes={SHAPES} />
      <header className="relative z-10 flex items-center justify-end gap-4 px-10 pt-8">
        <ConnectionPill onClick={() => go('settings')} />
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-center pr-6 pl-20">
        <div className="flex flex-col gap-9">
          <Logo />
          <motion.p
            className="max-w-[520px] font-display text-[34px] leading-[1.1] font-bold text-white"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            Girá el cubo. <span className="text-sun">Igualá el color.</span> Ganale al reloj.
          </motion.p>
          <motion.div
            className="flex flex-col items-start gap-5"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.5 }}
          >
            <div className="flex items-center gap-4">
              <Button tone="sun" size="xl" hotkey="Enter" icon={<IconPlay />} onClick={() => go('modes')} autoFocus>
                PLAY
              </Button>
              <Button tone="mint" size="xl" hotkey="M" onClick={() => go('lights')}>
                LUCES
              </Button>
            </div>
            <div className="flex gap-4">
              <Button tone="night" size="md" icon={<IconTrophy />} hotkey="L" onClick={() => go('leaderboard')}>
                Ranking
              </Button>
              <Button tone="night" size="md" icon={<IconGear />} hotkey="S" onClick={() => go('settings')}>
                Ajustes
              </Button>
            </div>
          </motion.div>
        </div>

        <div className="relative h-[700px]">
          <CubeView showcase className="h-full w-full" distance={3.7} />
        </div>
      </div>

      <footer className="relative z-10 flex h-24 items-center gap-4 px-20 pb-6">
        {connected && kind === 'mock' && (
          <>
            <span className="rounded-full bg-night/60 px-4 py-2 text-sm font-semibold text-white/85">
              Modo simulación: el cubo 3D reemplaza al físico
            </span>
            {bt && (
              <Button tone="ghost" size="sm" onClick={() => connect('real')}>
                Conectar el cubo real
              </Button>
            )}
          </>
        )}
        {connected && kind === 'real' && (
          <span className="rounded-full bg-night/60 px-4 py-2 text-sm font-semibold text-white/85">
            Cubo conectado · {TOTAL_LEDS} LEDs listos
          </span>
        )}
        {!connected && (
          <>
            <Button tone="white" size="sm" disabled={busy || !bt} onClick={() => connect('real')}>
              Conectar cubo
            </Button>
            <Button tone="ghost" size="sm" disabled={busy} onClick={() => connect('mock')}>
              Usar simulador
            </Button>
            <span className="text-sm font-semibold text-white/80">
              {!bt ? 'Este navegador no tiene Bluetooth: usá Chrome o Edge.' : (detail ?? '')}
            </span>
          </>
        )}
      </footer>
    </Screen>
  );
}
