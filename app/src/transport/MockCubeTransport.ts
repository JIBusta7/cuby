/**
 * Cubo simulado. Se comporta como el firmware: misma calibración neutral,
 * mismo filtro de gravedad, mismo formato de paquetes JSON (que pasan por el
 * mismo parser que los del cubo real) y mismas respuestas a los comandos.
 *
 * La orientación la controla la UI (arrastrando el cubo 3D o con el teclado).
 */
import { orientationToColor } from '../core/color/colorMap';
import type { ColorModeId, RGB, Vec3 } from '../core/color/types';
import { encodeCommand, type CubeCommand } from '../core/protocol/commands';
import { encodeCompact, parseMessage } from '../core/protocol/messages';
import { IDENTITY_QUAT, normalize, upFromQuat, type Quat } from '../core/orientation/frames';
import { applyMat3, IDENTITY_MAT3, neutralRotation, type Mat3 } from '../core/orientation/neutral';
import { ListenerSet, TransportError, type CubeTransport, type TransportListener } from './types';

const SENSOR_HZ = 100;
const DATA_HZ = 30; // como el firmware v2 (BLE_INTERVAL_MS = 33)
const GRAVITY_SMOOTHING = 0.15; // config.h
const NOISE = 0.003; // ruido del acelerómetro, en g

function gaussian(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

export class MockCubeTransport implements CubeTransport {
  readonly kind = 'mock' as const;
  readonly deviceName = 'Cubo simulado';

  private readonly listeners = new ListenerSet();
  private connected = false;
  private timers: ReturnType<typeof setInterval>[] = [];

  /** Orientación verdadera del cubo simulado (marco three, cubo → mundo). */
  private q: Quat = IDENTITY_QUAT;
  private upRaw: Vec3 = { x: 0, y: 0, z: 1 };
  private neutral: Mat3 = IDENTITY_MAT3;
  private mode: ColorModeId = 0;
  private buttonDown = false;
  private seq = 0;

  constructor(private readonly opts: { connectDelayMs?: number; latencyMs?: number; noise?: boolean } = {}) {}

  subscribe(l: TransportListener): () => void {
    return this.listeners.add(l);
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.listeners.status('connecting');
    await new Promise((r) => setTimeout(r, this.opts.connectDelayMs ?? 350));
    this.connected = true;
    this.timers = [
      setInterval(() => this.sensorTick(), 1000 / SENSOR_HZ),
      setInterval(() => this.emitData(), 1000 / DATA_HZ),
      setInterval(() => this.emitLine('{"t":"s","ie":0,"fw":2}'), 1000),
    ];
    this.listeners.status('connected');
  }

  async disconnect(): Promise<void> {
    this.timers.forEach(clearInterval);
    this.timers = [];
    if (!this.connected) return;
    this.connected = false;
    this.listeners.status('disconnected');
  }

  async send(cmd: CubeCommand): Promise<void> {
    if (!this.connected) throw new TransportError('El cubo simulado no está conectado', 'not-connected');
    const line = encodeCommand(cmd); // se valida igual que lo que va al cubo real
    await this.delay();
    this.handle(cmd, line);
  }

  // ---------- Actualización simulada (para probar la interfaz) ----------
  private otaLeft = 0;
  private otaDone = 0;
  private otaReport = 0;

  async writeRaw(data: Uint8Array): Promise<void> {
    if (!this.connected) throw new TransportError('El cubo simulado no está conectado', 'not-connected');
    await new Promise((r) => setTimeout(r, 1));
    if (this.otaLeft <= 0) return;
    this.otaLeft -= data.length;
    this.otaDone += data.length;
    if (this.otaDone - this.otaReport >= 8192 || this.otaLeft <= 0) {
      this.otaReport = this.otaDone;
      this.emitLine(JSON.stringify({ t: 'ota', n: this.otaDone }));
    }
    if (this.otaLeft <= 0) {
      this.emitLine('{"t":"ota","done":1}');
      // Como el cubo real: se reinicia y vuelve a aparecer.
      setTimeout(() => {
        this.listeners.status('reconnecting');
        setTimeout(() => this.listeners.status('connected'), 1200);
      }, 300);
    }
  }

  sendLatest(cmd: CubeCommand): boolean {
    if (!this.connected) return false;
    encodeCommand(cmd);
    return true; // los cuadros de audio solo afectan a los LEDs (espejo en CubeLink)
  }

  // ---------- Controles del simulador ----------
  getOrientation(): Quat {
    return this.q;
  }

  setOrientation(q: Quat): void {
    const l = Math.hypot(...q) || 1;
    this.q = [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  }

  /** Gira el cubo simulado alrededor de un eje del mundo (marco three), en radianes. */
  rotateWorld(axis: Vec3, angle: number): void {
    const l = Math.hypot(axis.x, axis.y, axis.z) || 1;
    const h = angle / 2;
    const sh = Math.sin(h) / l;
    const d: Quat = [axis.x * sh, axis.y * sh, axis.z * sh, Math.cos(h)];
    const [ax, ay, az, aw] = d;
    const [bx, by, bz, bw] = this.q;
    this.setOrientation([
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ]);
  }

  resetOrientation(): void {
    this.q = IDENTITY_QUAT;
  }

  pressButton(ev: 'short' | 'long'): void {
    if (!this.connected) return;
    this.buttonDown = false;
    this.emitLine(JSON.stringify({ t: 'btn', ev, rgb: [...this.currentRgb()] }));
    if (ev === 'long') this.calibrate();
  }

  // ---------- Internos ----------
  private delay(): Promise<void> {
    const ms = this.opts.latencyMs ?? 8;
    return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  }

  private sensorTick(): void {
    const g = upFromQuat(this.q);
    const n = this.opts.noise === false ? 0 : NOISE;
    const a = normalize({ x: g.x + n * gaussian(), y: g.y + n * gaussian(), z: g.z + n * gaussian() });
    this.upRaw = {
      x: this.upRaw.x + GRAVITY_SMOOTHING * (a.x - this.upRaw.x),
      y: this.upRaw.y + GRAVITY_SMOOTHING * (a.y - this.upRaw.y),
      z: this.upRaw.z + GRAVITY_SMOOTHING * (a.z - this.upRaw.z),
    };
  }

  private up(): Vec3 {
    return normalize(applyMat3(this.neutral, this.upRaw));
  }

  /** Como el firmware v2: "rgb" es siempre el color del jugador, aunque los LEDs muestren otra cosa. */
  private currentRgb(): RGB {
    return orientationToColor(this.up(), this.mode);
  }

  /** Mismo formato que el firmware v2 por BLE: lectura compacta en una notificación. */
  private emitData(): void {
    this.emitLine(encodeCompact(this.up(), this.seq, this.buttonDown, this.mode));
    this.seq = (this.seq + 1) % 10;
  }

  private emitLine(line: string): void {
    if (!this.connected) return;
    const msg = parseMessage(line);
    if (msg) this.listeners.message(msg, performance.now());
  }

  private ack(name: string, ok = true): void {
    this.emitLine(JSON.stringify({ t: ok ? 'ack' : 'err', cmd: name }));
  }

  private calibrate(): void {
    this.neutral = neutralRotation(this.upRaw);
    this.emitLine('{"t":"cal"}');
  }

  private handle(cmd: CubeCommand, line: string): void {
    const name = line.split(' ')[0] ?? cmd.type;
    switch (cmd.type) {
      case 'PING':
        this.emitLine('{"t":"pong"}');
        return;
      case 'INFO':
        this.emitLine('{"t":"info","fw":3,"caps":["anim","target","fmap","show","ota"]}');
        return;
      case 'OTA':
        this.otaLeft = cmd.size;
        this.otaDone = 0;
        this.otaReport = 0;
        this.emitLine('{"t":"ota","ready":1}');
        return;
      case 'CAL':
        this.calibrate();
        break;
      case 'MODE':
        this.mode = cmd.mode;
        break;
      default:
        break; // BRI, COLOR, AUTO, ANIM, TARGET, LIGHT, FMAP: solo afectan a los LEDs (espejo en CubeLink)
    }
    this.ack(name);
  }
}
