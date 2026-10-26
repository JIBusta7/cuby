/**
 * Diagnóstico en vivo del enlace con el cubo: cuántos datos llegan por
 * segundo, si se pierden o llegan rotos, si el sensor se reinició, y la
 * lectura de "arriba" en crudo. Sirve para separar un problema de Bluetooth
 * (datos que no llegan) de uno del sensor (datos que llegan pero no cambian).
 */
import { useEffect, useState } from 'react';
import { cubeLink, useCube } from '../../store/cubeStore';
import type { LinkStats } from '../../transport/cubeLink';

function useLiveStats(): { stats: LinkStats; up: { x: number; y: number; z: number } | null } {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  return { stats: cubeLink.stats, up: cubeLink.sample?.up ?? null };
}

export function LinkDiagnostics({ compact = false }: { compact?: boolean }) {
  const connected = useCube((s) => s.status === 'connected');
  const { stats, up } = useLiveStats();
  if (!connected) return null;
  const rateOk = stats.rate >= 15;
  const fresh = stats.ageMs < 800;
  const rows: [string, string, boolean][] = [
    ['Datos', `${stats.rate.toFixed(1)}/s`, rateOk],
    ['Último', fresh ? `hace ${Math.round(stats.ageMs)} ms` : stats.ageMs === Infinity ? 'nunca' : `hace ${(stats.ageMs / 1000).toFixed(1)} s`, fresh],
    ['Perdidos', String(stats.lost), stats.lost < 20],
    ['Rotos', String(stats.invalid), stats.invalid < 5],
    ['Sensor', stats.imuResets === null ? 'sin datos (fw v1)' : stats.imuResets === 0 ? 'OK' : `${stats.imuResets} reinicios`, stats.imuResets === null || stats.imuResets === 0],
  ];
  return (
    <div className={`rounded-2xl bg-night font-display tabular ${compact ? 'p-3 text-xs' : 'p-4 text-sm'}`}>
      <div className={`grid ${compact ? 'grid-cols-5 gap-2' : 'grid-cols-[auto_1fr] gap-x-4 gap-y-1'}`}>
        {rows.map(([k, v, ok]) =>
          compact ? (
            <div key={k} className="flex flex-col">
              <span className="text-white/45">{k}</span>
              <span className={`font-bold ${ok ? 'text-white' : 'text-sun'}`}>{v}</span>
            </div>
          ) : (
            <div key={k} className="contents">
              <span className="font-semibold text-white/50">{k}</span>
              <span className={`font-bold ${ok ? 'text-white' : 'text-sun'}`}>{v}</span>
            </div>
          ),
        )}
      </div>
      <div className={`${compact ? 'mt-2' : 'mt-3'} font-bold text-white/80`}>
        Arriba: {up ? `x ${up.x.toFixed(3)} · y ${up.y.toFixed(3)} · z ${up.z.toFixed(3)}` : '—'}
      </div>
      {!compact && (
        <p className="mt-2 text-xs font-semibold text-white/45">
          Girá el cubo: estos números tienen que cambiar. Si llegan datos pero no cambian, es el sensor; si no llegan, es el Bluetooth.
        </p>
      )}
    </div>
  );
}
