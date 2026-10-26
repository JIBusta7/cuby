import { motion } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { MODES, type ModeDef, type ModeId } from '../../core/game/modes';
import { useApp } from '../../store/appStore';
import { useCube } from '../../store/cubeStore';
import { modeAvailability } from '../../store/gameStore';
import { useSettings } from '../../store/settingsStore';
import { ConnectionPill } from '../components/ConnectionPill';
import { IconBolt, IconCube, IconStopwatch, IconTarget } from '../components/Icons';
import { BackButton, Screen } from '../components/Screen';
import { useKeys } from '../hooks/useKeys';
import { PALETTE } from '../theme/palette';

const COLUMNS: readonly (readonly ModeId[])[] = [
  ['precision', 'timed', 'physical'],
  ['speed-easy', 'speed-medium', 'speed-hard'],
];

const ICON: Record<ModeId, ReactNode> = {
  precision: <IconTarget size={44} />,
  timed: <IconStopwatch size={44} />,
  physical: <IconCube size={44} />,
  'speed-easy': <Dots n={3} />,
  'speed-medium': <Dots n={5} />,
  'speed-hard': <Dots n={10} />,
};

function Dots({ n }: { n: number }) {
  const colors = [PALETTE.sun, PALETTE.mint, PALETTE.ocean, PALETTE.grape, '#fff'];
  return (
    <div className="grid w-[132px] grid-cols-5 gap-1.5">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="h-5 w-5 rounded-md" style={{ background: colors[i % colors.length] }} />
      ))}
    </div>
  );
}

function ModeCard({
  mode,
  onPick,
  index,
  refCb,
  onKeyNav,
}: {
  mode: ModeDef;
  onPick: () => void;
  index: number;
  refCb: (el: HTMLButtonElement | null) => void;
  onKeyNav: (e: React.KeyboardEvent) => void;
}) {
  useCube((s) => s.caps); // re-evaluar disponibilidad al cambiar el firmware
  useSettings((s) => s.faceMapConfirmed);
  const avail = modeAvailability(mode);
  const criterion = mode.ranking === 'accuracy-desc' ? 'Gana la precisión' : 'Gana el tiempo';
  return (
    <motion.button
      ref={refCb}
      type="button"
      disabled={!avail.ok}
      onClick={onPick}
      onKeyDown={onKeyNav}
      className="chunk group flex min-h-0 flex-1 items-center gap-6 rounded-[28px] bg-white px-7 text-left text-night disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.06 * index }}
      whileHover={avail.ok ? { scale: 1.02 } : {}}
      whileTap={avail.ok ? { scale: 0.98 } : {}}
    >
      <span className="grid h-[88px] w-[132px] shrink-0 place-items-center rounded-2xl bg-night text-white">{ICON[mode.id]}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-display text-[30px] leading-none font-bold tracking-tight">{mode.title}</span>
        <span className="text-base font-semibold text-night/70">{mode.tagline}</span>
        <span className="mt-1 inline-flex w-fit rounded-full bg-night/8 px-3 py-1 text-xs font-bold tracking-wide text-night/70 uppercase">
          {avail.ok ? criterion : avail.reason}
        </span>
      </span>
    </motion.button>
  );
}

export function ModeSelectScreen() {
  const go = useApp((s) => s.go);
  const selectMode = useApp((s) => s.selectMode);
  const refs = useRef<(HTMLButtonElement | null)[][]>([[], []]);

  const pick = (id: ModeId) => {
    selectMode(id);
    go('setup');
  };

  useKeys({ Escape: () => go('home') });

  // Al entrar, el foco va al último modo jugado (o al primero) para elegir con Enter.
  const lastMode = useSettings((s) => s.lastMode);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const col = COLUMNS.findIndex((c) => lastMode !== null && c.includes(lastMode));
      const row = col >= 0 && lastMode ? COLUMNS[col]!.indexOf(lastMode) : 0;
      const el = refs.current[Math.max(0, col)]?.[row];
      (el && !el.disabled ? el : refs.current[0]?.[0])?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [lastMode]);

  const nav = (col: number, row: number) => (e: React.KeyboardEvent) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    const c = Math.max(0, Math.min(1, col + m[0]));
    const r = Math.max(0, Math.min(2, row + m[1]));
    refs.current[c]?.[r]?.focus();
  };

  return (
    <Screen className="bg-night">
      <header className="flex items-center justify-between px-10 pt-8">
        <BackButton onClick={() => go('home')} />
        <h1 className="font-display text-[44px] font-bold tracking-tight">Elegí cómo jugar</h1>
        <ConnectionPill onClick={() => go('settings')} />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-8 px-10 pt-8 pb-10">
        {COLUMNS.map((ids, col) => {
          const speed = col === 1;
          return (
            <motion.section
              key={col}
              className={`chunk flex min-h-0 flex-col gap-5 rounded-[40px] p-7 ${speed ? 'bg-coral' : 'bg-grape'}`}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 22, delay: col * 0.08 }}
            >
              <div className={`flex items-center gap-4 px-2 ${speed ? 'text-night' : 'text-white'}`}>
                {speed ? <IconBolt size={46} /> : <IconTarget size={46} />}
                <div>
                  <h2 className="font-display text-[42px] leading-none font-bold tracking-tight">
                    {speed ? 'SPEED CHALLENGE' : 'COLOR MATCH'}
                  </h2>
                  <p className="mt-1 text-base font-semibold opacity-80">
                    {speed ? 'Una secuencia de colores, contra reloj' : 'Un color objetivo, tu mejor intento'}
                  </p>
                </div>
              </div>
              {ids.map((id, row) => (
                <ModeCard
                  key={id}
                  mode={MODES[id]}
                  index={col * 3 + row}
                  onPick={() => pick(id)}
                  refCb={(el) => {
                    refs.current[col]![row] = el;
                  }}
                  onKeyNav={nav(col, row)}
                />
              ))}
            </motion.section>
          );
        })}
      </div>
    </Screen>
  );
}
