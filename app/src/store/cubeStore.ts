/**
 * Estado del cubo para la UI. La fuente de verdad es CubeLink; esto lo refleja
 * en Zustand para que los componentes se re-rendericen.
 */
import { create } from 'zustand';
import type { Capability } from '../core/protocol/commands';
import { CubeLink, type CubeSample, type LinkSnapshot } from '../transport/cubeLink';
import type { LinkStatus, TransportKind } from '../transport/types';
import { useSettings } from './settingsStore';

const s0 = useSettings.getState();
export const cubeLink = new CubeLink({
  brightness: s0.brightness,
  faceAxes: s0.faceAxes,
  faceMapConfirmed: s0.faceMapConfirmed,
});

useSettings.subscribe((s) =>
  cubeLink.setPreferences({ brightness: s.brightness, faceAxes: s.faceAxes, faceMapConfirmed: s.faceMapConfirmed }),
);

interface CubeStore {
  kind: TransportKind;
  status: LinkStatus;
  detail: string | null;
  deviceName: string | null;
  fw: number | null;
  caps: readonly Capability[];
  sample: CubeSample | null;
  stale: boolean;
  connect(kind: TransportKind): Promise<void>;
  disconnect(): Promise<void>;
}

const fromSnapshot = (s: LinkSnapshot) => ({
  kind: s.kind,
  status: s.status,
  detail: s.detail,
  deviceName: s.deviceName,
  fw: s.fw,
  caps: s.caps,
});

export const useCube = create<CubeStore>(() => ({
  ...fromSnapshot(cubeLink.state),
  sample: null,
  stale: true,
  async connect(kind) {
    useSettings.getState().set({ transport: kind });
    try {
      await cubeLink.connect(kind);
    } catch {
      /* el detalle queda en el estado (detail) */
    }
  },
  async disconnect() {
    await cubeLink.disconnect();
  },
}));

cubeLink.onChange((snap) => useCube.setState({ ...fromSnapshot(snap), ...(snap.status !== 'connected' ? { sample: null, stale: true } : {}) }));
cubeLink.onSample((sample) => useCube.setState({ sample, stale: false }));

// Datos viejos: el cubo dejó de mandar sin cortar la conexión.
setInterval(() => {
  const stale = cubeLink.connected && cubeLink.isStale();
  if (stale !== useCube.getState().stale && cubeLink.connected) useCube.setState({ stale });
}, 250);
