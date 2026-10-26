/**
 * Actualización del firmware del cubo por Bluetooth (OTA), desde Ajustes.
 * Usa el firmware empaquetado en la app (npm run firmware:bundle) o un .bin elegido.
 */
import { useEffect, useRef, useState } from 'react';
import { cubeLink, useCube } from '../../store/cubeStore';
import { Button } from './Button';

interface Manifest {
  fw: number;
  size: number;
  md5: string;
  built: string;
}

type State =
  | { kind: 'idle' }
  | { kind: 'running'; sent: number; total: number; bytesPerSec: number }
  | { kind: 'restarting' }
  | { kind: 'done'; fw: number | null }
  | { kind: 'error'; message: string };

const kb = (n: number) => `${Math.round(n / 1024)} KB`;

export function FirmwareUpdater() {
  const { status, kind, fw, caps } = useCube();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const connected = status === 'connected';
  const canOta = connected && caps.includes('ota');

  useEffect(() => {
    fetch('/firmware/manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Manifest | null) => setManifest(m))
      .catch(() => setManifest(null));
  }, []);

  // Después de instalar, el cubo se reinicia y la app se reconecta sola.
  useEffect(() => {
    if (state.kind === 'restarting' && status === 'connected' && fw !== null) setState({ kind: 'done', fw });
  }, [state.kind, status, fw]);

  const install = async (bin: Uint8Array) => {
    abort.current = new AbortController();
    setState({ kind: 'running', sent: 0, total: bin.length, bytesPerSec: 0 });
    try {
      await cubeLink.updateFirmware(
        bin,
        (p) => setState({ kind: 'running', sent: p.sent, total: p.total, bytesPerSec: p.bytesPerSec }),
        abort.current.signal,
      );
      setState({ kind: 'restarting' });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  };

  const installBundled = async () => {
    try {
      const res = await fetch('/firmware/cubo.bin', { cache: 'no-store' });
      if (!res.ok) throw new Error('No se encontró el firmware empaquetado (npm run firmware:bundle)');
      await install(new Uint8Array(await res.arrayBuffer()));
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    await install(new Uint8Array(await f.arrayBuffer()));
    if (fileInput.current) fileInput.current.value = '';
  };

  const running = state.kind === 'running';
  const pct = running ? state.sent / state.total : 0;
  const eta = running && state.bytesPerSec > 0 ? Math.ceil((state.total - state.sent) / state.bytesPerSec) : null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-night p-4">
      <span className="font-display text-lg font-bold">Firmware del cubo</span>
      <span className="text-sm font-semibold text-white/65">
        {!connected
          ? 'Conectá el cubo para ver su versión.'
          : kind === 'mock'
            ? 'Simulador: la actualización se simula para probar el proceso.'
            : canOta
              ? `Versión ${fw ?? '?'} · se actualiza por Bluetooth.`
              : `Versión ${fw ?? 1} · este firmware no se actualiza por Bluetooth: cargá una vez por USB la versión ${manifest?.fw ?? 3} o más nueva.`}
      </span>

      {running ? (
        <>
          <div className="h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-mint transition-[width] duration-150" style={{ width: `${pct * 100}%` }} />
          </div>
          <div className="flex items-center justify-between text-sm font-semibold text-white/70 tabular">
            <span>
              {Math.floor(pct * 100)} % · {kb(state.sent)} de {kb(state.total)}
              {state.bytesPerSec > 0 && ` · ${(state.bytesPerSec / 1024).toFixed(1)} KB/s`}
              {eta !== null && ` · faltan ~${eta > 90 ? `${Math.ceil(eta / 60)} min` : `${eta} s`}`}
            </span>
            <Button tone="night" size="sm" onClick={() => abort.current?.abort()}>
              Cancelar
            </Button>
          </div>
          <span className="text-xs font-semibold text-sun">No cierres la página ni alejes la computadora del cubo.</span>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button tone="mint" size="sm" disabled={!canOta || !manifest} onClick={() => void installBundled()}>
            {manifest ? `Instalar v${manifest.fw} (${kb(manifest.size)})` : 'Sin firmware empaquetado'}
          </Button>
          <Button tone="white" size="sm" disabled={!canOta} onClick={() => fileInput.current?.click()}>
            Elegir .bin…
          </Button>
          <input ref={fileInput} type="file" accept=".bin" hidden onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Archivo de firmware" />
        </div>
      )}
      {state.kind === 'restarting' && <span className="text-sm font-semibold text-sun">Instalado. El cubo se reinicia y la app se reconecta sola…</span>}
      {state.kind === 'done' && <span className="text-sm font-semibold text-mint">Listo: el cubo está con el firmware v{state.fw}.</span>}
      {state.kind === 'error' && <span className="text-sm font-semibold text-coral">{state.message}</span>}
      {manifest && !running && (
        <span className="text-xs font-semibold text-white/40">
          Empaquetado: v{manifest.fw}, {new Date(manifest.built).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}. Si se corta, el cubo sigue con el firmware anterior.
        </span>
      )}
    </div>
  );
}
