import { motion, useIsPresent } from 'motion/react';
import type { ReactNode } from 'react';
import { IconBack } from './Icons';
import { KeyCap } from './Button';

/** Contenedor de pantalla a 1440×900 de referencia, sin scroll. */
export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  // La pantalla que se está yendo no recibe foco, clics ni teclas.
  const present = useIsPresent();
  return (
    <motion.main
      inert={!present}
      className={`absolute inset-0 flex flex-col overflow-hidden ${present ? '' : 'pointer-events-none'} ${className}`}
      initial={{ opacity: 0, y: 24, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
    >
      {children}
    </motion.main>
  );
}

export function BackButton({ onClick, label = 'Volver' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chunk-sm inline-flex h-12 items-center gap-2 rounded-full bg-white/12 pr-4 pl-3 font-display text-base font-bold text-white cursor-pointer hover:bg-white/20"
    >
      <IconBack />
      {label}
      <KeyCap className="ml-1 h-7 min-w-7 text-xs">Esc</KeyCap>
    </button>
  );
}

/** Logo CUBY: cuatro fichas de colores, una por letra (como las caras del cubo). */
export function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const big = size === 'lg';
  const tile = big ? 'h-[128px] w-[128px] text-[100px] rounded-[30px]' : 'h-10 w-10 text-[28px] rounded-[10px]';
  const letters: [string, string, number][] = [
    ['C', 'bg-coral text-night', -5],
    ['U', 'bg-sun text-night', 3],
    ['B', 'bg-ocean text-white', -3],
    ['Y', 'bg-mint text-night', 5],
  ];
  return (
    <div className={`flex ${big ? 'gap-4' : 'gap-1.5'}`} aria-label="CUBY" role="img">
      {letters.map(([l, c, tilt], i) => (
        <motion.span
          key={l}
          aria-hidden
          className={`chunk-sm grid place-items-center font-display font-bold leading-none ${tile} ${c}`}
          initial={{ y: -30, opacity: 0, rotate: -12 }}
          animate={{ y: 0, opacity: 1, rotate: big ? tilt : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.08 * i }}
        >
          {l}
        </motion.span>
      ))}
    </div>
  );
}
