/**
 * Enlace con el cubo: elige el transporte (real o simulado), hace el
 * handshake, mantiene la última lectura, el espejo de LEDs y avisa cambios.
 * No depende de React; la UI se entera por un store de Zustand.
 */
import { orientationToColor } from '../core/color/colorMap';
import type { ColorModeId, RGB, Vec3 } from '../core/color/types';
import { advanceLedState, applyLedCommand, INITIAL_LED_STATE, ledLinkLost, type LedState } from '../core/leds/ledModel';
import { CAPABILITY_OF, type Capability, type CubeCommand } from '../core/protocol/commands';
import type { CubeMessage } from '../core/protocol/messages';
import { DEFAULT_FACE_AXES, isValidFaceMap, type FaceAxes } from '../core/orientation/faces';
import { checkFirmwareImage, md5 } from '../core/firmware/md5';
import { MockCubeTransport } from './MockCubeTransport';
import { RealCubeTransport } from './RealCubeTransport';
import { TransportError, type CubeTransport, type LinkStatus, type TransportKind } from './types';

/** Los juegos usan el modo SIGNED: cubre todo el espacio RGB alcanzable de forma pareja. */
export const GAME_COLOR_MODE: ColorModeId = 0;
/** Sin lecturas durante este tiempo, el dato se considera viejo. */
export const STALE_MS = 800;
const INFO_TIMEOUT_MS = 1200;

export interface CubeSample {
  readonly up: Vec3;
  readonly roll: number;
  readonly pitch: number;
  readonly yaw: number;
  /** Color que informa el cubo (puede ser una animación o un color forzado). */
  readonly reportedRgb: RGB;
  /** Color del jugador: calculado con la misma función que el firmware. */
  readonly playerRgb: RGB;
  readonly mode: ColorModeId;
  readonly btn: boolean;
  readonly at: number;
}

/** Estadísticas del enlace, para el diagnóstico en pantalla. */
export interface LinkStats {
  /** Paquetes de datos por segundo (últimos 2 s). */
  readonly rate: number;
  /** Paquetes perdidos según el número de secuencia (firmware v2). */
  readonly lost: number;
  /** Líneas que llegaron rotas y se descartaron. */
  readonly invalid: number;
  /** Reinicios del MPU6050 informados por el firmware (null si no informa). */
  readonly imuResets: number | null;
  /** ms desde el último paquete de datos (Infinity si no hubo). */
  readonly ageMs: number;
}

export interface LinkSnapshot {
  readonly kind: TransportKind;
  readonly status: LinkStatus;
  readonly detail: string | null;
  readonly deviceName: string | null;
  readonly fw: number | null;
  readonly caps: readonly Capability[];
}

type SampleListener = (s: CubeSample) => void;
type ButtonListener = (ev: 'short' | 'long', at: number) => void;
type ChangeListener = (snap: LinkSnapshot) => void;

export interface LinkPreferences {
  brightness: number;
  faceAxes: FaceAxes;
  faceMapConfirmed: boolean;
}

export class CubeLink {
  private transport: CubeTransport | null = null;
  private unsubscribe: (() => void) | null = null;
  private snapshot: LinkSnapshot = { kind: 'mock', status: 'idle', detail: null, deviceName: null, fw: null, caps: [] };
  private sampleValue: CubeSample | null = null;
  private led: LedState = INITIAL_LED_STATE;
  private infoWaiter: ((caps: Capability[] | null, fw: number | null) => void) | null = null;
  /** Cada connect() recibe un número; uno más nuevo invalida a los anteriores. */
  private connectSeq = 0;
  private arrivals: number[] = [];
  private lastSeq: number | null = null;
  private lost = 0;
  private invalidLines = 0;
  private imuResets: number | null = null;
  private readonly sensorResetListeners = new Set<(count: number) => void>();
  private otaListener: ((m: Extract<CubeMessage, { t: 'ota' }>) => void) | null = null;
  /** Durante una actualización de firmware no se manda nada más al cubo. */
  updating = false;

  private readonly sampleListeners = new Set<SampleListener>();
  private readonly buttonListeners = new Set<ButtonListener>();
  private readonly changeListeners = new Set<ChangeListener>();

  constructor(private prefs: LinkPreferences) {}

  // ---------- Consultas ----------
  get state(): LinkSnapshot {
    return this.snapshot;
  }
  get sample(): CubeSample | null {
    return this.sampleValue;
  }
  get connected(): boolean {
    return this.snapshot.status === 'connected';
  }
  supports(cap: Capability): boolean {
    return this.snapshot.caps.includes(cap);
  }
  isStale(now = performance.now()): boolean {
    return !this.sampleValue || now - this.sampleValue.at > STALE_MS;
  }
  /** Estado de los LEDs según los comandos enviados (lo que muestra el cubo). */
  ledState(now = performance.now()): LedState {
    this.led = advanceLedState(this.led, now);
    return this.led;
  }
  get faceAxes(): FaceAxes {
    return this.prefs.faceAxes;
  }
  get stats(): LinkStats {
    const now = performance.now();
    const recent = this.arrivals.filter((t) => now - t <= 2000);
    return {
      rate: recent.length / 2,
      lost: this.lost,
      invalid: this.invalidLines,
      imuResets: this.imuResets,
      ageMs: this.sampleValue ? now - this.sampleValue.at : Infinity,
    };
  }
  /** Avisa cuando el firmware reinicializó el sensor (cables flojos, bajones de tensión). */
  onSensorReset(l: (count: number) => void): () => void {
    this.sensorResetListeners.add(l);
    return () => this.sensorResetListeners.delete(l);
  }

  /** Controles del simulador, si el transporte actual es el simulado. */
  get mock(): MockCubeTransport | null {
    return this.transport instanceof MockCubeTransport ? this.transport : null;
  }

  // ---------- Suscripciones ----------
  onSample(l: SampleListener): () => void {
    this.sampleListeners.add(l);
    return () => this.sampleListeners.delete(l);
  }
  onButton(l: ButtonListener): () => void {
    this.buttonListeners.add(l);
    return () => this.buttonListeners.delete(l);
  }
  onChange(l: ChangeListener): () => void {
    this.changeListeners.add(l);
    return () => this.changeListeners.delete(l);
  }

  setPreferences(p: Partial<LinkPreferences>): void {
    this.prefs = { ...this.prefs, ...p };
  }

  // ---------- Conexión ----------
  async connect(kind: TransportKind): Promise<void> {
    // Dos conexiones superpuestas (doble clic, efectos repetidos) no pueden
    // dejar dos transportes vivos: gana la última.
    const seq = ++this.connectSeq;
    await this.disconnect();
    if (seq !== this.connectSeq) return;
    const t: CubeTransport = kind === 'mock' ? new MockCubeTransport() : new RealCubeTransport();
    this.transport = t;
    this.update({ kind, status: 'connecting', detail: null, deviceName: null, fw: null, caps: [] });
    this.unsubscribe = t.subscribe({
      // Solo cuenta lo que llega del transporte actual.
      message: (m, at) => {
        if (t === this.transport) this.onMessage(m, at);
      },
      status: (s, detail) => this.onStatus(t, s, detail),
      invalid: () => {
        if (t === this.transport) this.invalidLines++;
      },
    });
    try {
      await t.connect();
    } catch (e) {
      if (t !== this.transport) return;
      this.cleanup();
      this.update({ status: (e as { code?: string }).code === 'cancelled' ? 'idle' : 'error', detail: (e as Error).message });
      throw e;
    }
    if (t !== this.transport) await t.disconnect().catch(() => undefined); // lo reemplazó otro connect()
  }

  async disconnect(): Promise<void> {
    const t = this.transport;
    if (!t) return;
    if (this.connected && this.supports('anim')) await this.send({ type: 'ANIM', anim: 'PLAY' }).catch(() => false);
    await t.disconnect().catch(() => undefined);
    this.cleanup();
    this.update({ status: 'idle', detail: null, deviceName: null, fw: null, caps: [] });
  }

  /**
   * Envía un comando. Si el firmware no declara la capacidad necesaria, no lo
   * manda y devuelve false (el juego sigue sin esa parte, p. ej. sin
   * animaciones en el cubo con el firmware original).
   */
  async send(cmd: CubeCommand): Promise<boolean> {
    const t = this.transport;
    if (!t || !this.connected || (this.updating && cmd.type !== 'OTA')) return false;
    const cap = CAPABILITY_OF[cmd.type];
    if (cap && !this.supports(cap)) return false;
    await t.send(cmd);
    this.led = applyLedCommand(advanceLedState(this.led, performance.now()), cmd, performance.now());
    return true;
  }

  /**
   * Envío en tiempo real (cuadros de audio): sin confirmación y descartable.
   * El espejo de LEDs se actualiza solo si el cuadro salió.
   */
  sendLatest(cmd: CubeCommand): boolean {
    const t = this.transport;
    if (!t || !this.connected || this.updating) return false;
    const cap = CAPABILITY_OF[cmd.type];
    if (cap && !this.supports(cap)) return false;
    if (!t.sendLatest(cmd)) return false;
    this.led = applyLedCommand(advanceLedState(this.led, performance.now()), cmd, performance.now());
    return true;
  }

  /**
   * Actualiza el firmware del cubo por Bluetooth (OTA). Manda "OTA tamaño md5",
   * espera que el cubo esté listo, envía el .bin en bloques confirmados y
   * espera que lo verifique (MD5 + imagen) y se reinicie. Si algo falla, el
   * cubo sigue con el firmware anterior.
   */
  async updateFirmware(
    bin: Uint8Array,
    onProgress: (p: { sent: number; total: number; confirmed: number; bytesPerSec: number }) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const t = this.transport;
    if (!t || !this.connected) throw new TransportError('El cubo no está conectado', 'not-connected');
    if (!this.supports('ota')) {
      throw new TransportError('Este firmware no se actualiza por Bluetooth: cargá una vez por USB la versión con OTA', 'ota');
    }
    const bad = checkFirmwareImage(bin);
    if (bad) throw new TransportError(bad, 'ota');

    let confirmed = 0;
    let failure: string | null = null;
    let doneResolve: () => void = () => undefined;
    const done = new Promise<void>((r) => (doneResolve = r));
    let readyResolve: () => void = () => undefined;
    const ready = new Promise<void>((r) => (readyResolve = r));
    this.otaListener = (m) => {
      if (m.error) {
        failure = m.error;
        readyResolve();
        doneResolve();
      }
      if (m.ready) readyResolve();
      if (m.written !== null) confirmed = m.written;
      if (m.done) doneResolve();
    };
    const timeout = (ms: number, what: string) =>
      new Promise<never>((_, rej) => setTimeout(() => rej(new TransportError(what, 'ota')), ms));

    this.updating = true;
    try {
      await t.send({ type: 'OTA', size: bin.length, md5: md5(bin) });
      await Promise.race([ready, timeout(10_000, 'El cubo no respondió al pedido de actualización')]);
      if (failure) throw new TransportError(`El cubo rechazó la actualización: ${failure}`, 'ota');

      const CHUNK = 244; // entra en un paquete con MTU ≥ 247; si el MTU es menor, BLE lo parte solo
      const t0 = performance.now();
      let lastReport = 0;
      for (let off = 0; off < bin.length; off += CHUNK) {
        if (signal?.aborted) throw new TransportError('Actualización cancelada (el cubo sigue con el firmware anterior)', 'ota');
        if (failure) throw new TransportError(`El cubo canceló la actualización: ${failure}`, 'ota');
        await t.writeRaw(bin.subarray(off, Math.min(bin.length, off + CHUNK)));
        const now = performance.now();
        if (now - lastReport > 150 || off + CHUNK >= bin.length) {
          lastReport = now;
          const sent = Math.min(bin.length, off + CHUNK);
          onProgress({ sent, total: bin.length, confirmed, bytesPerSec: (sent / Math.max(1, now - t0)) * 1000 });
        }
      }
      await Promise.race([done, timeout(30_000, 'El cubo no confirmó la instalación')]);
      if (failure) throw new TransportError(`La verificación falló: ${failure}. El cubo sigue con el firmware anterior.`, 'ota');
      onProgress({ sent: bin.length, total: bin.length, confirmed: bin.length, bytesPerSec: 0 });
    } finally {
      this.updating = false;
      this.otaListener = null;
    }
  }

  // ---------- Internos ----------
  private updateImuResets(n: number): void {
    const prev = this.imuResets;
    this.imuResets = n;
    if (prev !== null && n > prev) for (const l of this.sensorResetListeners) l(n);
  }

  private cleanup(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.transport = null;
    this.sampleValue = null;
    this.led = INITIAL_LED_STATE;
    this.arrivals = [];
    this.lastSeq = null;
    this.lost = 0;
    this.invalidLines = 0;
    this.imuResets = null;
  }

  private update(p: Partial<LinkSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...p };
    for (const l of this.changeListeners) l(this.snapshot);
  }

  private onStatus(t: CubeTransport, s: LinkStatus, detail?: string): void {
    if (t !== this.transport) return;
    if (s === 'reconnecting' || s === 'disconnected') {
      this.led = ledLinkLost(this.led, performance.now());
      this.sampleValue = null;
    }
    this.update({ status: s, detail: detail ?? null, deviceName: t.deviceName });
    if (s === 'connected') void this.handshake();
  }

  private async handshake(): Promise<void> {
    // 1) ¿Qué firmware es? El original responde {"t":"err","cmd":"INFO"}.
    const info = await new Promise<{ caps: Capability[]; fw: number | null }>((resolve) => {
      const timer = setTimeout(() => done(null, null), INFO_TIMEOUT_MS);
      const done = (caps: Capability[] | null, fw: number | null) => {
        clearTimeout(timer);
        this.infoWaiter = null;
        resolve({ caps: caps ?? [], fw: fw ?? 1 });
      };
      this.infoWaiter = done;
      this.transport?.send({ type: 'INFO' }).catch(() => done(null, null));
    });
    this.update({ caps: info.caps, fw: info.fw });
    // 2) Configuración de juego.
    await this.send({ type: 'MODE', mode: GAME_COLOR_MODE }).catch(() => false);
    await this.send({ type: 'BRI', value: this.prefs.brightness }).catch(() => false);
    if (this.prefs.faceMapConfirmed && isValidFaceMap(this.prefs.faceAxes)) {
      await this.send({ type: 'FMAP', axes: this.prefs.faceAxes }).catch(() => false);
    }
    await this.send({ type: 'TARGET', rgb: null }).catch(() => false);
    await this.send({ type: 'ANIM', anim: 'IDLE' }).catch(() => false);
  }

  private onMessage(m: CubeMessage, at: number): void {
    switch (m.t) {
      case 'd': {
        const s: CubeSample = {
          up: m.up,
          roll: m.roll,
          pitch: m.pitch,
          yaw: m.yaw,
          reportedRgb: m.rgb,
          playerRgb: orientationToColor(m.up, m.mode),
          mode: m.mode,
          btn: m.btn,
          at,
        };
        this.sampleValue = s;
        this.arrivals.push(at);
        if (this.arrivals.length > 120) this.arrivals.splice(0, this.arrivals.length - 120);
        if (m.seq !== null) {
          // Secuencia cíclica 0–9: cuenta los saltos (pérdidas de hasta 9 seguidas).
          if (this.lastSeq !== null) this.lost += (m.seq - this.lastSeq - 1 + 10) % 10;
          this.lastSeq = m.seq;
        }
        if (m.imuResets !== null) this.updateImuResets(m.imuResets);
        for (const l of this.sampleListeners) l(s);
        return;
      }
      case 's':
        this.updateImuResets(m.imuResets);
        return;
      case 'btn':
        for (const l of this.buttonListeners) l(m.ev, at);
        return;
      case 'info':
        this.infoWaiter?.(m.caps.slice(), m.fw);
        return;
      case 'err':
        if (m.cmd === 'INFO') this.infoWaiter?.([], 1);
        return;
      case 'ota':
        this.otaListener?.(m);
        return;
      default:
        return;
    }
  }
}

export { DEFAULT_FACE_AXES };
