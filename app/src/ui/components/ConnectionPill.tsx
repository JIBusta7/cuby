import { useCube } from '../../store/cubeStore';
import type { LinkStatus } from '../../transport/types';

const LABEL: Record<LinkStatus, string> = {
  idle: 'Sin cubo',
  connecting: 'Conectando…',
  connected: 'Conectado',
  reconnecting: 'Reconectando…',
  disconnected: 'Desconectado',
  error: 'Error de conexión',
};

const DOT: Record<LinkStatus, string> = {
  idle: 'bg-white/40',
  connecting: 'bg-sun animate-pulse',
  connected: 'bg-mint',
  reconnecting: 'bg-sun animate-pulse',
  disconnected: 'bg-coral',
  error: 'bg-coral',
};

export function ConnectionPill({ onClick }: { onClick?: () => void }) {
  const { status, kind, deviceName, stale, fw } = useCube();
  const name = status === 'connected' ? (kind === 'mock' ? 'Simulador' : (deviceName ?? 'CUBY')) : LABEL[status];
  const dot = status === 'connected' && stale ? 'bg-sun animate-pulse' : DOT[status];
  return (
    <button
      type="button"
      onClick={onClick}
      className="chunk-sm inline-flex h-12 items-center gap-3 rounded-full bg-night/80 px-5 font-display text-base font-bold text-white backdrop-blur cursor-pointer"
      aria-label={`Estado del cubo: ${name}`}
    >
      <span className={`h-3 w-3 rounded-full ${dot}`} />
      <span>{name}</span>
      {status === 'connected' && kind === 'real' && fw !== null && (
        <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70">fw {fw}</span>
      )}
      {status === 'connected' && stale && <span className="text-xs font-semibold text-sun">sin datos</span>}
    </button>
  );
}
