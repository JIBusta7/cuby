import { useEffect, useState } from 'react';
import { useSettings } from '../../store/settingsStore';

/** true si hay que reducir el movimiento (preferencia del sistema o ajuste manual). */
export function useReducedMotion(): boolean {
  const pref = useSettings((s) => s.motion);
  const [system, setSystem] = useState(() =>
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return pref === 'reduce' || (pref === 'system' && system);
}
