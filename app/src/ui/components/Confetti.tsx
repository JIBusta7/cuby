import { motion } from 'motion/react';
import { useMemo } from 'react';
import { PALETTE } from '../theme/palette';
import { Shape, type ShapeKind } from './Shapes';

const KINDS: ShapeKind[] = ['circle', 'triangle', 'square', 'diamond'];
const COLORS = [PALETTE.sun, PALETTE.coral, PALETTE.mint, PALETTE.ocean, '#FFFFFF'];

/** Lluvia de formas para las victorias. Liviana: ~36 SVG animados por transform. */
export function Confetti({ count = 36 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        kind: KINDS[i % KINDS.length]!,
        color: COLORS[(i * 7) % COLORS.length]!,
        x: Math.random() * 100,
        size: 14 + Math.random() * 26,
        delay: Math.random() * 0.5,
        duration: 2.2 + Math.random() * 1.6,
        rotate: (Math.random() - 0.5) * 720,
        drift: (Math.random() - 0.5) * 160,
      })),
    [count],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b, i) => (
        <motion.div
          key={i}
          className="absolute -top-12"
          style={{ left: `${b.x}%` }}
          initial={{ y: -40, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', x: b.drift, rotate: b.rotate, opacity: [1, 1, 0.8] }}
          transition={{ duration: b.duration, delay: b.delay, ease: [0.2, 0.6, 0.4, 1] }}
        >
          <Shape kind={b.kind} color={b.color} size={b.size} />
        </motion.div>
      ))}
    </div>
  );
}
