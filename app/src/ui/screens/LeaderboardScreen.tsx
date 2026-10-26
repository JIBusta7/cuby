import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { formatAccuracy } from '../../core/color/accuracy';
import { MODE_ORDER, MODES, rulesSignature, type ModeId } from '../../core/game/modes';
import { formatTime } from '../../core/game/scoring';
import type { LeaderboardEntry } from '../../core/leaderboard/types';
import { useApp } from '../../store/appStore';
import { useLeaderboard } from '../../store/leaderboardStore';
import { rulesFromSettings, useSettings } from '../../store/settingsStore';
import { Button } from '../components/Button';
import { IconTrophy } from '../components/Icons';
import { BackButton, Screen } from '../components/Screen';
import { useKeys } from '../hooks/useKeys';

const TAB_LABEL: Record<ModeId, string> = {
  precision: 'Precision',
  timed: 'Timed Match',
  physical: 'Physical',
  'speed-easy': 'Speed · Easy',
  'speed-medium': 'Speed · Medium',
  'speed-hard': 'Speed · Hard',
};

function metric(board: ModeId, e: LeaderboardEntry): { main: string; sub: string } {
  return MODES[board].ranking === 'accuracy-desc'
    ? { main: `${formatAccuracy(e.accuracy)} %`, sub: `${formatTime(e.elapsedMs)} s` }
    : { main: `${formatTime(e.elapsedMs)} s`, sub: `${formatAccuracy(e.accuracy)} %` };
}

const date = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

export function LeaderboardScreen() {
  const { leaderboardBoard: board, showBoard, back, go, selectMode } = useApp();
  const { boards, load, error } = useLeaderboard();
  const settings = useSettings();
  const entries = boards[board];
  const currentRules = rulesSignature(MODES[board], rulesFromSettings(settings));

  useEffect(() => {
    void load(board);
  }, [board, load]);

  const shift = (d: number) => {
    const i = MODE_ORDER.indexOf(board);
    showBoard(MODE_ORDER[(i + d + MODE_ORDER.length) % MODE_ORDER.length]!);
  };
  const leave = () => go(back === 'results' || back === 'modes' ? back : 'home');
  useKeys({ Escape: leave, ArrowLeft: () => shift(-1), ArrowRight: () => shift(1) });

  const top = entries?.slice(0, 3) ?? [];
  const rest = entries?.slice(3, 12) ?? [];
  const podiumOrder = [top[1], top[0], top[2]];

  return (
    <Screen className="bg-grape">
      <header className="flex items-center justify-between px-10 pt-8">
        <BackButton onClick={leave} />
        <h1 className="flex items-center gap-4 font-display text-[44px] font-bold tracking-tight">
          <IconTrophy size={44} /> Ranking
        </h1>
        <span className="w-[140px] text-right text-sm font-semibold text-white/60">← → cambia de modo</span>
      </header>

      <nav className="flex justify-center gap-2 px-10 pt-6" aria-label="Modos">
        {MODE_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => showBoard(id)}
            aria-pressed={id === board}
            className={`chunk-sm h-12 cursor-pointer rounded-full px-5 font-display text-base font-bold ${id === board ? 'bg-sun text-night' : 'bg-white/12 text-white hover:bg-white/20'}`}
          >
            {TAB_LABEL[id]}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col px-16 pt-6 pb-8">
        {error && <div className="mb-4 rounded-2xl bg-coral px-5 py-3 font-semibold text-night">{error}</div>}
        <AnimatePresence mode="wait">
          <motion.div
            key={board}
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {entries && entries.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
                <span className="font-display text-5xl font-bold">Todavía no hay partidas</span>
                <span className="text-xl font-semibold text-white/75">{MODES[board].title}: el primer puesto está libre.</span>
                <Button
                  tone="sun"
                  size="lg"
                  onClick={() => {
                    selectMode(board);
                    if (go('modes')) go('setup');
                  }}
                >
                  Jugar {MODES[board].title}
                </Button>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-[1.15fr_1fr] gap-10">
                <div className="flex items-end justify-center gap-5 pb-4">
                  {podiumOrder.map((e, i) => {
                    if (!e) return <div key={i} className="w-[200px]" />;
                    const place = i === 1 ? 1 : i === 0 ? 2 : 3;
                    const height = place === 1 ? 'h-[300px]' : place === 2 ? 'h-[240px]' : 'h-[200px]';
                    const color = place === 1 ? 'bg-sun text-night' : place === 2 ? 'bg-white text-night' : 'bg-coral text-night';
                    const m = metric(board, e);
                    return (
                      <motion.div
                        key={e.id}
                        className="flex w-[200px] flex-col items-center gap-3"
                        initial={{ y: 60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.1 * place }}
                      >
                        <span className="max-w-full truncate font-display text-2xl font-bold">{e.player}</span>
                        <div className={`chunk flex w-full flex-col items-center justify-start gap-1 rounded-t-[32px] rounded-b-2xl pt-6 ${height} ${color}`}>
                          <span className="font-display text-7xl leading-none font-bold">{place}</span>
                          <span className="font-display text-3xl font-bold tabular">{m.main}</span>
                          <span className="text-sm font-semibold opacity-70 tabular">{m.sub}</span>
                          <Tags e={e} currentRules={currentRules} />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                <ol className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-2">
                  {rest.map((e, i) => {
                    const m = metric(board, e);
                    return (
                      <motion.li
                        key={e.id}
                        className="flex items-center gap-4 rounded-2xl bg-night/35 px-5 py-3"
                        initial={{ x: 30, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.03 * i }}
                      >
                        <span className="w-8 font-display text-2xl font-bold text-white/60 tabular">{i + 4}</span>
                        <span className="min-w-0 flex-1 truncate font-display text-xl font-bold">{e.player}</span>
                        <Tags e={e} currentRules={currentRules} />
                        <span className="text-sm font-semibold text-white/55 tabular">{m.sub}</span>
                        <span className="w-28 text-right font-display text-2xl font-bold tabular">{m.main}</span>
                        <span className="w-12 text-right text-xs font-semibold text-white/50">{date(e.date)}</span>
                      </motion.li>
                    );
                  })}
                  {rest.length === 0 && entries && entries.length > 0 && (
                    <li className="flex flex-1 flex-col items-start justify-center gap-5 rounded-[32px] bg-night/25 p-10">
                      <span className="font-display text-sm font-bold tracking-[0.2em] text-white/60">
                        {entries.length} {entries.length === 1 ? 'PARTIDA' : 'PARTIDAS'} EN ESTE MODO
                      </span>
                      <span className="font-display text-5xl leading-tight font-bold">¿Podés superar a {top[0]?.player}?</span>
                      <Button
                        tone="sun"
                        size="lg"
                        onClick={() => {
                          selectMode(board);
                          if (go('modes')) go('setup');
                        }}
                      >
                        Jugar {MODES[board].title}
                      </Button>
                    </li>
                  )}
                </ol>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Screen>
  );
}

function Tags({ e, currentRules }: { e: LeaderboardEntry; currentRules: string }) {
  return (
    <span className="flex gap-1">
      {e.source === 'mock' && <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-[11px] font-bold uppercase">sim</span>}
      {e.rules !== currentRules && (
        <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-[11px] font-bold uppercase" title={e.rules}>
          otras reglas
        </span>
      )}
    </span>
  );
}
