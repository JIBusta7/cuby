import { AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_RULES } from '../../core/game/modes';
import { TOTAL_LEDS } from '../../core/leds/ledModel';
import { useApp } from '../../store/appStore';
import { cubeLink, useCube } from '../../store/cubeStore';
import { useLeaderboard } from '../../store/leaderboardStore';
import { MAX_BRIGHTNESS, useSettings, type MotionPreference } from '../../store/settingsStore';
import { isWebBluetoothAvailable } from '../../transport/RealCubeTransport';
import { Button } from '../components/Button';
import { ConnectionPill } from '../components/ConnectionPill';
import { FirmwareUpdater } from '../components/FirmwareUpdater';
import { LinkDiagnostics } from '../components/LinkDiagnostics';
import { BackButton, Screen } from '../components/Screen';
import { useKeys } from '../hooks/useKeys';
import { FaceWizard } from './FaceWizard';

function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-4 rounded-[32px] bg-night-2 p-7 ${className}`}>
      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-2xl bg-night p-1.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`h-11 flex-1 cursor-pointer rounded-xl px-4 font-display text-base font-bold ${value === v ? 'bg-sun text-night' : 'text-white/70 hover:text-white'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex justify-between text-sm font-semibold text-white/75">
        {label}
        <span className="font-display text-base font-bold text-white tabular">{format(value)}</span>
      </span>
      <input type="range" className="range-chunk" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function SettingsScreen() {
  const { go, back } = useApp();
  const s = useSettings();
  const cube = useCube();
  const clearBoards = useLeaderboard((x) => x.clear);
  const [wizard, setWizard] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [calMsg, setCalMsg] = useState<string | null>(null);
  const briTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connected = cube.status === 'connected';
  const busy = cube.status === 'connecting' || cube.status === 'reconnecting';
  const canMap = connected && (cube.kind === 'mock' || cube.caps.includes('fmap'));

  const leave = () => go(back === 'modes' || back === 'setup' || back === 'lights' ? back : 'home');
  useKeys({ Escape: leave }, !wizard);

  useEffect(() => () => {
    if (briTimer.current) clearTimeout(briTimer.current);
  }, []);

  const setBrightness = (v: number) => {
    s.set({ brightness: v });
    if (briTimer.current) clearTimeout(briTimer.current);
    briTimer.current = setTimeout(() => void cubeLink.send({ type: 'BRI', value: v }).catch(() => false), 120);
  };

  const calibrate = async () => {
    setCalMsg('Calibrando… no muevas el cubo');
    const ok = await cubeLink.send({ type: 'CAL' }).catch(() => false);
    setTimeout(() => setCalMsg(ok ? 'Posición neutral guardada en el cubo' : 'No se pudo calibrar'), 1400);
  };

  const fwText = !connected
    ? 'Sin conexión'
    : cube.kind === 'mock'
      ? 'Simulador: se comporta como el firmware v3'
      : cube.caps.length > 0
        ? `Firmware v${cube.fw ?? 2}: ${cube.caps.join(', ')}`
        : 'Firmware original: el juego funciona, pero el cubo no muestra animaciones ni Physical Target';

  return (
    <Screen className="bg-night">
      <header className="flex items-center justify-between px-10 pt-8">
        <BackButton onClick={leave} />
        <h1 className="font-display text-[44px] font-bold tracking-tight">Ajustes</h1>
        <ConnectionPill />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-3 gap-6 px-10 pt-6 pb-8">
        <div className="flex min-h-0 flex-col gap-6">
          <Card title="Conexión">
            <Segmented
              value={s.transport}
              options={[
                ['mock', 'Simulador'],
                ['real', 'Cubo real'],
              ]}
              onChange={(v) => s.set({ transport: v })}
            />
            <p className="text-sm font-semibold text-white/65">
              {s.transport === 'real'
                ? isWebBluetoothAvailable()
                  ? 'Bluetooth Low Energy, dispositivo “CUBY”. El navegador va a mostrar su selector.'
                  : 'Este navegador no tiene Web Bluetooth. Usá Chrome o Edge de escritorio.'
                : 'Un cubo virtual que se comporta como el firmware. Para jugar y probar sin hardware.'}
            </p>
            <div className="flex gap-3">
              {connected && cube.kind === s.transport ? (
                <Button tone="coral" size="sm" onClick={() => void cube.disconnect()}>
                  Desconectar
                </Button>
              ) : (
                <Button
                  tone="sun"
                  size="sm"
                  disabled={busy || (s.transport === 'real' && !isWebBluetoothAvailable())}
                  onClick={() => void cube.connect(s.transport)}
                >
                  {busy ? 'Conectando…' : 'Conectar'}
                </Button>
              )}
            </div>
            {cube.detail && cube.status !== 'connected' && <p className="text-sm font-semibold text-coral">{cube.detail}</p>}
            <p className="rounded-2xl bg-night px-4 py-3 text-sm font-semibold text-white/70">{fwText}</p>
            <LinkDiagnostics />
          </Card>
        </div>

        <Card title="Cubo">
          <Slider
            label="Brillo de los LEDs (tope de seguridad 30 %)"
            value={s.brightness}
            min={0}
            max={MAX_BRIGHTNESS}
            step={1}
            format={(v) => `${Math.round((v / 255) * 100)} %`}
            onChange={setBrightness}
          />
          <div className="flex flex-col gap-2 rounded-2xl bg-night p-4">
            <span className="font-display text-lg font-bold">Posición neutral</span>
            <span className="text-sm font-semibold text-white/65">
              Apoyá el cubo sobre la cara 6 (la del cable) y no lo muevas durante un segundo.
            </span>
            <div className="flex items-center gap-3">
              <Button tone="white" size="sm" disabled={!connected} onClick={() => void calibrate()}>
                Calibrar
              </Button>
              {calMsg && <span className="text-sm font-semibold text-sun">{calMsg}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl bg-night p-4">
            <span className="font-display text-lg font-bold">Identificar caras</span>
            <span className="text-sm font-semibold text-white/65">
              Necesario para Physical Target: el cubo aprende qué cara está arriba.{' '}
              {s.faceMapConfirmed ? `Mapa guardado: ${s.faceAxes.join(' ')}` : 'Todavía sin identificar.'}
            </span>
            <div>
              <Button tone="white" size="sm" disabled={!canMap} onClick={() => setWizard(true)}>
                Empezar
              </Button>
            </div>
          </div>
          <FirmwareUpdater />
          <p className="mt-auto text-xs font-semibold text-white/45">
            {TOTAL_LEDS} LEDs: 6 caras de 7×7; la cara 6 (inferior) no tiene LED en el centro porque por ahí sale el cable.
          </p>
        </Card>

        <div className="flex min-h-0 flex-col gap-6">
          <Card title="Reglas">
            <Slider
              label="Timed / Physical: precisión para ganar"
              value={s.matchThreshold}
              min={80}
              max={99}
              step={1}
              format={(v) => `${v} %`}
              onChange={(v) => s.set({ matchThreshold: v })}
            />
            <Slider
              label="Timed / Physical: sostenerla durante"
              value={s.matchHoldMs}
              min={200}
              max={1500}
              step={100}
              format={(v) => `${v} ms`}
              onChange={(v) => s.set({ matchHoldMs: v })}
            />
            <Slider
              label="Speed: precisión para avanzar"
              value={s.speedThreshold}
              min={75}
              max={98}
              step={1}
              format={(v) => `${v} %`}
              onChange={(v) => s.set({ speedThreshold: v })}
            />
            <Slider
              label="Speed: sostenerla durante"
              value={s.speedHoldMs}
              min={0}
              max={1000}
              step={100}
              format={(v) => `${v} ms`}
              onChange={(v) => s.set({ speedHoldMs: v })}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/50">
                Por defecto {DEFAULT_RULES.matchThreshold} % / {DEFAULT_RULES.matchHoldMs} ms. Las partidas con otras reglas se marcan en el ranking.
              </span>
              <Button tone="night" size="sm" onClick={s.resetRules}>
                Restablecer
              </Button>
            </div>
            <div className="border-t border-white/10 pt-4">
            {confirmClear ? (
              <div className="flex items-center gap-3">
                <span className="flex-1 text-sm font-semibold">¿Borrar todos los rankings? No se puede deshacer.</span>
                <Button
                  tone="coral"
                  size="sm"
                  onClick={() => {
                    void clearBoards();
                    setConfirmClear(false);
                  }}
                >
                  Borrar
                </Button>
                <Button tone="night" size="sm" onClick={() => setConfirmClear(false)}>
                  No
                </Button>
              </div>
            ) : (
              <div>
                <Button tone="night" size="sm" onClick={() => setConfirmClear(true)}>
                  Borrar rankings
                </Button>
              </div>
            )}
            </div>
          </Card>
          <Card title="Accesibilidad">
            <span className="text-sm font-semibold text-white/65">Animaciones</span>
            <Segmented<MotionPreference>
              value={s.motion}
              options={[
                ['system', 'Sistema'],
                ['reduce', 'Reducidas'],
                ['full', 'Completas'],
              ]}
              onChange={(v) => s.set({ motion: v })}
            />
          </Card>
        </div>
      </div>
      <AnimatePresence>{wizard && <FaceWizard onClose={() => setWizard(false)} />}</AnimatePresence>
    </Screen>
  );
}
