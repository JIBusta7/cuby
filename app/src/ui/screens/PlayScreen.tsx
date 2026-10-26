import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { thresholdFor } from '../../core/game/modes';
import { formatTime } from '../../core/game/scoring';
import { currentTarget, elapsedMs, holdProgress, remainingMs, type Session } from '../../core/game/session';
import { countdownStep } from '../../core/game/timing';
import { rgbToCss } from '../../core/color/types';
import { useApp } from '../../store/appStore';
import { cubeLink, useCube } from '../../store/cubeStore';
import { useGame } from '../../store/gameStore';
import { KeyCap } from '../components/Button';
import { LinkDiagnostics } from '../components/LinkDiagnostics';
import { AccuracyMeter, ColorPanel, GameClock, HoldRing } from '../components/GameBits';
import { IconCube } from '../components/Icons';
import { Logo, Screen } from '../components/Screen';
import { Shape } from '../components/Shapes';
import { useKeys } from '../hooks/useKeys';
import { COUNTDOWN_BG, PALETTE } from '../theme/palette';
import { CubeView } from '../three/CubeView';

const TILT = (6 * Math.PI) / 180;

export function PlayScreen() {
  const session = useGame((s) => s.session);
  const { quit, capture } = useGame();
  const go = useApp((s) => s.go);
  const kind = useCube((s) => s.kind);

  const exit = () => {
    quit();
    go('modes');
  };
  const tilt = (x: number, z: number) => cubeLink.mock?.rotateWorld({ x, y: 0, z }, TILT);
  useKeys({
    Escape: exit,
    Space: capture,
    ArrowUp: () => tilt(-1, 0),
    ArrowDown: () => tilt(1, 0),
    ArrowLeft: () => tilt(0, 1),
    ArrowRight: () => tilt(0, -1),
    r: () => cubeLink.mock?.resetOrientation(),
  });

  const [diag, setDiag] = useState(false);
  useKeys({ d: () => setDiag((v) => !v) });

  const counting = !session || session.phase === 'countdown';
  return (
    <Screen className="bg-night">
      {session && <GameHud session={session} mock={kind === 'mock'} />}
      {diag && (
        <div className="absolute top-28 left-10 z-20 w-[560px]">
          <LinkDiagnostics compact />
        </div>
      )}
      <AnimatePresence>{counting && <Countdown key="countdown" session={session} />}</AnimatePresence>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
function Countdown({ session }: { session: Session | null }) {
  const step = session ? countdownStep(session.now - session.countdownStart) ?? 'GO' : 3;
  const bg = COUNTDOWN_BG[step];
  const dark = step !== 'GO';
  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, backgroundColor: bg }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ backgroundColor: { duration: 0.18 }, opacity: { duration: 0.2 } }}
    >
      <AnimatePresence>
        <motion.div
          key={`shape-${String(step)}`}
          className="absolute"
          initial={{ scale: 0.2, rotate: -90, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 0.22 }}
          exit={{ scale: 1.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 16 }}
        >
          <Shape
            kind={step === 3 ? 'triangle' : step === 2 ? 'diamond' : step === 1 ? 'circle' : 'square'}
            color={dark ? PALETTE.night : '#ffffff'}
            size={760}
          />
        </motion.div>
      </AnimatePresence>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={String(step)}
          className={`relative font-display leading-none font-bold tracking-tighter ${dark ? 'text-night' : 'text-white'} ${step === 'GO' ? 'text-[300px]' : 'text-[420px]'}`}
          initial={{ scale: 0.25, opacity: 0, rotate: -14 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 1.7, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 17 }}
        >
          {step === 'GO' ? 'GO!' : step}
        </motion.span>
      </AnimatePresence>
      <div className={`absolute bottom-10 left-12 font-display ${dark ? 'text-night' : 'text-white'}`}>
        <div className="text-lg font-bold tracking-[0.2em] opacity-70">{session?.mode.title.toUpperCase() ?? 'PREPARANDO'}</div>
        <div className="text-4xl font-bold">{session?.player ?? ''}</div>
      </div>
      <div className="absolute right-10 bottom-6 flex flex-col items-center">
        <CubeView className="h-[240px] w-[240px]" distance={4.4} />
        <span className={`-mt-2 font-display text-sm font-bold ${dark ? 'text-night/70' : 'text-white/80'}`}>el cubo cuenta con vos</span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
function GameHud({ session, mock }: { session: Session; mock: boolean }) {
  const stale = useCube((s) => s.stale);
  const target = currentTarget(session);
  const reading = session.current;
  const playing = session.phase === 'playing';
  const finished = session.phase === 'finished';
  const { threshold } = thresholdFor(session.mode, session.rules);
  const hold = holdProgress(session);
  const capture = session.mode.kind === 'capture';
  const physical = !session.mode.targetOnScreen;
  const sequence = session.mode.kind === 'sequence';

  // Destello al completar un objetivo de la secuencia.
  const [flash, setFlash] = useState<{ n: number; t: number } | null>(null);
  const prevIndex = useRef(session.index);
  useEffect(() => {
    if (session.index > prevIndex.current) {
      const split = session.splits[session.splits.length - 1];
      const prevSplit = session.splits[session.splits.length - 2];
      if (split) setFlash({ n: session.index, t: split.atMs - (prevSplit?.atMs ?? 0) });
      const id = setTimeout(() => setFlash(null), 900);
      prevIndex.current = session.index;
      return () => clearTimeout(id);
    }
    prevIndex.current = session.index;
    return undefined;
  }, [session.index, session.splits]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-8 px-10 pt-7">
        <div className="flex items-center gap-6">
          <Logo size="sm" />
          <div className="h-10 w-px bg-white/15" />
          <div>
            <div className="font-display text-sm font-bold tracking-[0.18em] text-white/50">{session.mode.title.toUpperCase()}</div>
            <div className="font-display text-2xl font-bold">{session.player}</div>
          </div>
        </div>
        {sequence && <SequenceTrack session={session} />}
        <GameClock elapsed={elapsedMs(session)} remaining={remainingMs(session)} limit={session.mode.timeLimitMs} />
      </header>

      <div className="flex min-h-0 flex-1 gap-6 px-10 pt-6 pb-5">
        <div className="flex min-h-0 flex-1 gap-6">
          {physical ? (
            <PhysicalTargetCard mock={mock} />
          ) : (
            <ColorPanel label={sequence ? `OBJETIVO ${session.index + 1}/${session.targets.length}` : 'OBJETIVO'} rgb={target} accent={PALETTE.sun}>
              <AnimatePresence>
                {flash && (
                  <motion.div
                    key={flash.n}
                    className="absolute inset-0 grid place-items-center"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 1.3, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                  >
                    <span className="chunk rounded-3xl bg-white px-8 py-4 font-display text-5xl font-bold text-night">
                      ¡Bien! <span className="text-mint">{formatTime(flash.t)} s</span>
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </ColorPanel>
          )}
          <ColorPanel label="TU COLOR" rgb={reading?.rgb ?? null} accent={PALETTE.mint}>
            {!capture && hold > 0 && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="rounded-full bg-night/70 p-2 backdrop-blur">
                  <HoldRing progress={hold} size={150} />
                </div>
              </div>
            )}
          </ColorPanel>
        </div>
        <div className="flex w-[300px] shrink-0 flex-col items-center">
          <CubeView className="w-full flex-1" interactive={mock} hideTarget={!mock} distance={5.6} />
          <p className="text-center text-sm font-semibold text-white/60">
            {mock ? (
              <>
                Arrastrá el cubo o usá las flechas
                <br />
                <span className="text-white/40">R lo vuelve a apoyar</span>
              </>
            ) : (
              'Girá el cubo físico'
            )}
          </p>
        </div>
      </div>

      <div className="px-10">
        <AccuracyMeter value={reading?.accuracy ?? null} threshold={capture ? undefined : threshold} active={playing || finished} />
      </div>

      <footer className="flex h-20 items-center justify-between px-10 text-base font-semibold text-white/70">
        <div className="flex items-center gap-3">
          {capture ? (
            <>
              <KeyCap className="h-10 px-4 text-white">SPACE</KeyCap>
              <span>
                Confirmá tu color cuando estés conforme <span className="text-white/40">(o tocá el cubo)</span>
              </span>
            </>
          ) : (
            <span>
              Llegá al <b className="text-white">{threshold} %</b> y sostenelo: {sequence ? 'pasa solo al siguiente color' : 'gana el tiempo'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <KeyCap className="h-10 px-3 text-white">D</KeyCap>
          <span className="mr-4">Diagnóstico</span>
          <KeyCap className="h-10 px-3 text-white">Esc</KeyCap>
          <span>Salir (el intento no cuenta)</span>
        </div>
      </footer>

      <AnimatePresence>
        {playing && stale && (
          <motion.div
            className="absolute top-28 left-1/2 z-20 -translate-x-1/2 rounded-full bg-sun px-6 py-3 font-display text-lg font-bold text-night shadow-xl"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
          >
            Esperando datos del cubo… si no vuelven, la partida se anula
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{finished && <FinishFlash session={session} />}</AnimatePresence>
    </div>
  );
}

function SequenceTrack({ session }: { session: Session }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Color ${session.index + 1} de ${session.targets.length}`}>
      {session.targets.map((t, i) => {
        const done = i < session.splits.length;
        const current = i === session.index && session.phase !== 'finished';
        return (
          <motion.span
            key={i}
            className="block h-9 w-9 rounded-xl border-[3px]"
            animate={{
              scale: current ? [1, 1.15, 1] : 1,
              backgroundColor: done ? rgbToCss(t) : 'rgba(255,255,255,0.08)',
              borderColor: current ? '#ffffff' : done ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0.15)',
            }}
            transition={current ? { scale: { repeat: Infinity, duration: 1.1 } } : { duration: 0.25 }}
          />
        );
      })}
    </div>
  );
}

function PhysicalTargetCard({ mock }: { mock: boolean }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded-[36px] bg-night-2 p-10 text-center">
      <motion.div
        className="text-sun"
        animate={{ y: [0, -10, 0] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
      >
        <IconCube size={150} />
      </motion.div>
      <div className="font-display text-[40px] leading-tight font-bold">
        El objetivo está en la <span className="text-sun">cara de arriba</span> del cubo
      </div>
      <p className="max-w-[440px] text-lg font-semibold text-white/65">
        Las otras cinco caras muestran tu color. Girá el cubo hasta que todas coincidan.
        {mock && ' En el simulador, mirá la cara de arriba del cubo 3D.'}
      </p>
    </div>
  );
}

function FinishFlash({ session }: { session: Session }) {
  const r = session.result;
  if (!r || r.reason === 'quit') return null;
  const text = r.outcome === 'timeout' ? '¡TIEMPO!' : r.outcome === 'aborted' ? 'SIN SEÑAL' : '¡LISTO!';
  const bg = r.outcome === 'win' || r.outcome === 'captured' ? 'bg-mint text-night' : 'bg-coral text-night';
  return (
    <motion.div className="absolute inset-0 z-40 grid place-items-center bg-night/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.span
        className={`chunk rounded-[40px] px-16 py-8 font-display text-[110px] leading-none font-bold ${bg}`}
        initial={{ scale: 0.3, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 14 }}
      >
        {text}
      </motion.span>
    </motion.div>
  );
}
