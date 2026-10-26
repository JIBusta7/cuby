import { useIsPresent } from 'motion/react';
import { useEffect, useRef } from 'react';

type Handler = (e: KeyboardEvent) => void;

/**
 * Atajos de teclado de una pantalla. Mientras se escribe en un campo de texto
 * solo se atienden Enter y Escape. Una pantalla que está saliendo (animación
 * de salida) deja de escuchar en el acto: si no, una tecla la atenderían dos
 * pantallas a la vez.
 */
export function useKeys(map: Record<string, Handler>, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;
  const present = useIsPresent();
  const active = enabled && present;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing && e.key !== 'Enter' && e.key !== 'Escape') return;
      const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const h = ref.current[key];
      if (h) {
        e.preventDefault();
        h(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
