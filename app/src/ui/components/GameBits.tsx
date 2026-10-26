/** Piezas de la pantalla de juego: paneles de color, medidor de precisión, anillo de estabilidad, reloj. */
import { motion, useSpring, useTransform } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { formatAccuracy } from '../../core/color/accuracy';
import { rgbToCss, rgbToHex, type RGB } from '../../core/color/types';
import { formatTime } from '../../core/game/scoring';

export function ColorPanel({ label, rgb, children, accent }: { label: string; rgb: RGB | null; children?: ReactNode; accent: string }) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[36px] bg-night-2 p-3">
      <div className="mb-3 flex items-center justify-between px-3 pt-1">
        <span className="font-display text-xl font-bold tracking-wide" style={{ color: accent }}>
          {label}
        </span>
        <span className="font-display text-sm font-semibold text-white/40 tabular">{rgb ? rgbToHex(rgb) : '—'}</span>
      </div>
      <motion.div
        className="relative flex-1 rounded-[28px]"
        animate={{ backgroundColor: rgb ? rgbToCss(rgb) : '#2E2B4D' }}
        transition={{ duration: 0.12, ease: 'linear' }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Precisión con suavizado (la lectura llega a 20 Hz; el número se mueve sin saltos). */
export function AccuracyMeter({ value, threshold, active }: { value: number | null; threshold?: number; active: boolean }) {
  const spring = useSpring(value ?? 0, { stiffness: 170, damping: 26 });
  useEffect(() => spring.set(value ?? 0), [value, spring]);
  const text = useTransform(spring, (v) => formatAccuracy(Math.max(0, Math.min(100, v))));
  const width = useTransform(spring, (v) => `${Math.max(0, Math.min(100, v))}%`);
  const hit = threshold !== undefined && value !== null && value >= threshold;
  return (
    <div className="flex items-center gap-8 rounded-[32px] bg-night-2 px-8 py-5">
      <div className="w-[230px] shrink-0">
        <div className="font-display text-sm font-bold tracking-[0.2em] text-white/50">PRECISIÓN</div>
        <div className="flex items-baseline font-display font-bold leading-none tabular">
          <motion.span className="text-[64px]" style={{ color: hit ? '#27B88A' : 'white' }}>
            {active && value !== null ? text : '--.-'}
          </motion.span>
          <span className="ml-1 text-3xl text-white/60">%</span>
        </div>
      </div>
      <div className="relative h-7 flex-1 rounded-full bg-white/10">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width, backgroundColor: hit ? '#27B88A' : '#F4BE46' }}
        />
        {threshold !== undefined && (
          <div className="absolute -top-3 -bottom-3 w-1.5 -translate-x-1/2 rounded-full bg-white" style={{ left: `${threshold}%` }}>
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 font-display text-sm font-bold whitespace-nowrap text-white/80">
              {threshold}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Anillo que se llena mientras se sostiene la precisión. */
export function HoldRing({ progress, size = 120 }: { progress: number; size?: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label={`Estabilidad ${Math.round(progress * 100)}%`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="#27B88A"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="57" textAnchor="middle" fontFamily="Space Grotesk" fontWeight="700" fontSize="22" fill="white">
        {progress > 0 ? 'SOSTENÉ' : ''}
      </text>
    </svg>
  );
}

/** Reloj: tiempo de juego grande y barra con el tiempo que queda. */
export function GameClock({ elapsed, remaining, limit }: { elapsed: number; remaining: number; limit: number }) {
  const low = remaining <= 10_000;
  return (
    <div className="flex min-w-[260px] flex-col items-end">
      <div className={`font-display text-[56px] leading-none font-bold tabular ${low ? 'text-coral' : 'text-white'}`}>
        {formatTime(elapsed)}
        <span className="ml-1 text-2xl text-white/50">s</span>
      </div>
      <div className="mt-2 flex w-full items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${low ? 'bg-coral' : 'bg-white/70'}`}
            style={{ width: `${(remaining / limit) * 100}%` }}
          />
        </div>
        <span className={`font-display text-sm font-bold tabular ${low ? 'text-coral' : 'text-white/60'}`}>
          quedan {Math.ceil(remaining / 1000)} s
        </span>
      </div>
    </div>
  );
}
