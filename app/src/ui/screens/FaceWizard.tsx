/**
 * Asistente "Identificar caras": averigua qué eje del sensor apunta hacia
 * afuera de cada cara (depende de cómo se montó el MPU6050). El cubo ilumina
 * una cara; el jugador la pone hacia arriba y confirma. El mapa se guarda en la
 * app y en el cubo (FMAP), y lo usa Physical Target para mostrar el objetivo
 * en la cara de arriba.
 */
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { AXES, dominantAxis, isValidFaceMap, type Axis } from '../../core/orientation/faces';
import { cubeLink, useCube } from '../../store/cubeStore';
import { useSettings } from '../../store/settingsStore';
import { Button, KeyCap } from '../components/Button';
import { useKeys } from '../hooks/useKeys';
import { CubeView } from '../three/CubeView';

const MIN_ALIGNMENT = 0.85; // ~32° de tolerancia respecto de la vertical

export function FaceWizard({ onClose }: { onClose: () => void }) {
  const sample = useCube((s) => s.sample);
  const kind = useCube((s) => s.kind);
  const setSettings = useSettings((s) => s.set);
  const [face, setFace] = useState(0);
  const [axes, setAxes] = useState<Axis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) void cubeLink.send({ type: 'LIGHT', face: face + 1 }).catch(() => false);
  }, [face, done]);

  const finish = async (map: Axis[]) => {
    setDone(true);
    setSettings({ faceAxes: map, faceMapConfirmed: true });
    await cubeLink.send({ type: 'FMAP', axes: map }).catch(() => false);
    await cubeLink.send({ type: 'LIGHT', face: 0 }).catch(() => false);
    await cubeLink.send({ type: 'ANIM', anim: 'IDLE' }).catch(() => false);
  };

  const cancel = () => {
    void cubeLink.send({ type: 'LIGHT', face: 0 }).catch(() => false);
    void cubeLink.send({ type: 'ANIM', anim: 'IDLE' }).catch(() => false);
    onClose();
  };

  const up = sample?.up;
  const axis = up ? dominantAxis(up) : null;
  const alignment = up ? Math.max(Math.abs(up.x), Math.abs(up.y), Math.abs(up.z)) : 0;

  const confirm = () => {
    if (done) return onClose();
    if (!up || !axis) return setError('No llegan datos del cubo.');
    if (alignment < MIN_ALIGNMENT) return setError('Apoyá el cubo bien derecho, con la cara iluminada hacia arriba.');
    const used = axes.indexOf(axis);
    if (used !== -1) return setError(`Esa posición ya la marcaste para la cara ${used + 1}. ¿Giraste el cubo?`);
    setError(null);
    const next = [...axes, axis];
    setAxes(next);
    if (next.length === 6) {
      if (isValidFaceMap(next)) void finish(next);
      else setError('El mapa no es válido. Empezá de nuevo.');
    } else setFace(face + 1);
  };

  useKeys({ Space: confirm, Enter: confirm, Escape: cancel });

  return (
    <motion.div className="absolute inset-0 z-50 grid place-items-center bg-night/80 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div
        className="chunk grid w-[1040px] grid-cols-[1fr_380px] gap-8 rounded-[44px] bg-white p-10 text-night"
        initial={{ scale: 0.9, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        role="dialog"
        aria-label="Identificar caras"
      >
        <div className="flex flex-col gap-5">
          <span className="font-display text-sm font-bold tracking-[0.2em] text-night/50">IDENTIFICAR CARAS</span>
          {done ? (
            <>
              <h2 className="font-display text-5xl font-bold">¡Listo!</h2>
              <p className="text-lg font-semibold text-night/70">
                El cubo ya sabe qué cara está arriba. Physical Target queda habilitado.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-display text-5xl leading-tight font-bold">
                Poné la cara <span className="rounded-xl bg-grape px-3 text-white">{face + 1}</span> hacia arriba
              </h2>
              <p className="text-lg font-semibold text-night/70">
                Es la que está iluminada en blanco. Apoyá el cubo sobre la mesa y confirmá.
                {face === 0 && ' Antes, calibrá la posición neutral con la cara 6 (la del cable) apoyada.'}
              </p>
            </>
          )}
          <div className="flex gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <span
                key={i}
                className={`grid h-14 w-14 place-items-center rounded-2xl font-display text-xl font-bold ${i < axes.length ? 'bg-mint' : i === face && !done ? 'bg-sun' : 'bg-night/10'}`}
              >
                {i < axes.length ? axes[i] : i + 1}
              </span>
            ))}
          </div>
          <div className="rounded-2xl bg-night/5 p-4 font-semibold">
            Lectura: {axis ? `${axis} · ${Math.round(alignment * 100)} % vertical` : 'sin datos'}
            <div className="mt-2 flex gap-1">
              {AXES.map((a) => (
                <span key={a} className={`rounded-md px-2 py-0.5 text-xs font-bold ${a === axis ? 'bg-night text-white' : 'bg-night/10'}`}>
                  {a}
                </span>
              ))}
            </div>
          </div>
          {error && <div className="rounded-2xl bg-coral/30 p-4 font-semibold">{error}</div>}
          <div className="mt-auto flex items-center gap-3">
            <Button tone="sun" size="lg" onClick={confirm}>
              {done ? 'Cerrar' : 'Confirmar'} <KeyCap className="ml-2">SPACE</KeyCap>
            </Button>
            {!done && (
              <Button tone="night" size="md" onClick={cancel}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-[32px] bg-night">
          <CubeView className="h-[340px] w-[340px]" interactive={kind === 'mock'} distance={4.2} />
          {kind === 'mock' && <span className="pb-4 text-sm font-semibold text-white/60">Simulador: arrastrá el cubo</span>}
        </div>
      </motion.div>
    </motion.div>
  );
}
