import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** Composición de referencia: 1440×900. Se escala para llenar la ventana sin scroll. */
export const STAGE_W = 1440;
export const STAGE_H = 900;

const ScaleContext = createContext(1);
export const useStageScale = () => useContext(ScaleContext);

function computeScale(): number {
  return Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
}

export function Stage({ children, background }: { children: ReactNode; background: string }) {
  const [scale, setScale] = useState(() => (typeof window === 'undefined' ? 1 : computeScale()));
  useEffect(() => {
    const on = () => setScale(computeScale());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden transition-colors duration-300" style={{ background }}>
      <div
        className="absolute top-1/2 left-1/2 overflow-hidden"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <ScaleContext.Provider value={scale}>{children}</ScaleContext.Provider>
      </div>
    </div>
  );
}
