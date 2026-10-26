import { motion } from 'motion/react';
import { formatAccuracy } from '../../core/color/accuracy';
import { rgbToCss, type RGB } from '../../core/color/types';
import { formatTime } from '../../core/game/scoring';
import type { GameResult, Session } from '../../core/game/session';
import { useApp } from '../../store/appStore';
import { backToIdle, useGame } from '../../store/gameStore';
import { Button } from '../components/Button';
import { Confetti } from '../components/Confetti';
import { IconReplay, IconTrophy } from '../components/Icons';
import { Logo, Screen } from '../components/Screen';
import { FloatingShapes } from '../components/Shapes';
import { useKeys } from '../hooks/useKeys';
import { useReducedMotion } from '../hooks/useMotionPref';
import { PALETTE } from '../theme/palette';

function verdict(acc: number): string {
  if (acc >= 98) return '¡Impecable!';
  if (acc >= 93) return '¡Muy bien!';
  if (acc >= 80) return 'Bien';
  if (acc >= 60) return 'Cerca…';
  return 'A seguir practicando';
}

function tone(r: GameResult): { bg: string; dark: boolean } {
  if (r.outcome === 'win') return { bg: 'bg-mint', dark: true };
  if (r.outcome === 'captured') {
    if (r.accuracy >= 90) return { bg: 'bg-mint', dark: true };
    if (r.accuracy >= 70) return { bg: 'bg-sun', dark: true };
    return { bg: 'bg-coral', dark: true };
  }
  if (r.outcome === 'timeout') return { bg: 'bg-coral', dark: true };
  return { bg: 'bg-night-2', dark: false };
}

const ABORT_TEXT = {
  disconnected: 'Se desconectó el cubo durante la partida.',
  signal: 'El cubo dejó de mandar datos durante la partida.',
  quit: 'Saliste de la partida.',
} as const;

export function ResultsScreen() {
  const session = useGame((s) => s.session);
  const saved = useGame((s) => s.saved);
  const replay = useGame((s) => s.replay);
  const starting = useGame((s) => s.starting);
  const { go, showBoard } = useApp();
  const reduce = useReducedMotion();

  const leave = (to: 'modes' | 'home' | 'leaderboard') => {
    if (to === 'leaderboard' && session) showBoard(session.mode.id);
    if (to !== 'leaderboard') backToIdle();
    go(to);
  };
  useKeys({
    Enter: () => void replay(),
    m: () => leave('modes'),
    l: () => leave('leaderboard'),
    Escape: () => leave('home'),
  });

  const r = session?.result;
  if (!session || !r) {
    return (
      <Screen className="items-center justify-center bg-night">
        <Button tone="sun" size="lg" onClick={() => leave('modes')}>
          Elegir modo
        </Button>
      </Screen>
    );
  }

  const t = tone(r);
  const ink = t.dark ? 'text-night' : 'text-white';
  const celebrate = !reduce && (r.outcome === 'win' || (r.outcome === 'captured' && r.accuracy >= 90));
  const captureMode = session.mode.kind === 'capture';

  return (
    <Screen className={t.bg}>
      <FloatingShapes
        shapes={[
          { kind: 'circle', color: 'rgba(255,255,255,0.18)', size: 520, x: '-10%', y: '-30%' },
          { kind: 'diamond', color: 'rgba(0,0,0,0.08)', size: 300, x: '82%', y: '62%' },
          { kind: 'triangle', color: 'rgba(255,255,255,0.15)', size: 160, x: '70%', y: '4%', rotate: 20 },
        ]}
      />
      {celebrate && <Confetti />}
      <header className={`relative z-10 flex items-center justify-between px-10 pt-8 ${ink}`}>
        <Logo size="sm" />
        <span className="font-display text-xl font-bold tracking-[0.15em] opacity-70">{session.mode.title.toUpperCase()}</span>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[1.1fr_1fr] items-center gap-12 px-16">
        <div className={`flex flex-col gap-4 ${ink}`}>
          <Headline session={session} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {r.ranked && (
              <span className="chunk-sm rounded-2xl bg-night px-5 py-3 font-display text-2xl font-bold text-white tabular">
                {r.score.toLocaleString('es-AR')} pts
              </span>
            )}
            {saved && (
              <motion.span
                className={`chunk-sm rounded-2xl px-5 py-3 font-display text-2xl font-bold ${saved.record ? 'bg-sun text-night' : 'bg-white text-night'}`}
                initial={{ scale: 0.5, rotate: -6 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 12, delay: 0.3 }}
              >
                {saved.record ? '★ ¡Nuevo récord!' : `#${saved.rank} de ${saved.total}`}
              </motion.span>
            )}
            {!r.ranked && <span className="rounded-2xl bg-night/15 px-4 py-3 font-semibold">No entra al ranking</span>}
          </div>
          <div className="mt-8 flex items-center gap-4">
            <Button tone="night" size="lg" hotkey="Enter" icon={<IconReplay />} onClick={() => void replay()} disabled={starting} autoFocus>
              Jugar de nuevo
            </Button>
            <Button tone="white" size="md" hotkey="M" onClick={() => leave('modes')}>
              Otro modo
            </Button>
            <Button tone="white" size="md" hotkey="L" icon={<IconTrophy size={22} />} onClick={() => leave('leaderboard')}>
              Ranking
            </Button>
          </div>
          <button type="button" onClick={() => leave('home')} className="w-fit cursor-pointer text-base font-semibold underline-offset-4 opacity-70 hover:underline">
            Volver al inicio (Esc)
          </button>
        </div>

        <div className="flex flex-col gap-6">
          {captureMode || session.targets.length === 1 ? (
            <Compare target={session.targets[0] ?? null} mine={r.finalColor} label={captureMode ? 'Tu color confirmado' : 'Tu color'} />
          ) : (
            <Splits session={session} />
          )}
        </div>
      </div>
    </Screen>
  );
}

function Headline({ session }: { session: Session }) {
  const r = session.result!;
  const capture = session.mode.kind === 'capture';
  const big = 'font-display font-bold leading-[0.9] tracking-tighter';
  if (r.outcome === 'aborted') {
    return (
      <>
        <span className={`${big} text-[110px]`}>Partida anulada</span>
        <span className="text-2xl font-semibold opacity-80">{r.reason ? ABORT_TEXT[r.reason] : ''}</span>
      </>
    );
  }
  if (r.outcome === 'timeout') {
    return (
      <>
        <span className={`${big} text-[150px]`}>¡Tiempo!</span>
        <span className="text-2xl font-semibold opacity-80">
          {session.mode.kind === 'sequence'
            ? `Completaste ${r.completed} de ${r.total} colores.`
            : `Tu mejor precisión fue ${formatAccuracy(session.bestAccuracy)} %.`}
        </span>
      </>
    );
  }
  if (capture) {
    return (
      <>
        <span className="font-display text-4xl font-bold">{verdict(r.accuracy)}</span>
        <motion.span
          className={`${big} text-[200px] tabular`}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 16 }}
        >
          {formatAccuracy(r.accuracy)}
          <span className="text-[90px]">%</span>
        </motion.span>
        <span className="text-2xl font-semibold opacity-80">
          de precisión en {formatTime(r.elapsedMs)} s{r.timeUp ? ' · se acabó el tiempo y se tomó tu último color' : ''}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="font-display text-4xl font-bold">¡Lo lograste!</span>
      <motion.span
        className={`${big} text-[200px] tabular`}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 16 }}
      >
        {formatTime(r.elapsedMs)}
        <span className="text-[90px]"> s</span>
      </motion.span>
      <span className="text-2xl font-semibold opacity-80">
        {session.mode.kind === 'sequence' ? `${r.total} colores · ` : ''}precisión {formatAccuracy(r.accuracy)} %
      </span>
    </>
  );
}

function Compare({ target, mine, label }: { target: RGB | null; mine: RGB | null; label: string }) {
  return (
    <motion.div
      className="chunk flex h-[440px] gap-2 overflow-hidden rounded-[44px] bg-night p-2"
      initial={{ rotate: 3, scale: 0.9, opacity: 0 }}
      animate={{ rotate: 0, scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.15 }}
    >
      {[
        ['Objetivo', target],
        [label, mine],
      ].map(([l, c], i) => (
        <div
          key={i}
          className={`relative flex-1 ${i === 0 ? 'rounded-l-[38px]' : 'rounded-r-[38px]'}`}
          style={{ background: c ? rgbToCss(c as RGB) : PALETTE.night3 }}
        >
          <span className="absolute bottom-5 left-5 rounded-xl bg-night/75 px-4 py-2 font-display text-lg font-bold text-white">{l as string}</span>
        </div>
      ))}
    </motion.div>
  );
}

function Splits({ session }: { session: Session }) {
  let prev = 0;
  return (
    <div className="chunk grid grid-cols-5 gap-3 rounded-[40px] bg-night p-6">
      {session.targets.map((t, i) => {
        const s = session.splits[i];
        const lap = s ? s.atMs - prev : null;
        if (s) prev = s.atMs;
        return (
          <motion.div
            key={i}
            className="flex flex-col overflow-hidden rounded-2xl bg-night-3"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.05 * i }}
          >
            <div className="h-20" style={{ background: rgbToCss(t), opacity: s ? 1 : 0.35 }} />
            <div className="px-3 py-2 font-display text-lg font-bold text-white tabular">{lap !== null ? `${formatTime(lap)} s` : '—'}</div>
          </motion.div>
        );
      })}
    </div>
  );
}
