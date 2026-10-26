/** Formas geométricas de fondo (identidad visual). Se quedan quietas con movimiento reducido. */
import { motion } from 'motion/react';
import { useReducedMotion } from '../hooks/useMotionPref';

export type ShapeKind = 'circle' | 'triangle' | 'square' | 'diamond';

export function Shape({ kind, color, size, className = '', style }: {
  kind: ShapeKind;
  color: string;
  size: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const common = { width: size, height: size, className, style } as const;
  switch (kind) {
    case 'circle':
      return <svg viewBox="0 0 100 100" {...common}><circle cx="50" cy="50" r="50" fill={color} /></svg>;
    case 'triangle':
      return <svg viewBox="0 0 100 100" {...common}><path d="M50 4 98 92H2z" fill={color} /></svg>;
    case 'square':
      return <svg viewBox="0 0 100 100" {...common}><rect x="0" y="0" width="100" height="100" rx="14" fill={color} /></svg>;
    case 'diamond':
      return <svg viewBox="0 0 100 100" {...common}><path d="M50 0 100 50 50 100 0 50z" fill={color} /></svg>;
  }
}

interface Floating {
  kind: ShapeKind;
  color: string;
  size: number;
  x: string;
  y: string;
  rotate?: number;
  opacity?: number;
}

export function FloatingShapes({ shapes }: { shapes: readonly Floating[] }) {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {shapes.map((s, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: s.x, top: s.y, opacity: s.opacity ?? 1 }}
          initial={{ rotate: s.rotate ?? 0, scale: 0.6, opacity: 0 }}
          animate={
            reduce
              ? { rotate: s.rotate ?? 0, scale: 1, opacity: s.opacity ?? 1 }
              : {
                  rotate: [(s.rotate ?? 0) - 6, (s.rotate ?? 0) + 6],
                  y: [0, i % 2 ? 14 : -14],
                  scale: 1,
                  opacity: s.opacity ?? 1,
                }
          }
          transition={
            reduce
              ? { duration: 0.3 }
              : {
                  rotate: { duration: 6 + i, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
                  y: { duration: 5 + i * 0.7, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
                  scale: { type: 'spring', stiffness: 120, damping: 14, delay: 0.05 * i },
                  opacity: { duration: 0.4, delay: 0.05 * i },
                }
          }
        >
          <Shape kind={s.kind} color={s.color} size={s.size} />
        </motion.div>
      ))}
    </div>
  );
}
