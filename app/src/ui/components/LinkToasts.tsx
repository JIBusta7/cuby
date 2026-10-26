import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cubeLink, useCube } from '../../store/cubeStore';
import type { LinkStatus } from '../../transport/types';

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'warn' | 'bad';
}

const MESSAGES: Partial<Record<LinkStatus, [string, Toast['tone']]>> = {
  connected: ['Cubo conectado', 'ok'],
  reconnecting: ['Se cortó el Bluetooth. Reconectando…', 'warn'],
  disconnected: ['El cubo se desconectó', 'bad'],
  error: ['No se pudo conectar', 'bad'],
};

/** Avisos de conexión: aparecen arriba al centro y se van solos. */
export function LinkToasts() {
  const status = useCube((s) => s.status);
  const kind = useCube((s) => s.kind);
  const detail = useCube((s) => s.detail);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prev = useRef<LinkStatus>(status);
  const seq = useRef(0);

  useEffect(() => {
    if (status === prev.current) return;
    const was = prev.current;
    prev.current = status;
    const m = MESSAGES[status];
    if (!m) return;
    if (status === 'connected' && was !== 'reconnecting' && kind === 'mock') return; // el simulador conecta solo al abrir
    const text = status === 'connected' && was === 'reconnecting' ? 'Cubo reconectado' : status === 'error' && detail ? detail : m[0];
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, tone: m[1] }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, [status, kind, detail]);

  // El firmware avisa si tuvo que reinicializar el sensor: casi siempre es un
  // cable flojo del MPU6050 o un bajón de tensión.
  useEffect(
    () =>
      cubeLink.onSensorReset((n) => {
        const id = ++seq.current;
        setToasts((t) => [...t, { id, text: `El sensor se reinició (${n}): revisá los cables del MPU6050`, tone: 'warn' }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
      }),
    [],
  );

  const bg = { ok: 'bg-mint text-night', warn: 'bg-sun text-night', bad: 'bg-coral text-night' } as const;
  return (
    <div className="pointer-events-none absolute top-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`chunk-sm rounded-full px-6 py-3 font-display text-lg font-bold ${bg[t.tone]}`}
            initial={{ y: -30, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0 }}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
